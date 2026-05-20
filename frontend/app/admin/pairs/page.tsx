"use client";

import { useEffect, useState } from "react";
import { getPairRegistry, removePairConfig, setPairEnabled, upsertPairConfig, type PairConfig } from "@/lib/pairs";

export default function AdminPairs() {
  const [pairs, setPairs] = useState<PairConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSymbol, setSavingSymbol] = useState<string | null>(null);
  const [deletingSymbol, setDeletingSymbol] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newPriceFeedId, setNewPriceFeedId] = useState("");
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = async () => {
    const registry = await getPairRegistry();
    setPairs(registry);
    setLoading(false);
  };

  const notify = (message: string, type: "success" | "error") => {
    window.dispatchEvent(new CustomEvent("easytrade:notify", { detail: { message, type } }));
  };

  useEffect(() => { void load(); }, []);

  const togglePair = async (pair: PairConfig) => {
    setSavingSymbol(pair.symbol);
    try {
      const next = await setPairEnabled(pair.symbol, !pair.enabled);
      setPairs(next);
      notify(`${pair.enabled ? "Đã tắt" : "Đã bật"} ${pair.symbol}/eUSD`, "success");
    } catch (error) {
      notify((error as Error)?.message ?? "Cập nhật cặp thất bại", "error");
    } finally {
      setSavingSymbol(null);
    }
  };

  const handleAddOnChain = async () => {
    const symbol = newSymbol.trim().toUpperCase();
    const priceFeedId = newPriceFeedId.trim();
    const binanceSymbol = `${symbol}USDT`;
    if (!symbol || !priceFeedId) return;

    setAdding(true);
    setAddResult(null);
    try {
      const res = await fetch("/api/admin/add-pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, priceFeedId }),
      });
      const data = await res.json() as { success?: boolean; txHash?: string; error?: string };
      if (!data.success) {
        const message = data.error ?? "Lỗi không xác định";
        setAddResult({ ok: false, msg: message });
        notify(message, "error");
        return;
      }

      const next = await upsertPairConfig({
        symbol,
        pythFeedId: priceFeedId.replace(/^0x/i, ""),
        binanceSymbol,
        enabled: true,
        color: "#334155",
        fallbackPrice: 0,
        fallbackChange24h: 0,
      });
      setPairs(next);
      const successMessage = `Đã thêm ${symbol}. ${data.txHash ? `Tx: ${data.txHash.slice(0, 12)}...` : "Asset đã tồn tại on-chain."}`;
      setAddResult({ ok: true, msg: successMessage });
      notify(successMessage, "success");
      setNewSymbol("");
      setNewPriceFeedId("");
    } catch (error) {
      const message = (error as Error).message;
      setAddResult({ ok: false, msg: message });
      notify(message, "error");
    } finally {
      setAdding(false);
    }
  };

  const handleDeletePair = async (pair: PairConfig) => {
    if (!confirm(`Xóa ${pair.symbol}/eUSD khỏi danh sách giao dịch?`)) return;
    setDeletingSymbol(pair.symbol);
    try {
      const next = await removePairConfig(pair.symbol);
      setPairs(next);
      notify(`Đã xóa ${pair.symbol}/eUSD`, "success");
    } catch (error) {
      notify((error as Error)?.message ?? "Xóa cặp thất bại", "error");
    } finally {
      setDeletingSymbol(null);
    }
  };

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Cặp giao dịch</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" }}>Registry cặp dùng chung cho chart, giá, oracle và form lệnh</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>+ Thêm cặp mới</button>
      </div>

      {showAdd && (
        <div className="card admin-pair-add-card" style={{ padding: 20, marginBottom: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>Thêm cặp mới</h3>
          <div className="admin-pair-add-grid" style={{ display: "grid", gridTemplateColumns: "0.7fr 1.7fr auto", gap: 12, alignItems: "end" }}>
            <Field label="Symbol">
              <input value={newSymbol} onChange={(e) => setNewSymbol(e.target.value.toUpperCase())} placeholder="PEPE" style={{ textTransform: "uppercase" }} />
            </Field>
            <Field label="Pyth price feed ID">
              <input value={newPriceFeedId} onChange={(e) => setNewPriceFeedId(e.target.value)} placeholder="Có thể nhập có hoặc không có 0x" />
            </Field>
            <button className="btn btn-primary" onClick={handleAddOnChain} disabled={adding || !newSymbol || !newPriceFeedId}>
              {adding ? "Đang gửi..." : "Thêm"}
            </button>
          </div>
          {addResult && (
            <div style={{ fontSize: 12, color: addResult.ok ? "var(--profit)" : "var(--loss)", background: addResult.ok ? "var(--profit-bg)" : "var(--loss-bg)", padding: "8px 10px", borderRadius: 4 }}>
              {addResult.msg}
            </div>
          )}
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
            Pyth feed ID có thể nhập dạng có hoặc không có 0x. Chart nến sẽ tự dùng mã {newSymbol.trim() ? `${newSymbol.trim().toUpperCase()}USDT` : "SYMBOLUSDT"} làm dữ liệu nền.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
        {loading ? (
          [1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ height: 104, borderRadius: 6 }} />)
        ) : pairs.map((pair) => (
          <div key={pair.symbol} className="card" style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, opacity: savingSymbol === pair.symbol || deletingSymbol === pair.symbol ? 0.75 : 1 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: pair.color, display: "inline-block" }} />
                <div style={{ fontWeight: 800, fontSize: 15 }}>{pair.symbol}/eUSD</div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis" }}>Pyth: {pair.pythFeedId.slice(0, 10)}...</div>
              <div style={{ fontSize: 11, color: pair.enabled ? "var(--profit)" : "var(--text-muted)", fontWeight: 700, marginTop: 5 }}>{pair.enabled ? "Đang bật" : "Đang tắt"}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button className={pair.enabled ? "btn btn-accent" : "btn btn-outline"} style={{ minWidth: 62, padding: "6px 10px", fontSize: 12 }} onClick={() => togglePair(pair)} disabled={savingSymbol === pair.symbol || deletingSymbol === pair.symbol}>
                {pair.enabled ? "Tắt" : "Bật"}
              </button>
              <button className="btn btn-outline" style={{ minWidth: 62, padding: "6px 10px", fontSize: 12, color: "var(--loss)" }} onClick={() => handleDeletePair(pair)} disabled={savingSymbol === pair.symbol || deletingSymbol === pair.symbol}>
                {deletingSymbol === pair.symbol ? "..." : "Xóa"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</label>
      {children}
    </div>
  );
}
