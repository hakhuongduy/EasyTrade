import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

const ROUTER_ABI = [
  "function getOracleUpdateFee(bytes[]) view returns (uint256)",
  "function increasePositionForWithPermitAndPriceUpdate(address account,string symbol,uint256 amountIn,uint256 sizeDelta,bool isLong,bytes[] priceUpdateData,uint256 permitDeadline,uint8 v,bytes32 r,bytes32 s) payable",
];

const EUSD_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
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

function friendlyOpenError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error ?? "");
  const lower = text.toLowerCase();
  if (
    lower.includes("erc20insufficientbalance")
    || lower.includes("insufficient balance")
    || lower.includes("transfer amount exceeds balance")
  ) {
    return "Ví không đủ eUSD để mở lệnh. Hãy giảm ký quỹ hoặc nhận thêm eUSD.";
  }
  if (
    lower.includes("erc20insufficientallowance")
    || lower.includes("insufficient allowance")
    || lower.includes("invalid permit")
  ) {
    return "Chữ ký cấp quyền eUSD không hợp lệ hoặc đã hết hạn. Hãy thử mở lệnh lại.";
  }
  if (lower.includes("invalidleverage")) {
    return "Đòn bẩy vượt mức cho phép. Hãy giảm đòn bẩy hoặc tăng ký quỹ.";
  }
  if (lower.includes("insufficientpoolliquidity")) {
    return "Pool eUSD không đủ thanh khoản để mở lệnh này.";
  }
  if (lower.includes("transaction execution reverted") || lower.includes("call_exception")) {
    return "Không thể mở lệnh. Kiểm tra số dư eUSD, ký quỹ và thử lại.";
  }
  return text.slice(0, 160);
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
    const tokenAddress = process.env.NEXT_PUBLIC_EUSD_ADDRESS;
    if (!tokenAddress) {
      return NextResponse.json({ success: false, error: "eUSD chua duoc cau hinh" }, { status: 500 });
    }
    const token = new ethers.Contract(tokenAddress, EUSD_ABI, provider);
    const balance = await token.balanceOf(account) as bigint;
    if (balance < collateralWei) {
      return NextResponse.json({
        success: false,
        error: `Ví không đủ eUSD. Cần ${ethers.formatEther(collateralWei)} eUSD, hiện có ${ethers.formatEther(balance)} eUSD.`,
      }, { status: 400 });
    }
    const allowance = await token.allowance(account, routerAddress) as bigint;
    if (allowance < collateralWei && permit.deadline < Math.floor(Date.now() / 1000)) {
      return NextResponse.json({
        success: false,
        error: "Chữ ký cấp quyền eUSD đã hết hạn. Hãy thử mở lệnh lại.",
      }, { status: 400 });
    }

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
    const message = friendlyOpenError(error);
    console.error("[trade/open]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
