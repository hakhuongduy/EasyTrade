import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/hooks/useWallet";
import ToastHost from "@/components/ToastHost";

export const metadata: Metadata = {
  title: "EasyTrade — Giao dịch Crypto mô phỏng trên Base",
  description: "Nền tảng Learn-to-Trade với Perpetual Futures. Giao dịch BTC, ETH và 8 bluechip coins bằng eUSD mà không lo mất tiền thật. Được phân tích bởi AI.",
  keywords: "crypto trading, perpetual futures, DeFi, Base, learn to trade, EasyTrade",
  openGraph: {
    title: "EasyTrade",
    description: "Học giao dịch Crypto an toàn với AI phân tích thị trường",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <WalletProvider>
          {children}
          <ToastHost />
        </WalletProvider>
      </body>
    </html>
  );
}
