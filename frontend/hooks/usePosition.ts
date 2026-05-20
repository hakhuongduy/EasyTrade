"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "./useWallet";
import { getVaultContract } from "@/lib/contracts";
import { ethers } from "ethers";

export interface PositionData {
  symbol: string;
  isLong: boolean;
  size: string;
  sizeValue: number;
  collateral: string;
  collateralValue: number;
  averagePrice: string;
  averagePriceValue: number;
  pnl: string;
  pnlRaw: bigint;
  leverage: number;
  liquidationPrice: number;
  lastUpdated: number;
}

const DEFAULT_SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT"];

type PositionEventDetail = {
  action: "upsert" | "remove";
  position?: PositionData;
  symbol?: string;
  isLong?: boolean;
};

export function usePositions(symbols = DEFAULT_SYMBOLS) {
  const { address, isConnected } = useWallet();
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [loading, setLoading] = useState(false);
  const hasLoadedRef = useRef(false);

  const fetchPositions = useCallback(async () => {
    if (!address || !isConnected) return;
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const vault = getVaultContract(new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL));
      const results: PositionData[] = [];

      // Kiểm tra cả Long và Short cho tất cả 10 symbols song song
      const checks = symbols.flatMap((sym) => [
        { sym, isLong: true },
        { sym, isLong: false },
      ]);

      await Promise.all(
        checks.map(async ({ sym, isLong }) => {
          const [size, collateral, averagePrice, , lastUpdated] = await vault.getPosition(address, sym, isLong) as [bigint, bigint, bigint, boolean, bigint];
          if (size === BigInt(0)) return;

          const sizeValue = Number(ethers.formatEther(size));
          const collateralValue = Number(ethers.formatEther(collateral));
          const averagePriceValue = Number(ethers.formatUnits(averagePrice, 8));
          const pnlRaw = await vault.getPositionPnl(address, sym, isLong) as bigint;
          const pnlValue = Number(ethers.formatEther(pnlRaw < BigInt(0) ? -pnlRaw : pnlRaw)) * (pnlRaw >= BigInt(0) ? 1 : -1);

          const pnlSign = pnlValue >= 0 ? "+" : "-";
          const pnlNum = Math.abs(pnlValue);
          const leverage = collateralValue > 0 ? sizeValue / collateralValue : 0;
          const liquidationPrice = sizeValue > 0 && averagePriceValue > 0
            ? isLong
              ? averagePriceValue * (1 - collateralValue / sizeValue)
              : averagePriceValue * (1 + collateralValue / sizeValue)
            : 0;

          results.push({
            symbol: sym,
            isLong,
            size: sizeValue.toLocaleString("vi-VN", { maximumFractionDigits: 2 }),
            sizeValue,
            collateral: collateralValue.toLocaleString("vi-VN", { maximumFractionDigits: 2 }),
            collateralValue,
            averagePrice: averagePriceValue.toLocaleString("vi-VN", { maximumFractionDigits: 2 }),
            averagePriceValue,
            pnl: `${pnlSign}$${pnlNum.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
            pnlRaw,
            leverage,
            liquidationPrice,
            lastUpdated: Number(lastUpdated),
          });
        })
      );

      setPositions(results);
      hasLoadedRef.current = true;
    } catch (err) {
      console.error("usePositions error:", err);
    } finally {
      setLoading(false);
    }
  }, [address, isConnected, symbols]);

  useEffect(() => {
    if (!isConnected) { setPositions([]); hasLoadedRef.current = false; return; }
    hasLoadedRef.current = false;
    void fetchPositions();
    const interval = setInterval(fetchPositions, 15_000);
    const refetchSoon = () => {
      void fetchPositions();
      window.setTimeout(() => { void fetchPositions(); }, 700);
      window.setTimeout(() => { void fetchPositions(); }, 2_000);
      window.setTimeout(() => { void fetchPositions(); }, 5_000);
    };
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<PositionEventDetail>).detail;
      if (detail?.action === "upsert" && detail.position) {
        setPositions((current) => [
          detail.position!,
          ...current.filter((pos) => !(pos.symbol === detail.position!.symbol && pos.isLong === detail.position!.isLong)),
        ]);
      }
      if (detail?.action === "remove" && detail.symbol && typeof detail.isLong === "boolean") {
        setPositions((current) => current.filter((pos) => !(pos.symbol === detail.symbol && pos.isLong === detail.isLong)));
      }
      refetchSoon();
    };
    window.addEventListener("easytrade:positions-updated", onUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener("easytrade:positions-updated", onUpdated);
    };
  }, [isConnected, fetchPositions]);

  return { positions, loading, refetch: fetchPositions };
}
