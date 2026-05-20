"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import AssetList from "@/components/AssetList";
import TradingChart from "@/components/TradingChart";
import OrderPanel from "@/components/OrderPanel";
import PositionTabs from "@/components/PositionTabs";
import BottomNav from "@/components/BottomNav";
import type { PairConfig } from "@/lib/pairs";

interface AssetPrice {
  symbol: string;
  price: number;
  change24h: number;
}

function parsePracticeLeverage(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(50, Math.max(1, Math.trunc(parsed)));
}

function TradingPageInner() {
  const searchParams = useSearchParams();
  const [selectedAsset, setSelectedAsset] = useState(searchParams.get("asset") ?? "BTC");
  const [prices, setPrices] = useState<AssetPrice[]>([]);
  const [pairs, setPairs] = useState<PairConfig[]>([]);
  const [priceSource, setPriceSource] = useState("pyth");

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const fetchPrices = async () => {
      if (inFlight) return;
      inFlight = true;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 1_800);
      try {
        const res = await fetch("/api/prices", { cache: "no-store", signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json() as { prices: AssetPrice[]; pairs?: PairConfig[]; source?: string };
        if (!cancelled && data.prices) {
          setPrices(data.prices);
          setPriceSource(data.source ?? "pyth");
          if (data.pairs) {
            setPairs((currentPairs) => {
              const currentKey = currentPairs.map((pair) => `${pair.symbol}:${pair.binanceSymbol}:${pair.enabled}`).join("|");
              const nextKey = data.pairs!.map((pair) => `${pair.symbol}:${pair.binanceSymbol}:${pair.enabled}`).join("|");
              return currentKey === nextKey ? currentPairs : data.pairs!;
            });
            const symbols = new Set(data.pairs.map((pair) => pair.symbol));
            if (!symbols.has(selectedAsset)) setSelectedAsset(data.pairs[0]?.symbol ?? "BTC");
          }
        }
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") console.error("Price fetch error:", e);
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
      }
    };
    const fetchVisiblePrices = () => {
      if (!document.hidden) void fetchPrices();
    };

    void fetchPrices();
    const interval = setInterval(fetchVisiblePrices, 1_000);
    window.addEventListener("focus", fetchVisiblePrices);
    document.addEventListener("visibilitychange", fetchVisiblePrices);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", fetchVisiblePrices);
      document.removeEventListener("visibilitychange", fetchVisiblePrices);
    };
  }, [selectedAsset]);

  const current = prices.find((p) => p.symbol === selectedAsset) ?? { symbol: selectedAsset, price: 0, change24h: 0 };
  const currentPair = pairs.find((pair) => pair.symbol === selectedAsset);
  const pairSymbols = useMemo(() => pairs.map((pair) => pair.symbol), [pairs]);
  const priceBySymbol = useMemo(() => Object.fromEntries(prices.map((item) => [item.symbol, item.price])), [prices]);
  const practiceLeverage = parsePracticeLeverage(searchParams.get("leverage"));

  return (
    <div className="trading-shell" style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <Header
        selectedAsset={selectedAsset}
        onSelectAsset={setSelectedAsset}
        assets={pairSymbols}
        currentPrice={current.price}
        priceChange24h={current.change24h}
      />

      {/* Main content: 3 cột */}
      <div className="trading-grid" style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "220px 1fr 300px",
        gridTemplateRows: "1fr",
        overflow: "hidden",
        gap: 0,
      }}>
        {/* Cột trái: asset list */}
        <div className="col-left" style={{ borderRight: "1px solid var(--border)", overflow: "hidden" }}>
          <AssetList assets={prices} selected={selectedAsset} onSelect={setSelectedAsset} />
        </div>

        {/* Cột giữa: chart + position tabs */}
        <div className="trading-main" style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid var(--border)" }}>
          {/* Chart - 60% height */}
          <div className="chart-panel" style={{ flex: "0 0 60%", borderBottom: "1px solid var(--border)", overflow: "hidden" }}>
            <TradingChart symbol={selectedAsset} binanceSymbol={currentPair?.binanceSymbol} currentPrice={current.price} source={priceSource} />
          </div>
          {/* Position tabs - 40% height */}
          <div className="positions-panel" style={{ flex: "0 0 40%", overflow: "hidden", padding: 12 }}>
            <PositionTabs selectedAsset={selectedAsset} symbols={pairSymbols} livePrices={priceBySymbol} />
          </div>
        </div>

        {/* Cột phải: order panel */}
        <div className="col-right side-panel" style={{ overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <OrderPanel symbol={selectedAsset} currentPrice={current.price} initialLeverage={practiceLeverage} />

          {/* Pool info */}
          <div className="card pool-card" style={{ padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--text-muted)", marginBottom: 12 }}>Thông tin Pool</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
              {[
                { label: "Giá hiện tại", value: `$${current.price.toLocaleString("en-US", { minimumFractionDigits: current.price < 1 ? 4 : 2 })}` },
                { label: "Thay đổi 24h", value: `${current.change24h >= 0 ? "+" : ""}${current.change24h.toFixed(2)}%`, color: current.change24h >= 0 ? "var(--profit)" : "var(--loss)" },
                { label: "Đòn bẩy tối đa", value: "50x" },
                { label: "Phí mở lệnh", value: "0.1%" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ fontWeight: 600, color: color ?? "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

// Bọc trong Suspense vì dùng useSearchParams (Next.js yêu cầu)
export default function TradingPage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--text-muted)", fontSize: 14 }}>Đang tải...</div>}>
      <TradingPageInner />
    </Suspense>
  );
}
