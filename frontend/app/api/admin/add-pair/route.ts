import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

// Admin API: thêm asset mới vào PriceOracle on-chain.
// Chỉ Admin Dashboard mới gọi endpoint này (không cần CRON_SECRET).

const ORACLE_ABI = [
  "function addAsset(string calldata _symbol, bytes32 _priceFeedId) external",
  "function isAssetSupported(string calldata _symbol) external view returns (bool)",
];

export async function POST(req: NextRequest) {
  try {
    const { symbol, priceFeedId } = await req.json() as { symbol: string; priceFeedId: string };
    const normalizedFeedId = priceFeedId?.startsWith("0x") ? priceFeedId : `0x${priceFeedId ?? ""}`;

    if (!symbol || !/^0x[0-9a-fA-F]{64}$/.test(normalizedFeedId)) {
      return NextResponse.json({ success: false, error: "symbol và priceFeedId Pyth là bắt buộc" }, { status: 400 });
    }

    const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
    const wallet   = new ethers.Wallet(process.env.KEEPER_PRIVATE_KEY!, provider);
    const oracle   = new ethers.Contract(process.env.NEXT_PUBLIC_ORACLE_ADDRESS!, ORACLE_ABI, wallet);

    // Kiểm tra xem asset đã tồn tại chưa
    const isSupported = await oracle.isAssetSupported(symbol) as boolean;
    if (isSupported) {
      return NextResponse.json({ success: true, alreadyExists: true, symbol, priceFeedId: normalizedFeedId });
    }

    const tx = await oracle.addAsset(symbol, normalizedFeedId) as { hash: string; wait: () => Promise<unknown> };
    await tx.wait();

    console.log(`[Admin] Added ${symbol} with Pyth feed ${priceFeedId}. Tx: ${tx.hash}`);

    return NextResponse.json({
      success: true,
      symbol,
      priceFeedId: normalizedFeedId,
      txHash: tx.hash,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Admin add-pair]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
