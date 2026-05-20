import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export interface PairConfig {
  symbol: string;
  pythFeedId: string;
  binanceSymbol: string;
  enabled: boolean;
  color: string;
  fallbackPrice: number;
  fallbackChange24h: number;
}

export const DEFAULT_PAIRS: PairConfig[] = [
  { symbol: "BTC", pythFeedId: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", binanceSymbol: "BTCUSDT", enabled: true, color: "#f7931a", fallbackPrice: 84000, fallbackChange24h: 0.5 },
  { symbol: "ETH", pythFeedId: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", binanceSymbol: "ETHUSDT", enabled: true, color: "#627eea", fallbackPrice: 1600, fallbackChange24h: 1.2 },
  { symbol: "SOL", pythFeedId: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", binanceSymbol: "SOLUSDT", enabled: true, color: "#9945ff", fallbackPrice: 130, fallbackChange24h: -0.8 },
  { symbol: "BNB", pythFeedId: "2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f", binanceSymbol: "BNBUSDT", enabled: true, color: "#f3ba2f", fallbackPrice: 590, fallbackChange24h: 0.3 },
  { symbol: "XRP", pythFeedId: "ec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8", binanceSymbol: "XRPUSDT", enabled: true, color: "#346aa9", fallbackPrice: 2, fallbackChange24h: -0.2 },
  { symbol: "DOGE", pythFeedId: "dcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c", binanceSymbol: "DOGEUSDT", enabled: true, color: "#c2a633", fallbackPrice: 0.17, fallbackChange24h: 1.5 },
  { symbol: "ADA", pythFeedId: "2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d", binanceSymbol: "ADAUSDT", enabled: true, color: "#0d1e2d", fallbackPrice: 0.65, fallbackChange24h: 0.1 },
  { symbol: "AVAX", pythFeedId: "93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7", binanceSymbol: "AVAXUSDT", enabled: true, color: "#e84142", fallbackPrice: 20, fallbackChange24h: -1.1 },
  { symbol: "LINK", pythFeedId: "8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221", binanceSymbol: "LINKUSDT", enabled: true, color: "#2a5ada", fallbackPrice: 13, fallbackChange24h: 2 },
  { symbol: "DOT", pythFeedId: "ca3eed9b267293f6595901c734c7525ce8ef49adafe8284606ceb307afa2ca5b", binanceSymbol: "DOTUSDT", enabled: true, color: "#e6007a", fallbackPrice: 4, fallbackChange24h: 0.7 },
];

const CONFIG_REF = doc(db, "app_config", "pairs");

function normalizePair(pair: Partial<PairConfig>): PairConfig {
  const symbol = String(pair.symbol ?? "").trim().toUpperCase();
  return {
    symbol,
    pythFeedId: String(pair.pythFeedId ?? "").trim().replace(/^0x/i, ""),
    binanceSymbol: String(pair.binanceSymbol ?? `${symbol}USDT`).trim().toUpperCase(),
    enabled: pair.enabled ?? true,
    color: pair.color ?? "#334155",
    fallbackPrice: pair.fallbackPrice ?? 0,
    fallbackChange24h: pair.fallbackChange24h ?? 0,
  };
}

export async function getPairRegistry(): Promise<PairConfig[]> {
  const snap = await getDoc(CONFIG_REF);
  if (!snap.exists()) return DEFAULT_PAIRS;

  const data = snap.data() as { registry?: Partial<PairConfig>[]; enabled?: string[]; deleted?: string[] };
  const deleted = new Set((data.deleted ?? []).map((symbol) => symbol.toUpperCase()));
  if (Array.isArray(data.registry) && data.registry.length > 0) {
    const bySymbol = new Map(DEFAULT_PAIRS.map((pair) => [pair.symbol, pair]));
    for (const pair of data.registry) {
      const normalized = normalizePair(pair);
      if (normalized.symbol) bySymbol.set(normalized.symbol, { ...bySymbol.get(normalized.symbol), ...normalized });
    }
    return [...bySymbol.values()].filter((pair) => !deleted.has(pair.symbol));
  }

  if (Array.isArray(data.enabled)) {
    const enabled = new Set(data.enabled.map((symbol) => symbol.toUpperCase()));
    return DEFAULT_PAIRS
      .filter((pair) => !deleted.has(pair.symbol))
      .map((pair) => ({ ...pair, enabled: enabled.has(pair.symbol) }));
  }

  return DEFAULT_PAIRS.filter((pair) => !deleted.has(pair.symbol));
}

export async function getEnabledPairRegistry(): Promise<PairConfig[]> {
  const registry = await getPairRegistry();
  return registry.filter((pair) => pair.enabled);
}

export async function setPairRegistry(registry: PairConfig[]): Promise<void> {
  const normalized = registry.map(normalizePair).filter((pair) => pair.symbol && pair.pythFeedId);
  await setDoc(CONFIG_REF, {
    registry: normalized,
    enabled: normalized.filter((pair) => pair.enabled).map((pair) => pair.symbol),
  }, { merge: true });
}

export async function removePairConfig(symbol: string): Promise<PairConfig[]> {
  const target = symbol.trim().toUpperCase();
  const registry = await getPairRegistry();
  const next = registry.filter((pair) => pair.symbol !== target);
  const normalized = next.map(normalizePair).filter((pair) => pair.symbol && pair.pythFeedId);
  const snap = await getDoc(CONFIG_REF);
  const data = snap.exists() ? snap.data() as { deleted?: string[] } : {};
  const deleted = [...new Set([...(data.deleted ?? []).map((item) => item.toUpperCase()), target])];
  await setDoc(CONFIG_REF, {
    registry: normalized,
    enabled: normalized.filter((pair) => pair.enabled).map((pair) => pair.symbol),
    deleted,
  }, { merge: true });
  return normalized;
}

export async function upsertPairConfig(pair: Partial<PairConfig>): Promise<PairConfig[]> {
  const registry = await getPairRegistry();
  const nextPair = normalizePair(pair);
  const next = registry.some((item) => item.symbol === nextPair.symbol)
    ? registry.map((item) => item.symbol === nextPair.symbol ? { ...item, ...nextPair } : item)
    : [...registry, nextPair];
  await setPairRegistry(next);
  const snap = await getDoc(CONFIG_REF);
  const data = snap.exists() ? snap.data() as { deleted?: string[] } : {};
  const deleted = (data.deleted ?? []).filter((item) => item.toUpperCase() !== nextPair.symbol);
  await setDoc(CONFIG_REF, { deleted }, { merge: true });
  return next;
}

export async function setPairEnabled(symbol: string, enabled: boolean): Promise<PairConfig[]> {
  const registry = await getPairRegistry();
  const next = registry.map((pair) => pair.symbol === symbol.toUpperCase() ? { ...pair, enabled } : pair);
  await setPairRegistry(next);
  return next;
}
