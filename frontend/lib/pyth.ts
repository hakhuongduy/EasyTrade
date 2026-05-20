import { DEFAULT_PAIRS, getPairRegistry } from "./pairs";

export const PYTH_FEED_IDS: Record<string, string> = Object.fromEntries(
  DEFAULT_PAIRS.map((pair) => [pair.symbol, pair.pythFeedId])
);

export async function getPythFeedIds(): Promise<Record<string, string>> {
  const pairs = await getPairRegistry();
  return Object.fromEntries(pairs.map((pair) => [pair.symbol, pair.pythFeedId]));
}

export interface PythParsedPrice {
  id: string;
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
}

export interface PythUpdateResponse {
  updateData: string[];
  parsed: PythParsedPrice[];
}
