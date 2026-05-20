import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { getActivePendingOpenOrders, savePendingOrder, updateOpenOrderStatus } from "@/lib/orders";
import { getPairRegistry } from "@/lib/pairs";

const ROUTER_ABI = [
  "function getOracleUpdateFee(bytes[]) view returns (uint256)",
  "function increasePositionForWithPermitAndPriceUpdate(address account,string symbol,uint256 amountIn,uint256 sizeDelta,bool isLong,bytes[] priceUpdateData,uint256 permitDeadline,uint8 v,bytes32 r,bytes32 s) payable",
];

type PythParsed = {
  id?: string;
  price?: {
    price?: string;
    expo?: number;
  };
};

async function getPythPrices(symbols: string[]) {
  const registry = await getPairRegistry();
  const feedBySymbol = new Map(registry.map((pair) => [pair.symbol, pair.pythFeedId]));
  const unique = [...new Set(symbols)];
  if (unique.length === 0) return new Map<string, number>();

  const params = new URLSearchParams({ encoding: "hex", parsed: "true" });
  for (const symbol of unique) {
    const feedId = feedBySymbol.get(symbol);
    if (feedId) params.append("ids[]", feedId);
  }

  const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${params.toString()}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(2_000),
  });
  if (!res.ok) throw new Error(`Pyth ${res.status}`);

  const data = await res.json() as { parsed?: PythParsed[] };
  const byFeed = new Map((data.parsed ?? []).map((item) => [item.id?.toLowerCase(), item]));
  return new Map(unique.map((symbol) => {
    const feedId = feedBySymbol.get(symbol);
    const item = feedId ? byFeed.get(feedId.toLowerCase()) : undefined;
    const price = Number(item?.price?.price ?? 0) * 10 ** (item?.price?.expo ?? 0);
    return [symbol, Number.isFinite(price) ? price : 0];
  }));
}

async function fetchPyth(origin: string, symbol: string) {
  const pythRes = await fetch(`${origin}/api/pyth?symbols=${encodeURIComponent(symbol)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(4_000),
  });
  const pyth = await pythRes.json() as { success?: boolean; updateData?: string[]; error?: string };
  if (!pythRes.ok || !pyth.success || !pyth.updateData) {
    throw new Error(pyth.error ?? "Khong lay duoc gia Pyth");
  }
  return pyth.updateData;
}

export async function GET(req: NextRequest) {
  try {
    const account = new URL(req.url).searchParams.get("account") ?? undefined;
    const orders = await getActivePendingOpenOrders(account);
    if (orders.length === 0) return NextResponse.json({ success: true, checked: 0, executed: 0 });

    const prices = await getPythPrices(orders.map((order) => order.symbol));
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
    const privateKey = process.env.KEEPER_PRIVATE_KEY;
    const routerAddress = process.env.NEXT_PUBLIC_ROUTER_ADDRESS;
    if (!rpcUrl || !privateKey || !routerAddress) {
      return NextResponse.json({ success: false, error: "Limit keeper chua duoc cau hinh" }, { status: 500 });
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const router = new ethers.Contract(routerAddress, ROUTER_ABI, wallet);
    const origin = new URL(req.url).origin;
    const executed: string[] = [];
    const errors: string[] = [];

    for (const order of orders) {
      if (!order.id) continue;
      const currentPrice = prices.get(order.symbol);
      if (!currentPrice) continue;

      const hitLimit = order.isLong ? currentPrice <= order.limitPrice : currentPrice >= order.limitPrice;
      if (!hitLimit) continue;

      if (Math.floor(Date.now() / 1000) > order.permit.deadline) {
        await updateOpenOrderStatus(order.id, "cancelled");
        continue;
      }

      try {
        const updateData = await fetchPyth(origin, order.symbol);
        const updateFee = await router.getOracleUpdateFee(updateData) as bigint;
        const tx = await router.increasePositionForWithPermitAndPriceUpdate(
          order.account,
          order.symbol,
          BigInt(order.collateralWei),
          BigInt(order.sizeWei),
          order.isLong,
          updateData,
          order.permit.deadline,
          order.permit.v,
          order.permit.r,
          order.permit.s,
          { value: updateFee, gasLimit: 1_000_000n }
        ) as { hash: string; wait: () => Promise<unknown> };
        await tx.wait();

        if (order.tp !== null || order.sl !== null) {
          await savePendingOrder({
            account: order.account,
            symbol: order.symbol,
            isLong: order.isLong,
            tp: order.tp,
            sl: order.sl,
            sizeDelta: 0,
            status: "active",
          });
        }

        await updateOpenOrderStatus(order.id, "executed", tx.hash);
        executed.push(order.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        errors.push(`${order.id}: ${message.slice(0, 120)}`);
      }
    }

    return NextResponse.json({
      success: true,
      checked: orders.length,
      executed: executed.length,
      executedIds: executed,
      errors,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Limit keeper failed";
    console.error("[limit-orders]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
