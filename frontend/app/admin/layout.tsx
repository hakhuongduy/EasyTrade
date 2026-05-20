"use client";

import { useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import Image from "next/image";

// SVG icons cho sidebar nav (không dùng emoji)
const NAV = [
  {
    href: "/admin", label: "Tổng quan",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  },
  {
    href: "/admin/articles", label: "Bài viết",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  },
  {
    href: "/admin/pairs", label: "Cặp giao dịch",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  },
  {
    href: "/admin/settings", label: "Cài đặt AI",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  },
  {
    href: "/admin/users", label: "Người dùng",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) router.replace("/admin/login");
      else setReady(true);
    });
    return () => unsub();
  }, [router, isLoginPage]);

  if (isLoginPage) return <>{children}</>;

  if (!ready) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Đang xác thực...</div>
      </div>
    );
  }

  return (
    <div className="admin-shell" style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      {/* Sidebar */}
      <aside className="admin-sidebar" style={{ width: 220, background: "var(--header)", display: "flex", flexDirection: "column", flexShrink: 0, borderRight: "1px solid var(--border)" }}>

        {/* Logo */}
        <div style={{ padding: "18px 16px 14px", borderBottom: "1px solid var(--border)" }}>
          <Link href="/" style={{ display: "block", textDecoration: "none" }}>
            <Image src="/easytrade.png" alt="EasyTrade" width={100} height={28} style={{ objectFit: "contain" }} />
          </Link>
          <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginTop: 6 }}>
            Admin Panel
          </div>
        </div>

        {/* Nav */}
        <nav className="admin-nav" style={{ flex: 1, padding: "10px 0" }}>
          {NAV.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 16px",
                  color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                  background: isActive ? "rgba(254,219,113,0.08)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  textDecoration: "none", fontSize: 13, fontWeight: isActive ? 600 : 400,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { if (!isActive) { const el = e.currentTarget as HTMLAnchorElement; el.style.background = "rgba(255,255,255,0.04)"; el.style.color = "var(--text-secondary)"; } }}
                onMouseLeave={(e) => { if (!isActive) { const el = e.currentTarget as HTMLAnchorElement; el.style.background = "transparent"; el.style.color = "var(--text-muted)"; } }}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <Link href="/" style={{ fontSize: 12, color: "var(--text-muted)", textDecoration: "none" }}>
            Về trang chính
          </Link>
          <button
            onClick={() => auth.signOut().then(() => router.replace("/admin/login"))}
            style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 12, padding: "6px 10px", borderRadius: 6, cursor: "pointer", width: "100%", fontFamily: "inherit", transition: "all 0.15s" }}
            onMouseEnter={(e) => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = "var(--loss)"; el.style.color = "var(--loss)"; }}
            onMouseLeave={(e) => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = "var(--border)"; el.style.color = "var(--text-muted)"; }}
          >
            Đăng xuất
          </button>
        </div>
      </aside>

      <main className="admin-main" style={{ flex: 1, overflow: "auto" }}>{children}</main>
    </div>
  );
}
