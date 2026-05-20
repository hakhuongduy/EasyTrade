import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

const ROUTER_ABI = [
  "function getOracleUpdateFee(bytes[]) view returns (uint256)",
  "function increasePositionForWithPermitAndPriceUpdate(address account,string symbol,uint256 amountIn,uint256 sizeDelta,bool isLong,bytes[] priceUpdateData,uint256 permitDeadline,uint8 v,bytes32 r,bytes32 s) payable",
];

type OpenRequest = {
  account?: string;
  symbol?: string;
  collateralWei?: string;
  sizeWei?: string;
  isLong?: boolean;
  permit?: {
    value?: string;
    deadline?: number;
    v?: number;
    r?: string;
    s?: string;
  };
};

type PythParsed = {
  id?: string;
  price?: {
    price?: string;
    expo?: number;
  };
};

function parsePythPrice(parsed: PythParsed[] | undefined) {
  const raw = Number(parsed?.[0]?.price?.price ?? 0);
  const expo = parsed?.[0]?.price?.expo ?? 0;
  const price = raw * 10 ** expo;
  return Number.isFinite(price) ? price : 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as OpenRequest;
    const account = body.account;
    const symbol = body.symbol?.trim().toUpperCase();
    const collateralWei = BigInt(body.collateralWei ?? "0");
    const sizeWei = BigInt(body.sizeWei ?? "0");
    const permit = body.permit;

    if (!account || !ethers.isAddress(account) || !symbol || collateralWei <= 0n || sizeWei <= 0n || typeof body.isLong !== "boolean") {
      return NextResponse.json({ success: false, error: "Thong tin lenh khong hop le" }, { status: 400 });
    }
    if (!permit?.value || !permit.deadline || !permit.v || !permit.r || !permit.s) {
      return NextResponse.json({ success: false, error: "Thieu permit signature" }, { status: 400 });
    }
    if (BigInt(permit.value) !== collateralWei) {
      return NextResponse.json({ success: false, error: "Permit value khong khop collateral" }, { status: 400 });
    }

    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
    const privateKey = process.env.KEEPER_PRIVATE_KEY;
    const routerAddress = process.env.NEXT_PUBLIC_ROUTER_ADDRESS;
    if (!rpcUrl || !privateKey || !routerAddress) {
      return NextResponse.json({ success: false, error: "Trade relayer chua duoc cau hinh" }, { status: 500 });
    }

    const pythRes = await fetch(`${new URL(req.url).origin}/api/pyth?symbols=${encodeURIComponent(symbol)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    const pyth = await pythRes.json() as { success?: boolean; updateData?: string[]; parsed?: PythParsed[]; error?: string };
    if (!pythRes.ok || !pyth.success || !pyth.updateData) {
      return NextResponse.json({ success: false, error: pyth.error ?? "Khong lay duoc gia Pyth" }, { status: 502 });
    }
    const executionPrice = parsePythPrice(pyth.parsed);

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const router = new ethers.Contract(routerAddress, ROUTER_ABI, wallet);

    const updateFee = await router.getOracleUpdateFee(pyth.updateData) as bigint;
    const tx = await router.increasePositionForWithPermitAndPriceUpdate(
      account,
      symbol,
      collateralWei,
      sizeWei,
      body.isLong,
      pyth.updateData,
      permit.deadline,
      permit.v,
      permit.r,
      permit.s,
      { value: updateFee, gasLimit: 1_000_000n }
    ) as { hash: string; wait: () => Promise<unknown> };
    await tx.wait();

    return NextResponse.json({ success: true, txHash: tx.hash, executionPrice });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Open trade failed";
    console.error("[trade/open]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
