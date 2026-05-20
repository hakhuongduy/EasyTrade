import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { getEnabledPairRegistry } from "@/lib/pairs";

const PYTH_ORACLE_ABI = [
  "function getUpdateFee(bytes[] calldata updateData) external view returns (uint256)",
  "function updatePriceFeeds(bytes[] calldata updateData) external payable",
];

async function fetchPythUpdate(pairs: Array<{ symbol: string; pythFeedId: string }>) {
  const params = new URLSearchParams({ encoding: "hex", parsed: "true" });
  for (const pair of pairs) params.append("ids[]", pair.pythFeedId);

  const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${params.toString()}`, {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Hermes ${res.status}`);

  const data = (await res.json()) as {
    binary?: { data?: string[] };
    parsed?: Array<{ id: string; price: { price: string; expo: number } }>;
  };
  return {
    updateData: (data.binary?.data ?? []).map((hex) => `0x${hex}`),
    parsed: data.parsed ?? [],
  };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pairs = await getEnabledPairRegistry();
    const { updateData, parsed } = await fetchPythUpdate(pairs);

    const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
    const wallet = new ethers.Wallet(process.env.KEEPER_PRIVATE_KEY!, provider);
    const oracle = new ethers.Contract(process.env.NEXT_PUBLIC_ORACLE_ADDRESS!, PYTH_ORACLE_ABI, wallet);

    const fee = await oracle.getUpdateFee(updateData) as bigint;
    const tx = await oracle.updatePriceFeeds(updateData, { value: fee }) as {
      hash: string;
      wait: () => Promise<unknown>;
    };
    await tx.wait();

    const prices: Record<string, number> = {};
    for (const item of parsed) {
      const pair = pairs.find((entry) => entry.pythFeedId === item.id);
      if (pair) prices[pair.symbol] = Number(item.price.price) * Math.pow(10, item.price.expo);
    }

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      fee: fee.toString(),
      prices,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Keeper] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
