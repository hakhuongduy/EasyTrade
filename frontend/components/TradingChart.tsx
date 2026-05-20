"use client";

import { useEffect, useRef, useState } from "react";

interface TradingChartProps {
  symbol: string;
  binanceSymbol?: string;
  currentPrice: number;
  source?: string;
}

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

const RANGES = ["5m", "1h", "8h", "1d", "3d", "1w"] as const;
type Range = (typeof RANGES)[number];

const RANGE_LIMIT: Record<Range, number> = {
  "5m": 180,
  "1h": 168,
  "8h": 180,
  "1d": 180,
  "3d": 160,
  "1w": 156,
};

function formatPrice(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 6 : 2,
  });
}

function candleKey(symbol: string, range: Range) {
  return `easytrade:binance-candle-chart:v1:${symbol}:${range}`;
}

function parseCandle(raw: unknown): Candle | null {
  if (!Array.isArray(raw)) return null;
  const time = Number(raw[0]);
  const open = Number(raw[1]);
  const high = Number(raw[2]);
  const low = Number(raw[3]);
  const close = Number(raw[4]);
  if (![time, open, high, low, close].every(Number.isFinite)) return null;
  return { time, open, high, low, close };
}

function shouldIncludeOracleInScale(price: number, candleLow: number, candleHigh: number) {
  if (!Number.isFinite(price) || price <= 0) return false;
  const mid = (candleLow + candleHigh) / 2;
  if (mid <= 0) return false;
  return Math.abs(price - mid) / mid < 0.15;
}

