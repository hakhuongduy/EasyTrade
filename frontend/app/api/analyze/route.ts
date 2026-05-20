import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { getEnabledPairRegistry, type PairConfig } from "@/lib/pairs";

const DEEPSEEK_BASE = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const ALLOWED_MODELS = new Set(["deepseek-v4-flash", "deepseek-v4-pro"]);

const NEWS_SOURCES = [
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { name: "Decrypt", url: "https://decrypt.co/feed" },
  { name: "The Block", url: "https://www.theblock.co/rss.xml" },
];

type BinanceKline = [number, string, string, string, string, string];
type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
};

type NewsItem = {
  source: string;
  title: string;
  link: string;
  publishedAt?: string;
  summary?: string;
};

type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

function decodeEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripHtml(value: string) {
  return decodeEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function pickTag(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripHtml(match[1]) : "";
}

function parseRss(xml: string, source: string): NewsItem[] {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, 12).map((match) => {
    const raw = match[0];
    return {
      source,
      title: pickTag(raw, "title"),
      link: pickTag(raw, "link"),
      publishedAt: pickTag(raw, "pubDate"),
      summary: pickTag(raw, "description").slice(0, 240),
    };
  }).filter((item) => item.title);
}

async function fetchKlines(symbol: string): Promise<string> {
  const { data } = await axios.get<BinanceKline[]>(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=14`,
    { timeout: 8000 }
  );
  return data.map((k) => {
    const date = new Date(k[0]).toLocaleDateString("vi-VN");
    return `${date}: O=${Number(k[1]).toFixed(4)} H=${Number(k[2]).toFixed(4)} L=${Number(k[3]).toFixed(4)} C=${Number(k[4]).toFixed(4)} Vol=${Number(k[5]).toFixed(2)}`;
  }).join("\n");
}

async function fetchTicker(symbol: string): Promise<BinanceTicker> {
  const { data } = await axios.get<BinanceTicker>(
    `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
    { timeout: 8000 }
  );
  return data;
}

async function fetchMarketTrend(pairs: PairConfig[]) {
  const binancePairs = pairs.filter((pair) => pair.binanceSymbol).slice(0, 20);
  const symbols = binancePairs.map((pair) => `"${pair.binanceSymbol}"`).join(",");
  if (!symbols) return "Không có dữ liệu market breadth.";

  const { data } = await axios.get<BinanceTicker[]>(
    `https://api.binance.com/api/v3/ticker/24hr?symbols=[${symbols}]`,
    { timeout: 8000 }
  );

  const rows = data.map((item) => ({
    symbol: item.symbol.replace("USDT", ""),
    change: Number(item.priceChangePercent),
    volumeM: Number(item.quoteVolume) / 1e6,
  })).filter((item) => Number.isFinite(item.change));
  const up = rows.filter((item) => item.change > 0).length;
  const down = rows.filter((item) => item.change < 0).length;
  const avg = rows.reduce((sum, item) => sum + item.change, 0) / Math.max(1, rows.length);
  const strongest = [...rows].sort((a, b) => b.change - a.change).slice(0, 3);
  const weakest = [...rows].sort((a, b) => a.change - b.change).slice(0, 3);

  return [
    `Market breadth 24h: ${up} tăng / ${down} giảm / ${rows.length} cặp, trung bình ${avg.toFixed(2)}%.`,
    `Mạnh nhất: ${strongest.map((item) => `${item.symbol} ${item.change.toFixed(2)}%`).join(", ")}.`,
    `Yếu nhất: ${weakest.map((item) => `${item.symbol} ${item.change.toFixed(2)}%`).join(", ")}.`,
    `Volume lớn: ${rows.sort((a, b) => b.volumeM - a.volumeM).slice(0, 5).map((item) => `${item.symbol} $${item.volumeM.toFixed(1)}M`).join(", ")}.`,
  ].join("\n");
}

async function fetchNews(pair: string) {
  const keywords = new Set([
    pair.toLowerCase(),
    pair === "BTC" ? "bitcoin" : "",
    pair === "ETH" ? "ethereum" : "",
    "crypto",
    "market",
    "fed",
    "etf",
    "regulation",
    "stablecoin",
  ].filter(Boolean));

  const settled = await Promise.allSettled(NEWS_SOURCES.map(async (source) => {
    const { data } = await axios.get<string>(source.url, { timeout: 7000, responseType: "text" });
    return parseRss(String(data), source.name);
  }));

  const all = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const relevant = all.filter((item) => {
    const text = `${item.title} ${item.summary ?? ""}`.toLowerCase();
    return [...keywords].some((keyword) => text.includes(keyword));
  });
  return (relevant.length > 0 ? relevant : all).slice(0, 10);
}

