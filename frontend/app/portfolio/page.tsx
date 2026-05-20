"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { useWallet } from "@/hooks/useWallet";
import { usePositions } from "@/hooks/usePosition";
import { getPnLHistory, type PnLRecord } from "@/lib/firestore";

interface StatCardProps { label: string; value: string; sub?: string; color?: string; }

function StatCard({ label, value, sub, color }: StatCardProps) {
  return (
    <div className="card" style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color ?? "var(--text-primary)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function PortfolioPage() {
  const { address, isConnected } = useWallet();
  const { positions, loading }   = usePositions();
  const [history, setHistory]    = useState<PnLRecord[]>([]);
  const [histLoaded, setHistLoaded] = useState(false);
  const [historyAccount, setHistoryAccount] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;

    const loadHistory = () => {
      getPnLHistory(address).then((r) => {
        setHistory(r);
        setHistLoaded(true);
        setHistoryAccount(address);
      });
    };

    if (!histLoaded || historyAccount?.toLowerCase() !== address.toLowerCase()) {
      const timeout = window.setTimeout(loadHistory, 0);
      window.addEventListener("easytrade:history-updated", loadHistory);
      return () => {
        window.clearTimeout(timeout);
        window.removeEventListener("easytrade:history-updated", loadHistory);
      };
    }

    window.addEventListener("easytrade:history-updated", loadHistory);
    return () => window.removeEventListener("easytrade:history-updated", loadHistory);
  }, [address, histLoaded, historyAccount]);

  const totalPnL    = history.reduce((s, r) => s + r.pnl, 0);
  const wins        = history.filter((r) => r.pnl > 0).length;
  const winRate     = history.length > 0 ? (wins / history.length) * 100 : 0;
  const totalVolume = history.reduce((s, r) => s + Math.abs(r.pnl), 0);
  const openCount   = positions.length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Header />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" }}>Portfolio</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
            {isConnected ? address : "Kết nối ví để xem thông tin đầu tư của bạn"}
          </p>
        </div>

        {!isConnected ? (
          <div className="card" style={{ padding: 60, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>—</div>
            <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Vui lòng kết nối ví MetaMask để xem portfolio</div>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
              <StatCard label="Tổng PnL" value={`${totalPnL >= 0 ? "+" : ""}$${totalPnL.toFixed(2)}`} color={totalPnL >= 0 ? "var(--profit)" : "var(--loss)"} sub="Lịch sử đã đóng" />
              <StatCard label="Win Rate" value={`${winRate.toFixed(1)}%`} color={winRate >= 50 ? "var(--profit)" : "var(--text-primary)"} sub={`${wins}/${history.length} lệnh thắng`} />
              <StatCard label="Vị thế đang mở" value={String(openCount)} sub={loading ? "Đang tải..." : "vị thế"} />
              <StatCard label="Tổng volume" value={`$${totalVolume.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} sub="Tổng giá trị đã giao dịch" />
            </div>

            {/* Open positions */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 700 }}>
                Vị thế đang mở
                {openCount > 0 && <span style={{ marginLeft: 8, background: "var(--accent)", color: "#0b0e1a", borderRadius: 10, fontSize: 10, padding: "1px 7px", fontWeight: 700 }}>{openCount}</span>}
              </div>
              <div style={{ padding: 16 }}>
                {loading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 56 }} />)}
                  </div>
                ) : openCount === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)", fontSize: 13 }}>Không có vị thế nào đang mở</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {positions.map((pos) => {
                      const isProfit = pos.pnlRaw >= BigInt(0);
                      return (
                        <div key={`${pos.symbol}-${pos.isLong}`} style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr 1fr", alignItems: "center", gap: 16, padding: "12px 16px", background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)" }}>
                          <span className={`badge ${pos.isLong ? "badge-profit" : "badge-loss"}`}>{pos.isLong ? "LONG" : "SHORT"}</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{pos.symbol}/eUSD</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Vị thế</div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>${pos.size}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Kích thước</div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>${pos.averagePrice}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Giá vào</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: isProfit ? "var(--profit)" : "var(--loss)", fontVariantNumeric: "tabular-nums" }}>{pos.pnl}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>PnL</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Trade history */}
            <div className="card">
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 700 }}>
                Lịch sử giao dịch
              </div>
              {history.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 13 }}>Chưa có lịch sử giao dịch</div>
              ) : (
                <div>
                  {/* Table header */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", padding: "10px 20px", background: "var(--bg)", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    <span>Tài sản</span><span>Loại</span><span>Kích thước</span><span>PnL</span><span style={{ textAlign: "right" }}>Thời gian</span>
                  </div>
                  {history.map((record, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", padding: "12px 20px", borderBottom: i < history.length - 1 ? "1px solid var(--border-subtle)" : "none", alignItems: "center", fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>{record.symbol}</span>
                      <span className={`badge ${record.isLong ? "badge-profit" : "badge-loss"}`} style={{ width: "fit-content" }}>{record.isLong ? "LONG" : "SHORT"}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>${record.size?.toLocaleString("en-US") ?? "—"}</span>
                      <span style={{ fontWeight: 700, color: record.pnl >= 0 ? "var(--profit)" : "var(--loss)", fontVariantNumeric: "tabular-nums" }}>
                        {record.pnl >= 0 ? "+" : ""}${record.pnl.toFixed(2)}
                      </span>
                      <span style={{ textAlign: "right", color: "var(--text-muted)", fontSize: 12 }}>
                        {record.closedAt ? record.closedAt.toDate().toLocaleDateString("vi-VN") : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
