import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

const ROUTER_ABI = [
  "function getOracleUpdateFee(bytes[]) view returns (uint256)",
  "function getPosition(address account,string symbol,bool isLong) view returns (uint256 size,uint256 collateral,uint256 averagePrice,bool isLongPosition,uint256 lastUpdated)",
  "function decreasePositionForWithPriceUpdate(address account,string symbol,uint256 collateralDelta,uint256 sizeDelta,bool isLong,address receiver,bytes[] priceUpdateData) payable",
];

type CloseRequest = {
  account?: string;
  symbol?: string;
  isLong?: boolean;
  deadline?: number;
  signature?: string;
};

type PythParsed = {
  id?: string;
  price?: {
    price?: string;
    expo?: number;
  };
};

function closeMessage(account: string, symbol: string, isLong: boolean, deadline: number) {
  return `EasyTrade close position\naccount=${account.toLowerCase()}\nsymbol=${symbol}\nside=${isLong ? "LONG" : "SHORT"}\ndeadline=${deadline}`;
}

function hasRevertSelector(error: unknown, selector: string, seen = new WeakSet<object>()): boolean {
  if (typeof error === "string") return error.includes(selector);
  if (!error || typeof error !== "object") return false;
  if (error instanceof Error && error.message.includes(selector)) return true;
  if (seen.has(error)) return false;
  seen.add(error);

  for (const value of Object.values(error as Record<string, unknown>)) {
    if (hasRevertSelector(value, selector, seen)) return true;
  }
  return false;
}

function parsePythPrice(parsed: PythParsed[] | undefined) {
  const raw = Number(parsed?.[0]?.price?.price ?? 0);
  const expo = parsed?.[0]?.price?.expo ?? 0;
  const price = raw * 10 ** expo;
  return Number.isFinite(price) ? price : 0;
}

function calcPnl(size: bigint, averagePrice: bigint, exitPrice: number, isLong: boolean) {
  const sizeUsd = Number(ethers.formatEther(size));
  const entryPrice = Number(ethers.formatUnits(averagePrice, 8));
  if (!sizeUsd || !entryPrice || !exitPrice) return 0;
  const priceDelta = isLong ? exitPrice - entryPrice : entryPrice - exitPrice;
  return (sizeUsd * priceDelta) / entryPrice;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as CloseRequest;
    const account = body.account;
    const symbol = body.symbol?.trim().toUpperCase();

    if (!account || !ethers.isAddress(account) || !symbol || typeof body.isLong !== "boolean" || !body.deadline || !body.signature) {
      return NextResponse.json({ success: false, error: "Thong tin dong lenh khong hop le" }, { status: 400 });
    }
    if (Math.floor(Date.now() / 1000) > body.deadline) {
      return NextResponse.json({ success: false, error: "Chu ky dong lenh da het han" }, { status: 400 });
    }

    const recovered = ethers.verifyMessage(closeMessage(account, symbol, body.isLong, body.deadline), body.signature);
    if (recovered.toLowerCase() !== account.toLowerCase()) {
      return NextResponse.json({ success: false, error: "Chu ky dong lenh khong hop le" }, { status: 401 });
    }

    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
    const privateKey = process.env.KEEPER_PRIVATE_KEY;
    const routerAddress = process.env.NEXT_PUBLIC_ROUTER_ADDRESS;
    if (!rpcUrl || !privateKey || !routerAddress) {
      return NextResponse.json({ success: false, error: "Trade relayer chua duoc cau hinh" }, { status: 500 });
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const router = new ethers.Contract(routerAddress, ROUTER_ABI, wallet);
    const [size, collateral, averagePrice] = await router.getPosition(account, symbol, body.isLong) as [bigint, bigint, bigint, boolean, bigint];
    if (size === BigInt(0)) {
      return NextResponse.json({ success: true, alreadyClosed: true });
    }

    const sizeUsd = Number(ethers.formatEther(size));
    const collateralUsd = Number(ethers.formatEther(collateral));
    const entryPrice = Number(ethers.formatUnits(averagePrice, 8));

    const pythRes = await fetch(`${new URL(req.url).origin}/api/pyth?symbols=${encodeURIComponent(symbol)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    const pyth = await pythRes.json() as { success?: boolean; updateData?: string[]; parsed?: PythParsed[]; error?: string };
    if (!pythRes.ok || !pyth.success || !pyth.updateData) {
      return NextResponse.json({ success: false, error: pyth.error ?? "Khong lay duoc gia Pyth" }, { status: 502 });
    }

    const updateFee = await router.getOracleUpdateFee(pyth.updateData) as bigint;
    const exitPrice = parsePythPrice(pyth.parsed);
    const pnl = calcPnl(size, averagePrice, exitPrice, body.isLong);

    const tx = await router.decreasePositionForWithPriceUpdate(
      account,
      symbol,
      collateral,
      size,
      body.isLong,
      account,
      pyth.updateData,
      { value: updateFee, gasLimit: 900_000n }
    ) as { hash: string; wait: () => Promise<unknown> };
    await tx.wait();

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      closedPosition: {
        account,
        symbol,
        isLong: body.isLong,
        entryPrice,
        exitPrice,
        size: sizeUsd,
        collateral: collateralUsd,
        pnl,
      },
    });
  } catch (error: unknown) {
    if (hasRevertSelector(error, "0x6ec9be11")) {
      return NextResponse.json({ success: true, alreadyClosed: true });
    }

    const message = error instanceof Error ? error.message : "Close trade failed";
    console.error("[trade/close]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