function formatTicker(ticker: BinanceTicker) {
  const price = Number(ticker.lastPrice);
  const change = Number(ticker.priceChangePercent);
  const volume = Number(ticker.quoteVolume) / 1e6;
  return `Giá hiện tại: $${price.toFixed(price < 1 ? 6 : 2)} | 24h: ${change.toFixed(2)}% | Volume quote: $${volume.toFixed(1)}M`;
}

function formatNews(news: NewsItem[]) {
  if (news.length === 0) return "Không lấy được tin tức mới từ RSS đã cấu hình.";
  return news.map((item, index) => (
    `${index + 1}. [${item.source}] ${item.title}${item.publishedAt ? ` (${item.publishedAt})` : ""}\n   ${item.summary ?? ""}\n   ${item.link}`
  )).join("\n");
}

function buildPrompt(input: {
  pair: string;
  klinesData: string;
  currentPrice: string;
  marketTrend: string;
  news: string;
}) {
  return `Bạn là chuyên gia phân tích crypto futures cho nền tảng học giao dịch EasyTrade.

Yêu cầu:
- Phân tích bằng tiếng Việt, thực tế, không hứa chắc thắng.
- Kết hợp 4 nhóm dữ liệu: giá hiện tại, OHLC 14 ngày, xu hướng thị trường chung, tin tức mới.
- Nếu dữ liệu tin tức mâu thuẫn với kỹ thuật, nói rõ mức độ ảnh hưởng.
- Khuyến nghị phải phù hợp người học, ưu tiên quản trị rủi ro.
- Chỉ trả về JSON hợp lệ, không markdown, không text ngoài JSON.

Cặp cần phân tích: ${input.pair}/eUSD

Dữ liệu giá ${input.pair}/USDT 14 ngày:
${input.klinesData}

Snapshot hiện tại:
${input.currentPrice}

Xu hướng thị trường chung:
${input.marketTrend}

Tin tức từ nguồn hard-code:
${input.news}

Schema JSON bắt buộc:
{
  "trend": "BULLISH" | "BEARISH" | "SIDEWAYS",
  "confidence": <number 0-100>,
  "summary": "<2-3 câu tóm tắt kết luận chính>",
  "marketTrend": "<phân tích xu hướng thị trường chung và tâm lý risk-on/risk-off>",
  "technicalAnalysis": "<phân tích cấu trúc giá, momentum, volume, vùng hỗ trợ/kháng cự>",
  "newsImpact": "<tin tức nào quan trọng, tác động tích cực/tiêu cực/trung lập>",
  "support": <number>,
  "resistance": <number>,
  "recommendation": "LONG" | "SHORT" | "WAIT",
  "suggestedLeverage": <number 1-20>,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "invalidationPrice": <number>,
  "takeProfitZone": "<vùng chốt lời đề xuất, ví dụ 80000-81500>",
  "stopLossZone": "<vùng cắt lỗ đề xuất>",
  "actionPlan": ["<bước 1>", "<bước 2>", "<bước 3>"],
  "sourcesUsed": ["<tên nguồn tin đã dùng>"],
  "reason": "<3-5 câu giải thích vì sao khuyến nghị như vậy>"
}`;
}

