import { NextResponse } from "next/server";
import { getEnabledPairRegistry, type PairConfig } from "@/lib/pairs";

type PythParsedPrice = {
  id?: string;
  price?: {
    price?: string;
    expo?: number;
  };
};

let priceCache: Array<{ symbol: string; price: number; change24h: number }> | null = null;

function fallback(pair: PairConfig) {
  return {
    symbol: pair.symbol,
    price: pair.fallbackPrice,
    change24h: pair.fallbackChange24h,
  };
}

async function fetchFromPyth(pairs: PairConfig[]) {
  const params = new URLSearchParams({ encoding: "hex", parsed: "true" });
  for (const pair of pairs) params.append("ids[]", pair.pythFeedId);

  const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${params.toString()}`, {
    signal: AbortSignal.timeout(1500),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Pyth ${res.status}`);

  const data = await res.json() as { parsed?: PythParsedPrice[] };
  const byId = new Map((data.parsed ?? []).map((item) => [item.id?.toLowerCase(), item]));

  return pairs.map((pair) => {
    const item = byId.get(pair.pythFeedId.toLowerCase());
    const rawPrice = Number(item?.price?.price ?? 0);
    const expo = item?.price?.expo ?? 0;
    const price = rawPrice * 10 ** expo;
    return {
      symbol: pair.symbol,
      price: Number.isFinite(price) ? price : pair.fallbackPrice,
      change24h: pair.fallbackChange24h,
    };
  });
}

export async function GET() {
  const pairs = await getEnabledPairRegistry();

  try {
    const prices = await fetchFromPyth(pairs);
    priceCache = prices;
    return NextResponse.json({ success: true, prices, pairs, source: "pyth" }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    if (priceCache) {
      return NextResponse.json({ success: true, prices: priceCache, pairs, source: "cache" }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const prices = pairs.map(fallback);
    return NextResponse.json({ success: true, prices, pairs, source: "static" }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
