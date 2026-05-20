"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { ethers } from "ethers";
import { BASE_CHAIN_ID, getEUSDContract, getSigner } from "@/lib/contracts";
import { savePendingOpenOrder, savePendingOrder } from "@/lib/orders";
import AIAnalysisModal from "./AIAnalysisModal";

interface OrderPanelProps {
  symbol: string;
  currentPrice: number;
  initialLeverage?: number;
}

const OPENING_FEE_BPS = 10;
const BASIS_POINTS = 10000;

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.6px",
};

function normalizeLeverage(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 10;
  return Math.min(50, Math.max(1, Math.trunc(value)));
}

export default function OrderPanel({ symbol, currentPrice, initialLeverage }: OrderPanelProps) {
  const { isConnected, address, refreshBalance } = useWallet();
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [isLong, setIsLong] = useState(true);
  const [collateral, setCollateral] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [leverage, setLeverage] = useState(() => normalizeLeverage(initialLeverage));
  const [showTPSL, setShowTPSL] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const collateralNum = parseFloat(collateral) || 0;
  const limitPriceNum = parseFloat(limitPrice) || 0;
  const estimatedEntryPrice = orderType === "limit" && limitPriceNum > 0 ? limitPriceNum : currentPrice;
  const sizeUSD = collateralNum * leverage;
  const fee = (sizeUSD * OPENING_FEE_BPS) / BASIS_POINTS;
  const collateralAfterFee = collateralNum - fee;
  const liqPrice = estimatedEntryPrice > 0 && collateralNum > 0
    ? isLong
      ? estimatedEntryPrice * (1 - collateralAfterFee / sizeUSD)
      : estimatedEntryPrice * (1 + collateralAfterFee / sizeUSD)
    : 0;

  const tpNum = parseFloat(tp) || 0;
  const slNum = parseFloat(sl) || 0;
  const tpError = tpNum > 0 && estimatedEntryPrice > 0 && (isLong ? tpNum <= estimatedEntryPrice : tpNum >= estimatedEntryPrice)
    ? `TP phải ${isLong ? "lớn hơn" : "nhỏ hơn"} giá vào`
    : null;
  const slError = slNum > 0 && estimatedEntryPrice > 0 && (isLong ? slNum >= estimatedEntryPrice : slNum <= estimatedEntryPrice)
    ? `SL phải ${isLong ? "nhỏ hơn" : "lớn hơn"} giá vào`
    : null;

  useEffect(() => {
    if (initialLeverage === undefined) return;
    setLeverage(normalizeLeverage(initialLeverage));
  }, [initialLeverage, symbol]);

  useEffect(() => {
    if (!isConnected || !address) return;
    const checkLimits = async () => {
      try {
        const res = await fetch(`/api/limit-orders?account=${encodeURIComponent(address)}`, { cache: "no-store" });
        const data = await res.json() as { executed?: number };
        if (data.executed && data.executed > 0) {
          window.dispatchEvent(new Event("easytrade:positions-updated"));
          window.dispatchEvent(new Event("easytrade:balance-updated"));
        }
      } catch {
        // Best-effort local keeper polling.
      }
    };
    const interval = window.setInterval(checkLimits, 3_000);
    void checkLimits();
    return () => window.clearInterval(interval);
  }, [address, isConnected]);

  const handleSubmit = async () => {
    if (!isConnected || !address) return setError("Vui lòng kết nối ví trước");
    if (!collateralNum || collateralNum <= 0) return setError("Nhập số tiền ký quỹ");
    if (orderType === "limit" && limitPriceNum <= 0) return setError("Nhập giá limit");
    if (tpError || slError) return setError(tpError ?? slError);
    setError(null);
    setNotice(null);
    setTxHash(null);
    setLoading(true);

    try {
      const collateralWei = ethers.parseEther(collateral);
      const sizeWei = ethers.parseEther(sizeUSD.toString());
      const signer = await getSigner();
      const token = getEUSDContract();
      const nonce = await token.nonces(address) as bigint;
      const deadline = Math.floor(Date.now() / 1000) + (orderType === "limit" ? 7 * 24 * 60 * 60 : 10 * 60);
      const signature = ethers.Signature.from(await signer.signTypedData(
        {
          name: "EasyTrade USD",
          version: "1",
          chainId: BASE_CHAIN_ID,
          verifyingContract: process.env.NEXT_PUBLIC_EUSD_ADDRESS!,
        },
        {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        {
          owner: address,
          spender: process.env.NEXT_PUBLIC_ROUTER_ADDRESS!,
          value: collateralWei,
          nonce,
          deadline,
        }
      ));

      if (orderType === "limit") {
        await savePendingOpenOrder({
          account: address,
          symbol,
          isLong,
          limitPrice: limitPriceNum,
          collateral: collateralNum,
          leverage,
          collateralWei: collateralWei.toString(),
          sizeWei: sizeWei.toString(),
          tp: showTPSL && tpNum > 0 ? tpNum : null,
          sl: showTPSL && slNum > 0 ? slNum : null,
          permit: {
            value: collateralWei.toString(),
            deadline,
            v: signature.v,
            r: signature.r,
            s: signature.s,
          },
          status: "active",
        });
        setNotice(`Đã đặt limit ${isLong ? "Long" : "Short"} ${symbol} tại $${limitPriceNum.toLocaleString("en-US")}`);
        window.dispatchEvent(new CustomEvent("easytrade:notify", { detail: { message: "Đã đặt lệnh limit", type: "success", scope: "money" } }));
        window.dispatchEvent(new Event("easytrade:pending-updated"));
        setCollateral("");
        setLimitPrice("");
        setTp("");
        setSl("");
        return;
      }

      const res = await fetch("/api/trade/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: address,
          symbol,
          collateralWei: collateralWei.toString(),
          sizeWei: sizeWei.toString(),
          isLong,
          permit: {
            value: collateralWei.toString(),
            deadline,
            v: signature.v,
            r: signature.r,
            s: signature.s,
          },
        }),
      });
      const data = await res.json() as { success?: boolean; txHash?: string; executionPrice?: number; error?: string };
      if (!res.ok || !data.success || !data.txHash) throw new Error(data.error ?? "Giao dịch thất bại");
      const entryPrice = data.executionPrice && data.executionPrice > 0 ? data.executionPrice : currentPrice;
      const actualLiqPrice = entryPrice > 0 && sizeUSD > 0
        ? isLong
          ? entryPrice * (1 - collateralAfterFee / sizeUSD)
          : entryPrice * (1 + collateralAfterFee / sizeUSD)
        : liqPrice;
      setTxHash(data.txHash);
      setNotice(`Giá khớp Pyth: $${entryPrice.toLocaleString("en-US", { maximumFractionDigits: entryPrice < 1 ? 6 : 2 })}. Giá đang hiển thị: $${currentPrice.toLocaleString("en-US", { maximumFractionDigits: currentPrice < 1 ? 6 : 2 })}.`);
      window.dispatchEvent(new CustomEvent("easytrade:notify", { detail: { message: "Đã mở lệnh market", type: "success", scope: "money" } }));
      window.dispatchEvent(new CustomEvent("easytrade:positions-updated", {
        detail: {
          action: "upsert",
          position: {
            symbol,
            isLong,
            size: sizeUSD.toLocaleString("vi-VN", { maximumFractionDigits: 2 }),
            sizeValue: sizeUSD,
            collateral: collateralAfterFee.toLocaleString("vi-VN", { maximumFractionDigits: 2 }),
            collateralValue: collateralAfterFee,
            averagePrice: entryPrice.toLocaleString("vi-VN", { maximumFractionDigits: 2 }),
            averagePriceValue: entryPrice,
            pnl: "+$0",
            pnlRaw: BigInt(0),
            leverage: collateralAfterFee > 0 ? sizeUSD / collateralAfterFee : leverage,
            liquidationPrice: actualLiqPrice,
            lastUpdated: Math.floor(Date.now() / 1000),
          },
        },
      }));
      window.setTimeout(() => window.dispatchEvent(new Event("easytrade:positions-updated")), 1500);

      if (showTPSL && (tpNum > 0 || slNum > 0)) {
        await savePendingOrder({ account: address, symbol, isLong, tp: tpNum > 0 ? tpNum : null, sl: slNum > 0 ? slNum : null, sizeDelta: 0, status: "active" });
        window.dispatchEvent(new Event("easytrade:pending-updated"));
      }
      setCollateral("");
      setTp("");
      setSl("");
      await refreshBalance();
      window.dispatchEvent(new Event("easytrade:balance-updated"));
      window.setTimeout(() => window.dispatchEvent(new Event("easytrade:balance-updated")), 1500);
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? "Giao dịch thất bại";
      setError(msg.includes("user rejected") ? "Giao dịch đã bị huỷ" : msg.slice(0, 120));
      window.dispatchEvent(new CustomEvent("easytrade:notify", { detail: { message: msg.includes("user rejected") ? "Giao dịch đã bị hủy" : msg.slice(0, 120), type: "error", scope: "money" } }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="card order-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--text-muted)" }}>Đặt lệnh</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>
            ${currentPrice.toLocaleString("en-US", { minimumFractionDigits: currentPrice < 1 ? 4 : 2, maximumFractionDigits: currentPrice < 1 ? 6 : 2 })}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {(["market", "limit"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setOrderType(type)}
              className={orderType === type ? "btn btn-accent" : "btn btn-outline"}
              style={{ minHeight: 32, padding: "6px 10px", fontSize: 12 }}
            >
              {type === "market" ? "Market" : "Limit"}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[true, false].map((longSide) => (
            <button
              key={String(longSide)}
              onClick={() => setIsLong(longSide)}
              style={{
                padding: "10px",
                fontSize: 13,
                fontWeight: 800,
                fontFamily: "inherit",
                borderRadius: 6,
                border: "1px solid",
                cursor: "pointer",
                background: isLong === longSide
                  ? longSide ? "linear-gradient(135deg,#059669,#10b981)" : "linear-gradient(135deg,#be123c,#f43f5e)"
                  : "transparent",
                borderColor: isLong === longSide
                  ? longSide ? "rgba(16,185,129,0.4)" : "rgba(244,63,94,0.4)"
                  : "var(--border)",
                color: isLong === longSide ? "#fff" : "var(--text-muted)",
              }}
            >
              {longSide ? "Long" : "Short"}
            </button>
          ))}
        </div>

        {orderType === "limit" && (
          <Field label="Giá limit">
            <input type="number" placeholder="0.00" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} min={0} />
          </Field>
        )}

        <Field label="Ký quỹ (eUSD)">
          <input type="number" placeholder="0.00" value={collateral} onChange={(e) => setCollateral(e.target.value)} min={0} />
        </Field>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={labelStyle}>Đòn bẩy</label>
            <span style={{ fontWeight: 800, fontSize: 16, color: leverage >= 20 ? "var(--loss)" : "var(--accent)", fontVariantNumeric: "tabular-nums" }}>{leverage}x</span>
          </div>
          <input type="range" min={1} max={50} step={1} value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {[1, 50].map((value) => (
              <span key={value} onClick={() => setLeverage(value)} style={{ fontSize: 10, color: leverage === value ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", fontWeight: 700 }}>
                {value}x
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setShowTPSL(!showTPSL)}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>Take Profit / Stop Loss</span>
          <div style={{ width: 36, height: 20, borderRadius: 10, background: showTPSL ? "var(--accent)" : "var(--border)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: 3, left: showTPSL ? 17 : 3, width: 14, height: 14, borderRadius: "50%", background: showTPSL ? "#0b0e1a" : "var(--text-muted)", transition: "left 0.2s" }} />
          </div>
        </div>

        {showTPSL && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Take Profit ($)" color="var(--profit)">
              <input type="number" placeholder={isLong ? "Cao hơn giá vào" : "Thấp hơn giá vào"} value={tp} onChange={(e) => setTp(e.target.value)} style={{ borderColor: tpError ? "var(--loss)" : undefined }} />
              {tpError && <span style={{ fontSize: 10, color: "var(--loss)" }}>{tpError}</span>}
            </Field>
            <Field label="Stop Loss ($)" color="var(--loss)">
              <input type="number" placeholder={isLong ? "Thấp hơn giá vào" : "Cao hơn giá vào"} value={sl} onChange={(e) => setSl(e.target.value)} style={{ borderColor: slError ? "var(--loss)" : undefined }} />
              {slError && <span style={{ fontSize: 10, color: "var(--loss)" }}>{slError}</span>}
            </Field>
          </div>
        )}

        {collateralNum > 0 && (
          <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
            <Row label="Kích thước" value={`$${sizeUSD.toLocaleString("en-US", { maximumFractionDigits: 2 })}`} bold />
            <Row label="Phí mở lệnh (0.1%)" value={`$${fee.toFixed(4)}`} />
            <Row label={orderType === "limit" ? "Giá limit" : "Giá Pyth hiện tại"} value={`$${estimatedEntryPrice.toLocaleString("en-US", { maximumFractionDigits: 6 })}`} bold />
            {orderType === "market" && <Row label="Giá khớp thật" value="Theo Pyth khi gửi lệnh" />}
            <Row label="Giá thanh lý" value={liqPrice > 0 ? `$${liqPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "-"} color="var(--loss)" />
            {showTPSL && tpNum > 0 && <Row label="Take Profit" value={`$${tpNum.toLocaleString("en-US")}`} color="var(--profit)" />}
            {showTPSL && slNum > 0 && <Row label="Stop Loss" value={`$${slNum.toLocaleString("en-US")}`} color="var(--loss)" />}
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: "var(--loss)", background: "var(--loss-bg)", padding: "9px 12px", borderRadius: 6, border: "1px solid rgba(244,63,94,0.2)" }}>{error}</div>}
        {notice && <div style={{ fontSize: 12, color: "var(--accent)", background: "var(--accent-dim)", padding: "9px 12px", borderRadius: 6, border: "1px solid rgba(244,201,93,0.2)" }}>{notice}</div>}
        {txHash && (
          <div style={{ fontSize: 12, color: "var(--profit)", background: "var(--profit-bg)", padding: "9px 12px", borderRadius: 6, border: "1px solid rgba(16,185,129,0.2)" }}>
            Lệnh thành công! <a href={`https://basescan.org/tx/${txHash}`} target="_blank" style={{ color: "var(--profit)", fontWeight: 700 }}>Xem trên Basescan</a>
          </div>
        )}

        <button className={`btn ${isLong ? "btn-long" : "btn-short"}`} onClick={handleSubmit} disabled={loading || !isConnected}>
          {!isConnected ? "Kết nối ví để giao dịch" : loading ? "Đang xử lý..." : `${orderType === "limit" ? "Đặt Limit" : "Mở Market"} ${isLong ? "Long" : "Short"} ${symbol}`}
        </button>

        <div className="divider" style={{ margin: "0" }} />

        <button className="btn btn-primary" onClick={() => setShowAI(true)} style={{ width: "100%", fontSize: 13, letterSpacing: "0.02em" }}>
          Phân tích AI - {symbol}
        </button>
      </div>

      {showAI && <AIAnalysisModal symbol={symbol} onClose={() => setShowAI(false)} />}
    </>
  );
}

function Field({ label, color, children }: { label: string; color?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ ...labelStyle, color: color ?? labelStyle.color }}>{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 500, color: color ?? "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
