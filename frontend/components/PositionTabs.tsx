"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { usePositions } from "@/hooks/usePosition";
import { getPnLHistory, savePnLRecord, type PnLRecord } from "@/lib/firestore";
import {
  getUserPendingOpenOrders,
  getUserPendingOrders,
  savePendingOrder,
  updateOpenOrderStatus,
  updateOrderStatus,
  type PendingOpenOrder,
  type PendingOrder,
} from "@/lib/orders";
import { getSigner } from "@/lib/contracts";

interface PositionTabsProps {
  selectedAsset: string;
  symbols?: string[];
  livePrices?: Record<string, number>;
}

type Tab = "open" | "history" | "pending";
type ToastType = "info" | "success" | "error";

export default function PositionTabs({ selectedAsset, symbols, livePrices }: PositionTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("open");
  const { positions, loading } = usePositions(symbols);
  const { address, isConnected } = useWallet();
  const [history, setHistory] = useState<PnLRecord[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [pendingOpenOrders, setPendingOpenOrders] = useState<PendingOpenOrder[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [closingKey, setClosingKey] = useState<string | null>(null);
  const [editingTPSL, setEditingTPSL] = useState<{ symbol: string; isLong: boolean; existing?: PendingOrder } | null>(null);
  const [tpDraft, setTpDraft] = useState("");
  const [slDraft, setSlDraft] = useState("");
  const tpslInFlightRef = useRef(false);
  const lastTPSLTriggerRef = useRef("");

  const visiblePositions = positions.filter((pos) => pos.symbol === selectedAsset);
  const visiblePending = pendingOrders.filter((order) => order.symbol === selectedAsset);
  const visibleOpenPending = pendingOpenOrders.filter((order) => order.symbol === selectedAsset);

  const notify = (message: string, type: ToastType = "info", scope?: "money") => {
    window.dispatchEvent(new CustomEvent("easytrade:notify", { detail: { message, type, scope } }));
  };

  const getLivePnl = (position: typeof positions[number]) => {
    const livePrice = livePrices?.[position.symbol];
    if (!livePrice || !position.averagePriceValue) return null;
    const priceDelta = position.isLong
      ? livePrice - position.averagePriceValue
      : position.averagePriceValue - livePrice;
    return (position.sizeValue * priceDelta) / position.averagePriceValue;
  };

  const formatPnl = (value: number) => {
    const sign = value >= 0 ? "+" : "-";
    return `${sign}$${Math.abs(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`;
  };

  const isTPSLTriggered = useCallback((order: PendingOrder, price?: number) => {
    if (!price) return false;
    const hitTP = order.tp !== null && (order.isLong ? price >= order.tp : price <= order.tp);
    const hitSL = order.sl !== null && (order.isLong ? price <= order.sl : price >= order.sl);
    return hitTP || hitSL;
  }, []);

  const triggeredTPSLKey = useMemo(() => pendingOrders
    .filter((order) => isTPSLTriggered(order, livePrices?.[order.symbol]))
    .map((order) => `${order.id}:${livePrices?.[order.symbol]}`)
    .join("|"), [isTPSLTriggered, livePrices, pendingOrders]);

  const loadPendingOrders = useCallback(async () => {
    if (!address) return;
    const [orders, openOrders] = await Promise.all([
      getUserPendingOrders(address),
      getUserPendingOpenOrders(address),
    ]);
    setPendingOrders(orders.filter((order) => order.status === "active"));
    setPendingOpenOrders(openOrders.filter((order) => order.status === "active"));
  }, [address]);

  const refreshHistory = useCallback(async () => {
    if (!address) return;
    const records = await getPnLHistory(address);
    setHistory(records);
    setHistoryLoaded(true);
  }, [address]);

  useEffect(() => {
    if (!address) return;
    const timeout = window.setTimeout(() => { void loadPendingOrders(); }, 0);
    const onPendingUpdated = () => { void loadPendingOrders(); };
    window.addEventListener("easytrade:pending-updated", onPendingUpdated);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("easytrade:pending-updated", onPendingUpdated);
    };
  }, [address, loadPendingOrders]);

  useEffect(() => {
    if (!isConnected || !address || pendingOrders.length === 0) return;
    let inFlight = false;

    const runTPSLKeeper = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/tpsl?account=${encodeURIComponent(address)}`, { cache: "no-store" });
        const data = await res.json() as { success?: boolean; executed?: number; error?: string; errors?: string[] };
        if (!res.ok || !data.success) throw new Error(data.error ?? "TP/SL keeper failed");
        if (data.executed && data.executed > 0) {
          await loadPendingOrders();
          await refreshHistory();
          window.dispatchEvent(new Event("easytrade:positions-updated"));
          window.dispatchEvent(new Event("easytrade:balance-updated"));
          notify("TP/SL đã khớp", "success", "money");
        } else if (data.errors && data.errors.length > 0) {
          notify(data.errors[0], "error", "money");
        }
      } catch (error) {
        notify((error as Error)?.message ?? "TP/SL keeper failed", "error", "money");
      } finally {
        inFlight = false;
      }
    };

    void runTPSLKeeper();
    const interval = window.setInterval(runTPSLKeeper, 1_000);
    window.addEventListener("focus", runTPSLKeeper);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", runTPSLKeeper);
    };
  }, [address, isConnected, loadPendingOrders, pendingOrders.length, refreshHistory]);

  useEffect(() => {
    if (!isConnected || !address || !triggeredTPSLKey || triggeredTPSLKey === lastTPSLTriggerRef.current || document.hidden) return;
    if (tpslInFlightRef.current) return;
    lastTPSLTriggerRef.current = triggeredTPSLKey;
    tpslInFlightRef.current = true;

    const executeTriggeredTPSL = async () => {
      try {
        const res = await fetch(`/api/tpsl?account=${encodeURIComponent(address)}`, { cache: "no-store" });
        const data = await res.json() as { success?: boolean; executed?: number; error?: string; errors?: string[] };
        if (!res.ok || !data.success) throw new Error(data.error ?? "TP/SL keeper failed");
        if (data.executed && data.executed > 0) {
          await loadPendingOrders();
          await refreshHistory();
          window.dispatchEvent(new Event("easytrade:positions-updated"));
          window.dispatchEvent(new Event("easytrade:balance-updated"));
          notify("TP/SL đã khớp", "success", "money");
        } else if (data.errors && data.errors.length > 0) {
          notify(data.errors[0], "error", "money");
        }
      } catch (error) {
        notify((error as Error)?.message ?? "TP/SL keeper failed", "error", "money");
      } finally {
        tpslInFlightRef.current = false;
      }
    };

    void executeTriggeredTPSL();
  }, [address, isConnected, loadPendingOrders, refreshHistory, triggeredTPSLKey]);

  const handleTabChange = async (tab: Tab) => {
    setActiveTab(tab);
    if (tab === "history" && !historyLoaded && address) await refreshHistory();
    if (tab === "pending" && address) await loadPendingOrders();
  };

  const handleClosePosition = async (symbol: string, isLong: boolean) => {
    const key = `${symbol}-${isLong}`;
    setClosingKey(key);
    try {
      if (!address) throw new Error("Chưa kết nối ví");
      const signer = await getSigner();
      const deadline = Math.floor(Date.now() / 1000) + 10 * 60;
      const message = `EasyTrade close position\naccount=${address.toLowerCase()}\nsymbol=${symbol}\nside=${isLong ? "LONG" : "SHORT"}\ndeadline=${deadline}`;
      const signature = await signer.signMessage(message);
      const res = await fetch("/api/trade/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: address, symbol, isLong, deadline, signature }),
      });
      const data = await res.json() as {
        success?: boolean;
        alreadyClosed?: boolean;
        error?: string;
        closedPosition?: {
          account: string;
          symbol: string;
          isLong: boolean;
          entryPrice: number;
          exitPrice: number;
          size: number;
          collateral: number;
          pnl: number;
        };
      };
      if (!res.ok || !data.success) throw new Error(data.error ?? "Đóng lệnh thất bại");
      if (data.closedPosition && !data.alreadyClosed) {
        await savePnLRecord(data.closedPosition);
        await refreshHistory();
        await loadPendingOrders();
        window.dispatchEvent(new Event("easytrade:history-updated"));
      }
      window.dispatchEvent(new CustomEvent("easytrade:positions-updated", {
        detail: { action: "remove", symbol, isLong },
      }));
      window.dispatchEvent(new Event("easytrade:balance-updated"));
      window.setTimeout(() => window.dispatchEvent(new Event("easytrade:positions-updated")), 1500);
      window.setTimeout(() => window.dispatchEvent(new Event("easytrade:balance-updated")), 1500);
      notify("Đã đóng lệnh", "success", "money");
    } catch (e) {
      notify((e as Error)?.message ?? "Đóng lệnh thất bại", "error", "money");
      console.error(e);
    } finally {
      setClosingKey(null);
    }
  };

  const handleEditTPSL = (symbol: string, isLong: boolean, existing?: PendingOrder) => {
    setEditingTPSL({ symbol, isLong, existing });
    setTpDraft(existing?.tp ? String(existing.tp) : "");
    setSlDraft(existing?.sl ? String(existing.sl) : "");
  };

  const handleSaveTPSL = async () => {
    if (!address || !editingTPSL) return;
    const tp = parseFloat(tpDraft);
    const sl = parseFloat(slDraft);
    if ((!Number.isFinite(tp) || tp <= 0) && (!Number.isFinite(sl) || sl <= 0)) {
      notify("Nhập TP hoặc SL hợp lệ", "error");
      return;
    }

    if (editingTPSL.existing?.id) await updateOrderStatus(editingTPSL.existing.id, "cancelled");
    await savePendingOrder({
      account: address,
      symbol: editingTPSL.symbol,
      isLong: editingTPSL.isLong,
      tp: Number.isFinite(tp) && tp > 0 ? tp : null,
      sl: Number.isFinite(sl) && sl > 0 ? sl : null,
      sizeDelta: 0,
      status: "active",
    });
    setEditingTPSL(null);
    setTpDraft("");
    setSlDraft("");
    await loadPendingOrders();
    notify("Đã lưu TP/SL", "success");
  };

  const handleCancelTPSL = async (existing?: PendingOrder) => {
    if (existing?.id) await updateOrderStatus(existing.id, "cancelled");
    setEditingTPSL(null);
    await loadPendingOrders();
    notify("Đã hủy TP/SL", "success");
  };

  const handleCancelLimit = async (existing?: PendingOpenOrder) => {
    if (existing?.id) await updateOpenOrderStatus(existing.id, "cancelled");
    await loadPendingOrders();
    notify("Đã hủy lệnh limit", "success");
  };

  const tabs = [
    { id: "open" as const, label: "Vị thế đang mở", count: visiblePositions.length },
    { id: "history" as const, label: "Lịch sử" },
    { id: "pending" as const, label: "Lệnh chờ", count: visiblePending.length + visibleOpenPending.length },
  ];

  return (
    <div className="card" style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
            style={{
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-muted)",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "inherit",
            }}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span style={{ background: "var(--accent)", color: "#15100a", borderRadius: 10, fontSize: 10, padding: "1px 6px", fontWeight: 800 }}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {!isConnected ? (
          <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 24, fontSize: 13 }}>Kết nối ví để xem vị thế</p>
        ) : activeTab === "open" ? (
          loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 74 }} />)}
            </div>
          ) : visiblePositions.length === 0 ? (
            <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 24, fontSize: 13 }}>Không có vị thế nào đang mở</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {visiblePositions.map((pos) => {
                const key = `${pos.symbol}-${pos.isLong}`;
                const livePnl = getLivePnl(pos);
                const displayPnl = livePnl ?? (pos.pnlRaw >= BigInt(0) ? 1 : -1);
                const isProfit = displayPnl >= 0;
                const activeTPSL = pendingOrders.find((order) => order.symbol === pos.symbol && order.isLong === pos.isLong);
                return (
                  <div key={key} className="position-row" style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 4, display: "grid", gridTemplateColumns: "minmax(140px, 1.25fr) repeat(6, minmax(74px, 1fr)) minmax(132px, auto) minmax(112px, auto)", alignItems: "center", gap: 12 }}>
                    <div className="position-row-symbol" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span className={`badge ${pos.isLong ? "badge-profit" : "badge-loss"}`}>{pos.isLong ? "LONG" : "SHORT"}</span>
                      <span style={{ fontWeight: 800 }}>{pos.symbol}/eUSD</span>
                    </div>
                    <Metric label="Kích thước" value={`$${pos.size}`} />
                    <Metric label="Ký quỹ" value={`$${pos.collateral}`} />
                    <Metric label="Đòn bẩy" value={`${pos.leverage.toFixed(1)}x`} />
                    <Metric label="Giá vào" value={`$${pos.averagePrice}`} />
                    <Metric label="Thanh lý" value={pos.liquidationPrice > 0 ? `$${pos.liquidationPrice.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}` : "-"} />
                    <Metric label="PnL" value={livePnl === null ? pos.pnl : formatPnl(livePnl)} color={isProfit ? "var(--profit)" : "var(--loss)"} />
                    <div className="position-row-tpsl" style={{ fontSize: 12, minWidth: 0 }}>
                      <div style={{ color: "var(--text-muted)", fontSize: 11 }}>TP/SL</div>
                      <button type="button" onClick={() => handleEditTPSL(pos.symbol, pos.isLong, activeTPSL)} className="btn btn-outline" style={{ minHeight: 28, padding: "4px 9px", fontSize: 11, width: "100%", whiteSpace: "nowrap" }}>
                        {activeTPSL ? `${activeTPSL.tp ?? "-"} / ${activeTPSL.sl ?? "-"}` : "Đặt TP/SL"}
                      </button>
                    </div>
                    <div className="position-row-close-wrap" style={{ fontSize: 12, minWidth: 0 }}>
                      <div aria-hidden="true" style={{ visibility: "hidden", fontSize: 11 }}>Action</div>
                      <button
                        type="button"
                        className="btn btn-outline position-row-close"
                        style={{ fontSize: 11, padding: "5px 8px", minWidth: 78, width: "auto", whiteSpace: "nowrap" }}
                        disabled={closingKey === key}
                        onClick={() => handleClosePosition(pos.symbol, pos.isLong)}
                      >
                        {closingKey === key ? "Đang..." : "Đóng"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : activeTab === "history" ? (
          history.length === 0 ? (
            <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 24, fontSize: 13 }}>Chưa có lịch sử giao dịch</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {history.map((record, i) => (
                <div key={record.id ?? i} style={{ padding: 10, borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ fontWeight: 700 }}>{record.symbol} {record.isLong ? "LONG" : "SHORT"}</span>
                  <span style={{ color: record.pnl >= 0 ? "var(--profit)" : "var(--loss)", fontWeight: 800 }}>
                    {record.pnl >= 0 ? "+" : ""}{record.pnl.toFixed(2)} eUSD
                  </span>
                </div>
              ))}
            </div>
          )
        ) : visiblePending.length === 0 && visibleOpenPending.length === 0 ? (
          <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 24, fontSize: 13 }}>Không có lệnh chờ</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visibleOpenPending.map((order) => (
              <div key={order.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr 1fr 92px", gap: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 4, alignItems: "center", fontSize: 12 }}>
                <span><span className={`badge ${order.isLong ? "badge-profit" : "badge-loss"}`}>LIMIT {order.isLong ? "LONG" : "SHORT"}</span></span>
                <span>Giá: <b>${order.limitPrice.toLocaleString("en-US")}</b></span>
                <span>Ký quỹ: <b>${order.collateral.toLocaleString("en-US")}</b></span>
                <span>Đòn bẩy: <b>{order.leverage}x</b></span>
                <button type="button" className="btn btn-outline" style={{ minHeight: 28, padding: "4px 10px", fontSize: 11 }} onClick={() => handleCancelLimit(order)}>Hủy</button>
              </div>
            ))}
            {visiblePending.map((order) => (
              <div key={order.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr 92px", gap: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 4, alignItems: "center", fontSize: 12 }}>
                <span><span className={`badge ${order.isLong ? "badge-profit" : "badge-loss"}`}>{order.isLong ? "LONG" : "SHORT"}</span></span>
                <span>TP: <b>{order.tp ?? "-"}</b></span>
                <span>SL: <b>{order.sl ?? "-"}</b></span>
                <button type="button" className="btn btn-outline" style={{ minHeight: 28, padding: "4px 10px", fontSize: 11 }} onClick={() => handleCancelTPSL(order)}>Hủy</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingTPSL && (
        <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.58)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" style={{ width: "min(420px, 100%)", padding: 18, boxShadow: "0 24px 80px rgba(0,0,0,0.45)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900 }}>Cài đặt TP/SL</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  {editingTPSL.symbol}/eUSD {editingTPSL.isLong ? "LONG" : "SHORT"}
                </div>
              </div>
              <button type="button" className="btn btn-outline" style={{ minHeight: 30, padding: "4px 10px" }} onClick={() => setEditingTPSL(null)}>Đóng</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Take Profit">
                <input value={tpDraft} onChange={(e) => setTpDraft(e.target.value)} placeholder="Giá TP" type="number" />
              </Field>
              <Field label="Stop Loss">
                <input value={slDraft} onChange={(e) => setSlDraft(e.target.value)} placeholder="Giá SL" type="number" />
              </Field>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              {editingTPSL.existing && (
                <button type="button" className="btn btn-outline" onClick={() => handleCancelTPSL(editingTPSL.existing)} style={{ color: "var(--loss)" }}>
                  Hủy TP/SL
                </button>
              )}
              <button type="button" className="btn btn-accent" onClick={handleSaveTPSL}>Lưu TP/SL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ fontSize: 12, minWidth: 0 }}>
      <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{label}</div>
      <b style={{ color: color ?? "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{value}</b>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--text-muted)", fontWeight: 700 }}>
      {label}
      {children}
    </label>
  );
}
