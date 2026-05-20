"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { claimFaucet } from "@/lib/wallet";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import WalletModal from "./WalletModal";

interface HeaderProps {
  selectedAsset?: string;
  onSelectAsset?: (symbol: string) => void;
  assets?: string[];
  currentPrice?: number;
  priceChange24h?: number;
}

const NAV_LINKS = [
  { href: "/",          label: "Giao dịch" },
  { href: "/portfolio", label: "Portfolio"  },
  { href: "/learn",     label: "Bài viết"   },
];

export default function Header({ selectedAsset, onSelectAsset, assets = [], currentPrice = 0, priceChange24h = 0 }: HeaderProps) {
  const pathname = usePathname();
  const { address, balance, isConnected, cooldownSeconds, connect, disconnect, refreshBalance } = useWallet();
  const [faucetLoading,  setFaucetLoading]  = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [showWallets,    setShowWallets]    = useState(false);

  const handleConnect = async (provider?: unknown) => {
    setConnectLoading(true);
    setShowWallets(false);
    try {
      await connect(provider);
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? String(e);
      let friendly = msg;
      if (msg.includes("already pending")) {
        friendly = "MetaMask đang có yêu cầu chờ xử lý. Mở MetaMask và xác nhận hoặc từ chối yêu cầu đó trước.";
      } else if (msg.includes("user rejected") || msg.includes("User rejected")) {
        friendly = "Bạn đã từ chối kết nối.";
      } else if (!msg.includes("MetaMask")) {
        friendly = msg.slice(0, 120);
      }
      console.error("[Connect Error]", msg);
      alert(friendly);
    } finally {
      setConnectLoading(false);
    }
  };

  const handleFaucet = async () => {
    setFaucetLoading(true);
    try {
      if (address) {
        await claimFaucet(address);
        window.dispatchEvent(new CustomEvent("easytrade:notify", { detail: { message: "Đã gửi yêu cầu faucet eUSD", type: "success", scope: "money" } }));
        window.dispatchEvent(new Event("easytrade:balance-updated"));
        window.setTimeout(() => window.dispatchEvent(new Event("easytrade:balance-updated")), 800);
        window.setTimeout(() => window.dispatchEvent(new Event("easytrade:balance-updated")), 2000);
        window.setTimeout(() => window.dispatchEvent(new Event("easytrade:balance-updated")), 5000);
        void refreshBalance();
      }
    }
    catch (e) {
      const message = (e as Error)?.message ?? "Không nhận được eUSD";
      window.dispatchEvent(new CustomEvent("easytrade:notify", { detail: { message, type: "error", scope: "money" } }));
      console.error(e);
    }
    finally { setFaucetLoading(false); }
  };

  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
  const isPositive   = priceChange24h >= 0;
  const isTrading    = pathname === "/";
  const visibleAssets = assets.length > 0 ? assets : selectedAsset ? [selectedAsset] : [];

  return (
    <header className="app-header" style={{
      background: "var(--header)",
      color: "#fff",
      padding: "0 24px",
      height: 58,
      display: "flex",
      alignItems: "center",
      gap: 0,
      position: "sticky",
      top: 0,
      zIndex: 100,
      borderBottom: "1px solid var(--border)",
    }}>
      {/* Logo — click vào để truy cập admin */}
      <Link href="/admin/login" style={{ display: "flex", alignItems: "center", flexShrink: 0, textDecoration: "none", marginRight: 24 }}>
        <Image src="/easytrade.png" alt="EasyTrade" width={110} height={32} style={{ objectFit: "contain" }} priority />
      </Link>

      <div style={{ width: 1, height: 18, background: "var(--border)", flexShrink: 0, marginRight: 20 }} />

      {/* Asset selector + Price — chỉ hiện ở trang Giao dịch */}
      {isTrading && selectedAsset && onSelectAsset && (
        <>
          <select
            value={selectedAsset}
            onChange={(e) => onSelectAsset(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border)",
              color: "#fff",
              padding: "6px 10px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              marginRight: 16,
            }}
          >
            {visibleAssets.map((a) => <option key={a} value={a} style={{ background: "#080b14" }}>{a}/eUSD</option>)}
          </select>

          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px" }}>
              ${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: currentPrice < 1 ? 4 : 2 })}
            </span>
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: isPositive ? "var(--profit)" : "var(--loss)",
              background: isPositive ? "var(--profit-bg)" : "var(--loss-bg)",
              padding: "2px 7px", borderRadius: 4,
            }}>
              {isPositive ? "+" : ""}{priceChange24h.toFixed(2)}%
            </span>
          </div>
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Main nav — bên phải */}
      <nav style={{ display: "flex", alignItems: "center", gap: 2, marginRight: 20 }}>
        {NAV_LINKS.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              style={{
                padding: "0 14px",
                height: 58,
                display: "flex",
                alignItems: "center",
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? "var(--text-primary)" : "var(--text-muted)",
                textDecoration: "none",
                borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-secondary)"; }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-muted)"; }}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div style={{ width: 1, height: 18, background: "var(--border)", flexShrink: 0, marginRight: 16 }} />

      {/* Balance */}
      {isConnected && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, marginRight: 16 }}>
          <span>eUSD</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {parseFloat(balance || "0").toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {/* Faucet */}
      {isConnected && (
        <button
          onClick={handleFaucet}
          disabled={faucetLoading || cooldownSeconds > 0}
          className="btn btn-outline"
          style={{ fontSize: 12, padding: "6px 12px", marginRight: 10 }}
          title={cooldownSeconds > 0 ? `Chờ thêm ${Math.ceil(cooldownSeconds / 3600)}h` : "Nhận 10,000 eUSD miễn phí"}
        >
          {faucetLoading ? "Đang nhận..." : cooldownSeconds > 0 ? `Cooldown ${Math.ceil(cooldownSeconds / 3600)}h` : "Nhận eUSD"}
        </button>
      )}

      {/* Connect wallet */}
      <button
        onClick={isConnected ? undefined : () => setShowWallets(true)}
        disabled={connectLoading}
        className="btn btn-accent"
        style={{ fontSize: 12, padding: "7px 16px", cursor: isConnected ? "default" : "pointer" }}
        title={isConnected ? "Ví đang kết nối" : "Kết nối ví"}
      >
        {connectLoading ? "Đang kết nối..." : isConnected ? shortAddress : "Kết nối Ví"}
      </button>
      {isConnected && (
        <button
          onClick={disconnect}
          className="btn btn-outline"
          style={{ fontSize: 12, padding: "7px 12px", marginLeft: 8 }}
          title="Ngắt kết nối ví"
        >
          Thoát ví
        </button>
      )}

      {/* Wallet picker modal */}
      {showWallets && (
        <WalletModal
          onSelect={(provider) => handleConnect(provider)}
          onClose={() => setShowWallets(false)}
        />
      )}
    </header>
  );
}
