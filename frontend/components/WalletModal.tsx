"use client";

import { useEffect, useState } from "react";

interface WalletInfo {
  name:     string;
  icon:     React.ReactNode;
  provider: EthProvider;
}

type EthProvider = {
  isMetaMask?:       boolean;
  isTrust?:          boolean;
  isTrustWallet?:    boolean;
  isCoinbaseWallet?: boolean;
  isBraveWallet?:    boolean;
  providers?:        EthProvider[];
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type EIP6963ProviderEvent = Event & {
  detail?: {
    provider?: EthProvider;
  };
};

/* ── SVG icons ─────────────────────────────────────────────── */
const MetaMaskIcon = () => (
  <svg width="28" height="28" viewBox="0 0 318.6 318.6" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polygon fill="#E2761B" stroke="#E2761B" strokeLinecap="round" strokeLinejoin="round" points="274.1,35.5 174.6,109.4 193,65.8"/>
    <polygon fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round" points="44.4,35.5 143.1,110.1 125.6,65.8"/>
    <polygon fill="#D7C1B3" stroke="#D7C1B3" strokeLinecap="round" strokeLinejoin="round" points="238.3,206.8 211.8,247.4 268.5,263 284.8,207.7"/>
    <polygon fill="#D7C1B3" stroke="#D7C1B3" strokeLinecap="round" strokeLinejoin="round" points="33.9,207.7 50.1,263 106.8,247.4 80.3,206.8"/>
    <polygon fill="#D7C1B3" stroke="#D7C1B3" strokeLinecap="round" strokeLinejoin="round" points="103.6,138.2 87.8,162.1 144.1,164.6 142.1,104.1"/>
    <polygon fill="#D7C1B3" stroke="#D7C1B3" strokeLinecap="round" strokeLinejoin="round" points="214.9,138.2 175.9,103.4 174.6,164.6 230.8,162.1"/>
    <polygon fill="#233447" stroke="#233447" strokeLinecap="round" strokeLinejoin="round" points="106.8,247.4 140.6,230.9 111.4,208.1"/>
    <polygon fill="#233447" stroke="#233447" strokeLinecap="round" strokeLinejoin="round" points="177.9,230.9 211.8,247.4 207.1,208.1"/>
    <polygon fill="#CD6116" stroke="#CD6116" strokeLinecap="round" strokeLinejoin="round" points="211.8,247.4 177.9,230.9 180.6,253 180.3,262.3"/>
    <polygon fill="#CD6116" stroke="#CD6116" strokeLinecap="round" strokeLinejoin="round" points="106.8,247.4 138.3,262.3 138.1,253 140.6,230.9"/>
    <polygon fill="#E4751F" stroke="#E4751F" strokeLinecap="round" strokeLinejoin="round" points="138.8,193.5 110.6,185.2 130.5,176.1"/>
    <polygon fill="#E4751F" stroke="#E4751F" strokeLinecap="round" strokeLinejoin="round" points="179.7,193.5 188,176.1 208,185.2"/>
    <polygon fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round" points="106.8,247.4 111.6,206.8 80.3,207.7"/>
    <polygon fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round" points="238.3,207.7 206.9,206.8 211.8,247.4"/>
    <polygon fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round" points="230.8,162.1 174.6,164.6 179.8,193.5 188.1,176.1 208.1,185.2"/>
    <polygon fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round" points="110.6,185.2 130.6,176.1 138.8,193.5 144.1,164.6 87.8,162.1"/>
    <polygon fill="#C0AD9E" stroke="#C0AD9E" strokeLinecap="round" strokeLinejoin="round" points="87.8,162.1 111.4,208.1 110.6,185.2"/>
    <polygon fill="#C0AD9E" stroke="#C0AD9E" strokeLinecap="round" strokeLinejoin="round" points="208.1,185.2 207.1,208.1 230.8,162.1"/>
    <polygon fill="#C0AD9E" stroke="#C0AD9E" strokeLinecap="round" strokeLinejoin="round" points="144.1,164.6 138.8,193.5 145.4,227.6 146.9,182.7"/>
    <polygon fill="#C0AD9E" stroke="#C0AD9E" strokeLinecap="round" strokeLinejoin="round" points="174.6,164.6 171.9,182.6 173.1,227.6 179.8,193.5"/>
    <polygon fill="#EB8831" stroke="#EB8831" strokeLinecap="round" strokeLinejoin="round" points="179.8,193.5 173.1,227.6 177.9,230.9 208.1,208.1 207.1,185.2"/>  <polygon fill="#EB8831" stroke="#EB8831" strokeLinecap="round" strokeLinejoin="round" points="110.6,185.2 111.4,208.1 140.6,230.9 145.4,227.6 138.8,193.5"/>
    <polygon fill="#E8821C" stroke="#E8821C" strokeLinecap="round" strokeLinejoin="round" points="180.3,262.3 180.6,253 178.1,250.8 140.4,250.8 138.1,253 138.3,262.3 106.8,247.4 117.8,256.4 140.1,271.9 178.4,271.9 200.8,256.4 211.8,247.4"/>
    <polygon fill="#DFCEC3" stroke="#DFCEC3" strokeLinecap="round" strokeLinejoin="round" points="177.9,230.9 173.1,227.6 145.4,227.6 140.6,230.9 138.1,253 140.4,250.8 178.1,250.8"/>
    <polygon fill="#763D16" stroke="#763D16" strokeLinecap="round" strokeLinejoin="round" points="278.3,114.2 286.8,73.4 274.1,35.5 177.9,106.9 214.9,138.2 267.2,153.5 278.8,140 273.8,136.4 281.8,129.1 275.6,124.3 283.6,118.2"/>
    <polygon fill="#763D16" stroke="#763D16" strokeLinecap="round" strokeLinejoin="round" points="31.8,73.4 40.3,114.2 34.9,118.2 42.9,124.3 36.8,129.1 44.8,136.4 39.8,140 51.3,153.5 103.6,138.2 140.6,106.9 44.4,35.5"/>
    <polygon fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round" points="267.2,153.5 214.9,138.2 230.8,162.1 207.1,208.1 238.3,207.7 284.8,207.7"/>
    <polygon fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round" points="103.6,138.2 51.3,153.5 33.9,207.7 80.3,207.7 111.4,208.1 87.8,162.1"/>
    <polygon fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round" points="174.6,164.6 177.9,106.9 193.2,65.8 125.6,65.8 140.6,106.9 144.1,164.6 145.3,182.8 145.4,227.6 173.1,227.6 173.3,182.8"/>
  </svg>
);

const TrustIcon = () => (
  <svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="8" fill="#3375BB"/>
    <path d="M20 8L10 12.5V20C10 25.5 14.5 30.5 20 32C25.5 30.5 30 25.5 30 20V12.5L20 8Z" fill="white"/>
    <path d="M17 21L15 19L13.5 20.5L17 24L26.5 14.5L25 13L17 21Z" fill="#3375BB"/>
  </svg>
);

const CoinbaseIcon = () => (
  <svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="8" fill="#0052FF"/>
    <circle cx="20" cy="20" r="10" fill="white"/>
    <rect x="16" y="17" width="8" height="6" rx="1" fill="#0052FF"/>
  </svg>
);

const GenericWalletIcon = () => (
  <div style={{ width: 28, height: 28, borderRadius: 6, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
      <circle cx="17" cy="14" r="1.5" fill="white" stroke="none"/>
      <path d="M16 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2"/>
    </svg>
  </div>
);

function getWalletInfo(provider: EthProvider): { name: string; icon: React.ReactNode } {
  if (provider.isMetaMask && !provider.isTrust && !provider.isTrustWallet) {
    return { name: "MetaMask", icon: <MetaMaskIcon /> };
  }
  if (provider.isTrust || provider.isTrustWallet) {
    return { name: "Trust Wallet", icon: <TrustIcon /> };
  }
  if (provider.isCoinbaseWallet) {
    return { name: "Coinbase Wallet", icon: <CoinbaseIcon /> };
  }
  if (provider.isBraveWallet) {
    return { name: "Brave Wallet", icon: <GenericWalletIcon /> };
  }
  return { name: "Ví Web3", icon: <GenericWalletIcon /> };
}

export function detectWallets(): WalletInfo[] {
  if (typeof window === "undefined") return [];
  const eth = (window as unknown as { ethereum?: EthProvider }).ethereum;
  if (!eth) return [];

  const raw: EthProvider[] = eth.providers?.length ? eth.providers : [eth];
  return raw.map((p) => ({ provider: p, ...getWalletInfo(p) }));
}

interface WalletModalProps {
  onSelect: (provider: EthProvider) => void;
  onClose:  () => void;
}

export default function WalletModal({ onSelect, onClose }: WalletModalProps) {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);

  useEffect(() => {
    const list: WalletInfo[] = [];
    const seen = new Set<EthProvider>();

    // Chuẩn EIP-6963: Tìm các ví bị ẩn do TrustWallet override
    const handleEIP6963 = (e: EIP6963ProviderEvent) => {
      const provider = e.detail?.provider;
      if (provider && !seen.has(provider)) {
        seen.add(provider);
        list.push({ provider, ...getWalletInfo(provider) });
        setWallets([...list]);
      }
    };

    window.addEventListener("eip6963:announceProvider", handleEIP6963 as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Fallback EIP-1193 truyền thống (.ethereum / .providers)
    setTimeout(() => {
      const traditional = detectWallets();
      for (const t of traditional) {
        if (!seen.has(t.provider)) {
          seen.add(t.provider);
          list.push(t);
        }
      }
      setWallets([...list]);
    }, 100);

    return () => {
      window.removeEventListener("eip6963:announceProvider", handleEIP6963 as EventListener);
    };
  }, []);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-content" style={{ maxWidth: 360 }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Chọn ví</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Kết nối với ví Web3 của bạn</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, borderRadius: 4, fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {/* Wallet list */}
        <div style={{ padding: "12px 16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          {wallets.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontSize: 13 }}>
              Không tìm thấy ví nào.
              <br />
              <a href="https://metamask.io/download/" target="_blank" style={{ color: "var(--accent)", marginTop: 8, display: "inline-block" }}>
                Cài đặt MetaMask
              </a>
            </div>
          ) : (
            wallets.map((w, i) => (
              <button
                key={i}
                onClick={() => onSelect(w.provider)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 16px", fontFamily: "inherit",
                  background: "var(--bg)", border: "1px solid var(--border)",
                  borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600,
                  color: "var(--text-primary)", textAlign: "left", width: "100%",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = "var(--accent)"; el.style.background = "var(--accent-dim)"; }}
                onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = "var(--border)"; el.style.background = "var(--bg)"; }}
              >
                {w.icon}
                <span>{w.name}</span>
              </button>
            ))
          )}

          <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 8, lineHeight: 1.6 }}>
            Bằng cách kết nối, bạn đồng ý với điều khoản sử dụng. EasyTrade không lưu trữ private key của bạn.
          </div>
        </div>
      </div>
    </div>
  );
}
