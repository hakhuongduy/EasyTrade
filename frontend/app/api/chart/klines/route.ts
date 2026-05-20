import { NextRequest, NextResponse } from "next/server";

const ALLOWED_INTERVALS = new Set(["5m", "1h", "8h", "1d", "3d", "1w"]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  const interval = searchParams.get("interval") ?? "5m";
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") ?? 180)));

  if (!/^[A-Z0-9]{2,30}$/.test(symbol)) {
    return NextResponse.json({ success: false, error: "Invalid symbol" }, { status: 400 });
  }
  if (!ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json({ success: false, error: "Invalid interval" }, { status: 400 });
  }

  const params = new URLSearchParams({
    symbol,
    interval,
    limit: String(limit),
  });

  try {
    const res = await fetch(`https://api.binance.com/api/v3/klines?${params.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({
        success: false,
        error: typeof data?.msg === "string" ? data.msg : "Cannot load Binance candles",
      }, { status: res.status });
    }

    return NextResponse.json({ success: true, candles: data }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cannot load candles";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