export default function TradingChart({ symbol, binanceSymbol, currentPrice }: TradingChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<Range>("5m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<"loading" | "live" | "error">("loading");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = window.localStorage.getItem(candleKey(symbol, range));
      const parsed = stored ? JSON.parse(stored) as Candle[] : [];
      const nextCandles = Array.isArray(parsed)
        ? parsed
            .filter((item) => [item.time, item.open, item.high, item.low, item.close].every(Number.isFinite))
            .slice(-RANGE_LIMIT[range])
        : [];
      setCandles(nextCandles);
      setStatus(nextCandles.length > 0 ? "live" : "loading");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [range, symbol]);

  useEffect(() => {
    if (candles.length === 0) return;
    window.localStorage.setItem(candleKey(symbol, range), JSON.stringify(candles.slice(-RANGE_LIMIT[range])));
  }, [candles, range, symbol]);

  useEffect(() => {
    const targetSymbol = binanceSymbol ?? `${symbol}USDT`;
    let cancelled = false;
    let inFlight = false;

    const fetchCandles = async () => {
      if (inFlight) return;
      inFlight = true;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 4_000);
      try {
        const params = new URLSearchParams({
          symbol: targetSymbol,
          interval: range,
          limit: String(RANGE_LIMIT[range]),
        });
        const res = await fetch(`/api/chart/klines?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Không tải được nến Binance");
        const data = await res.json() as { success?: boolean; candles?: unknown[]; error?: string };
        if (!data.success || !Array.isArray(data.candles)) throw new Error(data.error ?? "Không tải được nến Binance");
        const raw = data.candles;
        const nextCandles = raw.map(parseCandle).filter((item): item is Candle => item !== null);
        if (!cancelled) {
          setCandles(nextCandles);
          setStatus(nextCandles.length > 0 ? "live" : "error");
        }
      } catch (e) {
        if (!cancelled && (e as Error)?.name !== "AbortError") {
          setStatus("error");
        }
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
      }
    };

    void fetchCandles();
    const interval = window.setInterval(fetchCandles, range === "5m" ? 5_000 : 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [binanceSymbol, range, symbol]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const draw = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const nextWidth = Math.floor(rect.width * dpr);
      const nextHeight = Math.floor(rect.height * dpr);
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = "#0b0c0f";
      ctx.fillRect(0, 0, rect.width, rect.height);

      const plot = { left: 12, top: 16, right: 82, bottom: 34 };
      const width = rect.width - plot.left - plot.right;
      const height = rect.height - plot.top - plot.bottom;
      const drawCandles = candles.slice(-RANGE_LIMIT[range]);

      ctx.strokeStyle = "rgba(255,255,255,0.055)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i += 1) {
        const y = plot.top + (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(plot.left, y);
        ctx.lineTo(rect.width - plot.right + 4, y);
        ctx.stroke();
      }

      if (drawCandles.length < 2) {
        ctx.fillStyle = "#707b89";
        ctx.font = "12px Inter, sans-serif";
        ctx.fillText(status === "error" ? "Khong tai duoc nen Binance" : "Dang tai nen Binance...", 18, 36);
        if (currentPrice > 0) drawPriceMarker(ctx, rect.width, plot, height, plot.top + height / 2, currentPrice);
        return;
      }

      const candleLows = drawCandles.map((candle) => candle.low);
      const candleHighs = drawCandles.map((candle) => candle.high);
      const candleLow = Math.min(...candleLows);
      const candleHigh = Math.max(...candleHighs);
      const includeOracle = shouldIncludeOracleInScale(currentPrice, candleLow, candleHigh);
      const minPrice = Math.min(candleLow, includeOracle ? currentPrice : Number.POSITIVE_INFINITY);
      const maxPrice = Math.max(candleHigh, includeOracle ? currentPrice : Number.NEGATIVE_INFINITY);
      const rawRange = Math.max(0, maxPrice - minPrice);
      const minRange = Math.max(maxPrice * 0.0015, 1);
      const pad = Math.max(rawRange * 0.22, minRange);
      const low = minPrice - pad;
      const high = maxPrice + pad;
      const yForPrice = (price: number) => plot.top + ((high - price) / (high - low)) * height;
      const candleStep = width / Math.max(1, drawCandles.length);
      const bodyWidth = Math.max(3, Math.min(12, candleStep * 0.62));

      drawCandles.forEach((candle, index) => {
        const x = plot.left + candleStep * index + candleStep / 2;
        const openY = yForPrice(candle.open);
        const closeY = yForPrice(candle.close);
        const highY = yForPrice(candle.high);
        const lowY = yForPrice(candle.low);
        const up = candle.close >= candle.open;
        const color = up ? "#22c58b" : "#ef5350";
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.stroke();
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
        ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
      });

      if (currentPrice > 0) drawPriceMarker(ctx, rect.width, plot, height, yForPrice(currentPrice), currentPrice, !includeOracle);
    };

    const observer = new ResizeObserver(draw);
    observer.observe(wrap);
    draw();
    return () => observer.disconnect();
  }, [candles, currentPrice, range, status]);

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%", minHeight: 360, background: "#0b0c0f", position: "relative" }}>
      <div style={{ position: "absolute", top: 10, left: 12, zIndex: 2, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>{symbol}/eUSD</span>
      </div>
      <div style={{ position: "absolute", top: 8, right: 10, zIndex: 2, display: "flex", gap: 4 }}>
        {RANGES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setRange(item)}
            style={{
              border: "1px solid var(--border)",
              background: range === item ? "var(--accent)" : "rgba(255,255,255,0.03)",
              color: range === item ? "#15100a" : "var(--text-secondary)",
              borderRadius: 4,
              padding: "4px 8px",
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
}

function drawPriceMarker(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  plot: { left: number; top: number; right: number; bottom: number },
  height: number,
  y: number,
  price: number,
  clamped = false,
) {
  const clampedY = Math.max(plot.top + 12, Math.min(plot.top + height - 12, y));
  ctx.strokeStyle = "#f4c95d";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(plot.left, clampedY);
  ctx.lineTo(canvasWidth - plot.right + 4, clampedY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#f4c95d";
  ctx.fillRect(canvasWidth - plot.right + 8, clampedY - 11, plot.right - 14, 22);
  ctx.fillStyle = "#15100a";
  ctx.font = "700 11px Inter, sans-serif";
  ctx.fillText(formatPrice(price), canvasWidth - plot.right + 13, clampedY + 4);

  if (clamped) {
    ctx.fillStyle = "#f4c95d";
    ctx.font = "700 9px Inter, sans-serif";
    ctx.fillText("ORACLE", canvasWidth - plot.right + 13, clampedY + 17);
  }
}
