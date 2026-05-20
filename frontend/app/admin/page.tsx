"use client";

import { useEffect, useMemo, useState } from "react";
import { getDocs, collection, query, orderBy, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface PnLDoc {
  account?: string;
  symbol?: string;
  size?: number;
  pnl?: number;
  isLong?: boolean;
  closedAt?: Timestamp | null;
}

interface DashboardStats {
  users: number;
  trades: number;
  volume: number;
  articles: number;
  pnl: number;
  wins: number;
}

export default function AdminDashboard() {
  const [records, setRecords] = useState<PnLDoc[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ users: 0, trades: 0, volume: 0, articles: 0, pnl: 0, wins: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const [pnlSnap, articleSnap] = await Promise.all([
        getDocs(query(collection(db, "pnl_history"), orderBy("closedAt", "desc"))),
        getDocs(collection(db, "articles")),
      ]);
      const nextRecords = pnlSnap.docs.map((doc) => doc.data() as PnLDoc);
      const uniqueUsers = new Set(nextRecords.map((record) => record.account).filter(Boolean)).size;
      const totalVolume = nextRecords.reduce((sum, record) => sum + (record.size ?? 0), 0);
      const totalPnl = nextRecords.reduce((sum, record) => sum + (record.pnl ?? 0), 0);
      const wins = nextRecords.filter((record) => (record.pnl ?? 0) > 0).length;

      setRecords(nextRecords);
      setStats({ users: uniqueUsers, trades: nextRecords.length, volume: totalVolume, articles: articleSnap.size, pnl: totalPnl, wins });
      setLoading(false);
    }
    void loadStats();
  }, []);

  const symbolRows = useMemo(() => {
    const grouped = new Map<string, { trades: number; volume: number; pnl: number }>();
    for (const record of records) {
      const symbol = record.symbol ?? "N/A";
      const current = grouped.get(symbol) ?? { trades: 0, volume: 0, pnl: 0 };
      current.trades += 1;
      current.volume += record.size ?? 0;
      current.pnl += record.pnl ?? 0;
      grouped.set(symbol, current);
    }
    return [...grouped.entries()]
      .map(([symbol, value]) => ({ symbol, ...value }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 6);
  }, [records]);

  const dailyRows = useMemo(() => {
    const days = new Map<string, { label: string; trades: number; volume: number; pnl: number }>();
    const now = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      days.set(key, {
        label: date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
        trades: 0,
        volume: 0,
        pnl: 0,
      });
    }

    for (const record of records) {
      if (!record.closedAt?.seconds) continue;
      const date = new Date(record.closedAt.seconds * 1000);
      const key = date.toISOString().slice(0, 10);
      const current = days.get(key);
      if (!current) continue;
      current.trades += 1;
      current.volume += record.size ?? 0;
      current.pnl += record.pnl ?? 0;
    }

    return [...days.values()];
  }, [records]);

  const longCount = records.filter((record) => record.isLong).length;
  const shortCount = Math.max(records.length - longCount, 0);
  const winRate = stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0;
  const maxSymbolVolume = Math.max(...symbolRows.map((row) => row.volume), 1);
  const maxDailyVolume = Math.max(...dailyRows.map((row) => row.volume), 1);
  const dailyVolume = dailyRows.reduce((sum, row) => sum + row.volume, 0);

  const statCards = [
    { label: "Nhà giao dịch", value: stats.users.toLocaleString("en-US"), color: "var(--info)" },
    { label: "Tổng lệnh", value: stats.trades.toLocaleString("en-US"), color: "var(--accent)" },
    { label: "Tổng Volume", value: fmtUSD(stats.volume), color: "var(--profit)" },
    { label: "Bài viết", value: stats.articles.toLocaleString("en-US"), color: "#f59e0b" },
  ];

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6, color: "var(--text-primary)" }}>Tổng quan</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>Thống kê hệ thống EasyTrade</p>

      <div className="admin-stat-grid">
        {statCards.map((card) => (
          <div key={card.label} className="card admin-stat-card">
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700, marginBottom: 10 }}>{card.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: card.color, fontVariantNumeric: "tabular-nums" }}>
              {loading ? "-" : card.value}
            </div>
          </div>
        ))}
      </div>

      <div className="admin-chart-grid">
        <section className="card admin-chart-card admin-chart-wide">
          <ChartHeader title="Volume 7 ngày" value={fmtUSD(dailyVolume)} />
          <div className="daily-chart">
            {dailyRows.map((row) => (
              <div key={row.label} className="daily-chart-item">
                <div className="daily-chart-bar-wrap">
                  <span className="daily-chart-volume">{fmtCompactUSD(row.volume)}</span>
                  <div className="daily-chart-bar" style={{ height: `${Math.max(6, (row.volume / maxDailyVolume) * 100)}%` }} />
                </div>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card admin-chart-card">
          <ChartHeader title="Tỷ lệ thắng" value={`${winRate.toFixed(1)}%`} />
          <DonutChart percent={winRate} color="var(--profit)" />
          <div className="chart-note">
            <span>{stats.wins} lệnh thắng</span>
            <span>{Math.max(stats.trades - stats.wins, 0)} lệnh thua/hoà</span>
          </div>
        </section>

        <section className="card admin-chart-card">
          <ChartHeader title="Long / Short" value={`${longCount}/${shortCount}`} />
          <DonutChart percent={records.length ? (longCount / records.length) * 100 : 0} color="var(--accent)" />
          <div className="chart-note">
            <span>Long {longCount}</span>
            <span>Short {shortCount}</span>
          </div>
        </section>

        <section className="card admin-chart-card admin-chart-wide">
          <ChartHeader title="Volume theo cặp" value={`${symbolRows.length} cặp`} />
          <div className="symbol-chart">
            {symbolRows.length > 0 ? symbolRows.map((row) => (
              <div key={row.symbol} className="symbol-row">
                <div className="symbol-row-top">
                  <strong>{row.symbol}</strong>
                  <span>{fmtUSD(row.volume)}</span>
                </div>
                <div className="symbol-bar-track">
                  <div className="symbol-bar" style={{ width: `${Math.max(4, (row.volume / maxSymbolVolume) * 100)}%` }} />
                </div>
                <div className="symbol-row-meta">
                  <span>{row.trades} lệnh</span>
                  <span style={{ color: row.pnl >= 0 ? "var(--profit)" : "var(--loss)" }}>{fmtUSD(row.pnl)}</span>
                </div>
              </div>
            )) : (
              <div className="chart-empty">Chưa có dữ liệu giao dịch</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ChartHeader({ title, value }: { title: string; value: string }) {
  return (
    <div className="chart-header">
      <h2>{title}</h2>
      <span>{value}</span>
    </div>
  );
}

function DonutChart({ percent, color }: { percent: number; color: string }) {
  const safePercent = Math.max(0, Math.min(100, percent));
  const background = `conic-gradient(${color} ${safePercent * 3.6}deg, rgba(255,255,255,0.08) 0deg)`;

  return (
    <div className="donut-chart" style={{ background }}>
      <div>
        <strong>{safePercent.toFixed(0)}%</strong>
      </div>
    </div>
  );
}

function fmtUSD(value: number) {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtCompactUSD(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
