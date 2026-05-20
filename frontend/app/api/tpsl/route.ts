import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { getActivePendingOrders, updateOrderStatus } from "@/lib/orders";
import { getPythFeedIds } from "@/lib/pyth";

const ROUTER_ABI = [
  "function getOracleUpdateFee(bytes[] calldata updateData) external view returns (uint256)",
  "function getPosition(address account,string symbol,bool isLong) view returns (uint256 size,uint256 collateral,uint256 averagePrice,bool isLongPosition,uint256 lastUpdated)",
  "function decreasePositionForWithPriceUpdate(address, string, uint256, uint256, bool, address, bytes[] calldata) external payable",
];

async function fetchPythUpdate(symbols: string[]) {
  const feedIds = await getPythFeedIds();
  const uniqueSymbols = [...new Set(symbols)].filter((s) => feedIds[s]);
  const params = new URLSearchParams({ encoding: "hex", parsed: "true" });
  for (const symbol of uniqueSymbols) params.append("ids[]", feedIds[symbol]);

  const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${params.toString()}`, {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Hermes ${res.status}`);

  const data = (await res.json()) as {
    binary?: { data?: string[] };
    parsed?: Array<{ id: string; price: { price: string; expo: number } }>;
  };

  const prices: Record<string, number> = {};
  for (const item of data.parsed ?? []) {
    const symbol = uniqueSymbols.find((s) => feedIds[s] === item.id);
    if (symbol) prices[symbol] = Number(item.price.price) * Math.pow(10, item.price.expo);
  }

  return {
    updateData: (data.binary?.data ?? []).map((hex) => `0x${hex}`),
    prices,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const account = searchParams.get("account");
  const isClientAccountCheck = account && ethers.isAddress(account);
  const authHeader = req.headers.get("authorization");
  if (!isClientAccountCheck && process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const allOrders = await getActivePendingOrders();
    const orders = isClientAccountCheck
      ? allOrders.filter((order) => order.account.toLowerCase() === account.toLowerCase())
      : allOrders;
    if (orders.length === 0) {
      return NextResponse.json({ success: true, checked: 0, executed: 0 });
    }

    const { updateData, prices } = await fetchPythUpdate(orders.map((o) => o.symbol));

    const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
    const wallet = new ethers.Wallet(process.env.KEEPER_PRIVATE_KEY!, provider);
    const router = new ethers.Contract(process.env.NEXT_PUBLIC_ROUTER_ADDRESS!, ROUTER_ABI, wallet);

    const executed: string[] = [];
    const errors: string[] = [];

    for (const order of orders) {
      const currentPrice = prices[order.symbol];
      if (!currentPrice || !order.id) continue;

      const hitTP = order.tp !== null && (order.isLong ? currentPrice >= order.tp : currentPrice <= order.tp);
      const hitSL = order.sl !== null && (order.isLong ? currentPrice <= order.sl : currentPrice >= order.sl);
      if (!hitTP && !hitSL) continue;

      const reason = hitTP ? "TP" : "SL";
      try {
        const [size, collateral] = await router.getPosition(order.account, order.symbol, order.isLong) as [bigint, bigint, bigint, boolean, bigint];
        if (size === BigInt(0)) {
          await updateOrderStatus(order.id, "executed");
          continue;
        }

        const requestedSizeDelta = order.sizeDelta > 0 ? ethers.parseEther(String(order.sizeDelta)) : size;
        const sizeDeltaWei = requestedSizeDelta >= size ? size : requestedSizeDelta;
        const collateralDeltaWei = sizeDeltaWei === size ? collateral : BigInt(0);
        const fee = await router.getOracleUpdateFee(updateData) as bigint;

        const tx = await router.decreasePositionForWithPriceUpdate(
          order.account,
          order.symbol,
          collateralDeltaWei,
          sizeDeltaWei,
          order.isLong,
          order.account,
          updateData,
          { value: fee, gasLimit: 900_000n }
        ) as { hash: string; wait: () => Promise<unknown> };
        await tx.wait();

        await updateOrderStatus(order.id, "executed", tx.hash);
        executed.push(`${order.id}(${reason})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        errors.push(`${order.id}: ${msg.slice(0, 80)}`);
      }
    }

    return NextResponse.json({
      success: true,
      checked: orders.length,
      executed: executed.length,
      executedIds: executed,
      errors,
      prices,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[TPSL] Fatal:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
