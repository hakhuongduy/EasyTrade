"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { connectWallet, getEUSDBalance, getFaucetCooldown } from "@/lib/wallet";
import { getProvider, BASE_CHAIN_ID, setActiveProvider } from "@/lib/contracts";
import { ethers } from "ethers";

interface WalletContextType {
  address: string | null;
  balance: string;
  chainId: number | null;
  isConnected: boolean;
  isCorrectChain: boolean;
  cooldownSeconds: number;
  connect: (provider?: unknown) => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType>({} as WalletContextType);

type EthWindow = { ethereum?: { on: (e: string, cb: (v: unknown) => void) => void; removeListener: (e: string, cb: (v: unknown) => void) => void } };

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress]   = useState<string | null>(null);
  const [balance, setBalance]   = useState("0");
  const [chainId, setChainId]   = useState<number | null>(null);
  const [cooldownSeconds, setCooldown] = useState(0);

  const isConnected    = !!address;
  const isCorrectChain = chainId === BASE_CHAIN_ID;

  const refreshBalance = useCallback(async () => {
    if (!address) return;
    const [bal, cd] = await Promise.all([getEUSDBalance(address), getFaucetCooldown(address)]);
    setBalance(bal);
    setCooldown(cd);
  }, [address]);

  const connect = useCallback(async (selectedProvider?: unknown) => {
    const addr = await connectWallet(selectedProvider as Parameters<typeof connectWallet>[0]);
    setAddress(addr);
    const prov = getProvider();
    if (prov instanceof ethers.BrowserProvider) {
      const network = await prov.getNetwork();
      setChainId(Number(network.chainId));
    }
  }, []);

  const disconnect = useCallback(() => {
    setActiveProvider(null);
    setAddress(null);
    setBalance("0");
    setChainId(null);
    setCooldown(0);
  }, []);

  useEffect(() => {
    const eth = (window as unknown as EthWindow).ethereum;
    if (!eth) return;
    const onAccounts = (v: unknown) => {
      const a = v as string[];
      if (!a[0]) {
        disconnect();
        return;
      }
      setAddress(a[0]);
    };
    const onChain    = (v: unknown) => { setChainId(parseInt(v as string, 16)); };
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => { eth.removeListener("accountsChanged", onAccounts); eth.removeListener("chainChanged", onChain); };
  }, [disconnect]);

  useEffect(() => {
    if (!isConnected) return;
    const timeout = window.setTimeout(() => { void refreshBalance(); }, 0);
    const interval = setInterval(refreshBalance, 5_000);
    const onUpdated = () => { void refreshBalance(); };
    window.addEventListener("easytrade:balance-updated", onUpdated);
    return () => {
      window.clearTimeout(timeout);
      clearInterval(interval);
      window.removeEventListener("easytrade:balance-updated", onUpdated);
    };
  }, [isConnected, refreshBalance]);

  return (
    <WalletContext.Provider value={{ address, balance, chainId, isConnected, isCorrectChain, cooldownSeconds, connect, disconnect, refreshBalance }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
