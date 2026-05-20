import { NextRequest, NextResponse } from "next/server";
import { getPythFeedIds } from "@/lib/pyth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbols = (searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ success: false, error: "symbols is required" }, { status: 400 });
  }

  const feedIds = await getPythFeedIds();
  const ids = symbols.map((symbol) => feedIds[symbol]);
  if (ids.some((id) => !id)) {
    return NextResponse.json({ success: false, error: "Unsupported symbol" }, { status: 400 });
  }

  const params = new URLSearchParams({ encoding: "hex", parsed: "true" });
  for (const id of ids) params.append("ids[]", id);

  try {
    const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${params.toString()}`, {
      signal: AbortSignal.timeout(4_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Hermes ${res.status}`);

    const data = (await res.json()) as {
      binary?: { data?: string[] };
      parsed?: unknown[];
    };

    const updateData = (data.binary?.data ?? []).map((hex) => `0x${hex}`);
    return NextResponse.json({
      success: true,
      symbols,
      updateData,
      parsed: data.parsed ?? [],
      generatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
