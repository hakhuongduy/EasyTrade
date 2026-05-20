"use client";

import { useEffect, useState } from "react";
import { getDocs, collection, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface TraderStat {
  account: string;
  trades: number;
  wins: number;
  totalPnl: number;
  volume: number;
}

export default function AdminUsers() {
  const [traders, setTraders] = useState<TraderStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const snap = await getDocs(query(collection(db, "pnl_history"), orderBy("closedAt", "desc")));
      const records = snap.docs.map((d) => d.data());

      // Group by account
      const map = new Map<string, TraderStat>();
      for (const r of records) {
        const acc = r.account as string;
        if (!map.has(acc)) map.set(acc, { account: acc, trades: 0, wins: 0, totalPnl: 0, volume: 0 });
        const s = map.get(acc)!;
        s.trades++;
        if ((r.pnl as number) > 0) s.wins++;
        s.totalPnl += r.pnl as number;
        s.volume   += r.size as number;
      }
      setTraders([...map.values()].sort((a, b) => b.totalPnl - a.totalPnl));
      setLoading(false);
    }
    load();
  }, []);

  const fmtUSD = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const shortAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>👥 Người dùng</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>{traders.length} nhà giao dịch • Sắp xếp theo tổng PnL</p>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1,2,3].map((i) => <div key={i} className="skeleton" style={{ height: 52 }} />)}
        </div>
      ) : traders.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          Chưa có dữ liệu giao dịch
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-raised)", borderBottom: "1px solid var(--border)" }}>
                {["#", "Địa chỉ ví", "Số lệnh", "Thắng/Tổng", "Win Rate", "Tổng PnL", "Volume"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {traders.map((t, i) => {
                const winRate = t.trades > 0 ? ((t.wins / t.trades) * 100).toFixed(1) : "0";
                const isProfit = t.totalPnl >= 0;
                return (
                  <tr key={t.account} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "10px 14px", color: "var(--text-muted)", fontWeight: 700 }}>#{i + 1}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <code style={{ fontSize: 12, background: "rgba(255,255,255,0.055)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)", padding: "2px 6px", borderRadius: 3 }}>{shortAddr(t.account)}</code>
                    </td>
                    <td style={{ padding: "10px 14px" }}>{t.trades}</td>
                    <td style={{ padding: "10px 14px" }}>{t.wins}/{t.trades}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden", minWidth: 60 }}>
                          <div style={{ height: "100%", width: `${winRate}%`, background: parseFloat(winRate) >= 50 ? "var(--profit)" : "var(--loss)", borderRadius: 2 }} />
                        </div>
                        <span style={{ fontWeight: 600, minWidth: 36 }}>{winRate}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: isProfit ? "var(--profit)" : "var(--loss)" }}>
                      {isProfit ? "+" : ""}{fmtUSD(t.totalPnl)}
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--text-muted)" }}>{fmtUSD(t.volume)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
