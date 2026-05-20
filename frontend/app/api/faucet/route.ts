import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

const EUSD_ABI = [
  "function faucetFor(address _user) external",
  "function faucetCooldownRemaining(address _user) external view returns (uint256)",
];

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json() as { address?: string };
    if (!address || !ethers.isAddress(address)) {
      return NextResponse.json({ success: false, error: "Dia chi vi khong hop le" }, { status: 400 });
    }

    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
    const privateKey = process.env.KEEPER_PRIVATE_KEY;
    const tokenAddress = process.env.NEXT_PUBLIC_EUSD_ADDRESS;
    if (!rpcUrl || !privateKey || !tokenAddress) {
      return NextResponse.json({ success: false, error: "Faucet relayer chua duoc cau hinh" }, { status: 500 });
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const token = new ethers.Contract(tokenAddress, EUSD_ABI, wallet);

    const cooldown = await token.faucetCooldownRemaining(address) as bigint;
    if (cooldown > 0n) {
      return NextResponse.json({
        success: true,
        alreadyClaimed: true,
        cooldownSeconds: Number(cooldown),
      });
    }

    const tx = await token.faucetFor(address) as { hash: string };

    return NextResponse.json({ success: true, txHash: tx.hash, pending: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Faucet failed";
    console.error("[faucet]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
