"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { getPnLHistory, type PnLRecord } from "@/lib/firestore";
import Link from "next/link";

export default function HistoryPage() {
  const { address, isConnected } = useWallet();
  const [records, setRecords]   = useState<PnLRecord[]>([]);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (!isConnected || !address) return;
    let cancelled = false;
    const loadHistory = () => {
      setLoading(true);
      getPnLHistory(address, 100).then((data) => {
        if (cancelled) return;
        setRecords(data);
        setLoading(false);
      }).catch(() => {
        if (!cancelled) setLoading(false);
      });
    };

    const timeout = window.setTimeout(loadHistory, 0);
    window.addEventListener("easytrade:history-updated", loadHistory);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      window.removeEventListener("easytrade:history-updated", loadHistory);
    };
  }, [address, isConnected]);

  // Tính stats
  const totalPnl   = records.reduce((s, r) => s + (r.pnl ?? 0), 0);
  const wins       = records.filter((r) => (r.pnl ?? 0) > 0).length;
  const winRate    = records.length > 0 ? ((wins / records.length) * 100).toFixed(1) : "—";
  const totalVol   = records.reduce((s, r) => s + (r.size ?? 0), 0);

  const fmtUSD = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
      <div style={{ background: "var(--header)", padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <Link href="/" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none", fontSize: 13 }}>← Giao dịch</Link>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: 0 }}>📋 Lịch sử giao dịch</h1>
      </div>

      <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
        {!isConnected ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Kết nối ví để xem lịch sử giao dịch</p>
          </div>
        ) : loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1,2,3].map((i) => <div key={i} className="skeleton" style={{ height: 56 }} />)}
          </div>
        ) : (
          <>
            {/* Stats bar */}
            <div className="history-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Tổng lệnh", value: String(records.length), color: undefined },
                { label: "Tổng PnL", value: `${totalPnl >= 0 ? "+" : ""}$${fmtUSD(totalPnl)}`, color: totalPnl >= 0 ? "var(--profit)" : "var(--loss)" },
                { label: "Tỉ lệ thắng", value: `${winRate}%`, color: "var(--text-primary)" },
                { label: "Tổng Volume", value: `$${fmtUSD(totalVol)}`, color: undefined },
              ].map((s) => (
                <div key={s.label} className="card" style={{ padding: 16, textAlign: "center", minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.color ?? "var(--text-primary)" }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Table */}
            {records.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: 14 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                Chưa có lịch sử giao dịch
              </div>
            ) : (
              <div className="card" style={{ overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-raised)", borderBottom: "1px solid var(--border)" }}>
                      {["Cặp", "Hướng", "Size", "Giá vào", "Giá ra", "PnL", "Thời gian"].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => {
                      const isProfit = (r.pnl ?? 0) >= 0;
                      const date = r.closedAt
                        ? new Date(r.closedAt.seconds * 1000).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                        : "—";
                      return (
                        <tr key={r.id ?? i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "10px 14px", fontWeight: 600 }}>{r.symbol}/eUSD</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span className={`badge ${r.isLong ? "badge-profit" : "badge-loss"}`}>{r.isLong ? "LONG" : "SHORT"}</span>
                          </td>
                          <td style={{ padding: "10px 14px" }}>${fmtUSD(r.size)}</td>
                          <td style={{ padding: "10px 14px" }}>${fmtUSD(r.entryPrice)}</td>
                          <td style={{ padding: "10px 14px" }}>${fmtUSD(r.exitPrice)}</td>
                          <td style={{ padding: "10px 14px", fontWeight: 700, color: isProfit ? "var(--profit)" : "var(--loss)" }}>
                            {isProfit ? "+" : ""}{fmtUSD(r.pnl ?? 0)}
                          </td>
                          <td style={{ padding: "10px 14px", color: "var(--text-muted)", fontSize: 11 }}>{date}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
