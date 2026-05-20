"use client";

interface AssetInfo {
  symbol: string;
  price: number;
  change24h: number;
}

interface AssetListProps {
  assets: AssetInfo[];
  selected: string;
  onSelect: (symbol: string) => void;
}

// Màu đại diện cho từng token
const SYMBOL_COLOR: Record<string, string> = {
  BTC:  "#f7931a", ETH:  "#627eea", SOL:  "#9945ff", BNB:  "#f3ba2f",
  XRP:  "#346aa9", DOGE: "#c2a633", ADA:  "#0d1e2d", AVAX: "#e84142",
  LINK: "#2a5ada", DOT:  "#e6007a",
};

export default function AssetList({ assets, selected, onSelect }: AssetListProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>Thị trường</span>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {assets.map((asset) => {
          const isSelected = asset.symbol === selected;
          const isPositive = asset.change24h >= 0;
          const isSubDollar = asset.price < 1;

          return (
            <div
              key={asset.symbol}
              onClick={() => onSelect(asset.symbol)}
              style={{
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                borderBottom: "1px solid var(--border-subtle)",
                background: isSelected ? "rgba(254,219,113,0.06)" : "transparent",
                borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"; }}
              onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* Token color dot */}
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: SYMBOL_COLOR[asset.symbol] ?? "#334155",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
                    {asset.symbol.slice(0, 3)}
                  </span>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{asset.symbol}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>eUSD</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 600, fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}>
                  ${asset.price.toLocaleString("en-US", { minimumFractionDigits: isSubDollar ? 4 : 2, maximumFractionDigits: isSubDollar ? 4 : 2 })}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: isPositive ? "var(--profit)" : "var(--loss)" }}>
                  {isPositive ? "+" : ""}{asset.change24h.toFixed(2)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