function normalizeAnalysis(value: unknown) {
  const record = value as Record<string, unknown>;
  return {
    trend: ["BULLISH", "BEARISH", "SIDEWAYS"].includes(String(record.trend)) ? record.trend : "SIDEWAYS",
    confidence: Math.max(0, Math.min(100, Number(record.confidence ?? 50))),
    summary: String(record.summary ?? ""),
    marketTrend: String(record.marketTrend ?? ""),
    technicalAnalysis: String(record.technicalAnalysis ?? ""),
    newsImpact: String(record.newsImpact ?? ""),
    support: Number(record.support ?? 0),
    resistance: Number(record.resistance ?? 0),
    recommendation: ["LONG", "SHORT", "WAIT"].includes(String(record.recommendation)) ? record.recommendation : "WAIT",
    suggestedLeverage: Math.max(1, Math.min(20, Number(record.suggestedLeverage ?? 1))),
    riskLevel: ["LOW", "MEDIUM", "HIGH"].includes(String(record.riskLevel)) ? record.riskLevel : "MEDIUM",
    invalidationPrice: Number(record.invalidationPrice ?? 0),
    takeProfitZone: String(record.takeProfitZone ?? ""),
    stopLossZone: String(record.stopLossZone ?? ""),
    actionPlan: Array.isArray(record.actionPlan) ? record.actionPlan.map(String).slice(0, 5) : [],
    sourcesUsed: Array.isArray(record.sourcesUsed) ? record.sourcesUsed.map(String).slice(0, 8) : [],
    reason: String(record.reason ?? ""),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pair = searchParams.get("pair")?.toUpperCase() ?? "BTC";

  const registry = await getEnabledPairRegistry();
  const supportedPairs = new Map(registry.map((item) => [item.symbol, item]));
  const pairConfig = supportedPairs.get(pair);
  if (!pairConfig?.binanceSymbol) {
    return NextResponse.json(
      { success: false, error: `Cặp "${pair}" không hỗ trợ. Các cặp hợp lệ: ${[...supportedPairs.keys()].join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "Thiếu DEEPSEEK_API_KEY trên server" }, { status: 500 });
    }

    let model = DEFAULT_MODEL;
    let temperature = 0.4;
    let thinking = false;
    try {
      const { getAIConfig } = await import("@/lib/orders");
      const cfg = await getAIConfig();
      model = ALLOWED_MODELS.has(cfg.model) ? cfg.model : DEFAULT_MODEL;
      temperature = Number.isFinite(cfg.temperature) ? cfg.temperature : 0.4;
      thinking = cfg.thinking ?? false;
    } catch {
      // Firebase config optional.
    }

    const [klinesResult, tickerResult, marketTrendResult, newsResult] = await Promise.allSettled([
      fetchKlines(pairConfig.binanceSymbol),
      fetchTicker(pairConfig.binanceSymbol),
      fetchMarketTrend(registry),
      fetchNews(pair),
    ]);

    const klinesData = klinesResult.status === "fulfilled"
      ? klinesResult.value
      : "Không lấy được OHLC từ Binance trong lần gọi này.";
    const currentPrice = tickerResult.status === "fulfilled"
      ? formatTicker(tickerResult.value)
      : "Không lấy được ticker hiện tại từ Binance trong lần gọi này.";
    const marketTrend = marketTrendResult.status === "fulfilled"
      ? marketTrendResult.value
      : "Không lấy được market breadth trong lần gọi này.";
    const newsItems = newsResult.status === "fulfilled" ? newsResult.value : [];
    const news = formatNews(newsItems);
    const prompt = buildPrompt({ pair, klinesData, currentPrice, marketTrend, news });

    const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Bạn là API phân tích crypto futures. Chỉ trả JSON hợp lệ theo schema người dùng yêu cầu." },
          { role: "user", content: prompt },
        ],
        temperature,
        max_tokens: 1800,
        response_format: { type: "json_object" },
        thinking: { type: thinking ? "enabled" : "disabled" },
        stream: false,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 429) throw new Error(`429: ${err}`);
      throw new Error(`DeepSeek ${res.status}: ${err.slice(0, 240)}`);
    }

    const resJson = await res.json() as DeepSeekResponse;
    const text = resJson.choices?.[0]?.message?.content?.trim() ?? "";
    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    const analysis = normalizeAnalysis(parsed);

    return NextResponse.json({
      success: true,
      pair,
      analysis,
      model,
      dataSnapshot: {
        currentPrice,
        klinesData: klinesData.split("\n"),
        marketTrend: marketTrend.split("\n"),
        news: newsItems,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[AI Analyze] Error:", message);

    if (message.includes("429") || message.toLowerCase().includes("quota") || message.toLowerCase().includes("rate limit")) {
      return NextResponse.json({
        success: false,
        error: "DeepSeek đang giới hạn quota/rate limit. Thử lại sau hoặc đổi sang V4 Flash trong Admin.",
        retryAfter: 60,
      }, { status: 429 });
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
