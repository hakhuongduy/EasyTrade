"use client";

import { useEffect, useRef, useState } from "react";

type ToastType = "info" | "success" | "error";

type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

type NotifyEvent = CustomEvent<{
  message: string;
  type?: ToastType;
}>;

export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const push = (message: string, type: ToastType = "info") => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      setToasts([{ id, message, type }]);
      hideTimerRef.current = window.setTimeout(() => {
        setToasts([]);
        hideTimerRef.current = null;
      }, 2000);
    };

    const onNotify = (event: Event) => {
      const detail = (event as NotifyEvent).detail;
      if (!detail?.message || !detail.type || detail.type === "info") return;
      push(detail.message, detail.type);
    };

    window.addEventListener("easytrade:notify", onNotify);
    return () => {
      window.removeEventListener("easytrade:notify", onNotify);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            minWidth: 240,
            maxWidth: "min(420px, calc(100vw - 32px))",
            padding: "13px 16px",
            borderRadius: 8,
            border: "1px solid",
            borderColor: toast.type === "error" ? "rgba(244,63,94,0.35)" : "rgba(16,185,129,0.35)",
            background: "rgba(12,16,25,0.88)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
            color: toast.type === "error" ? "var(--loss)" : "var(--profit)",
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1.35,
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
