"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import Image from "next/image";
import Link from "next/link";

export default function AdminLogin() {
  const router  = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/admin");
    } catch {
      setError("Email hoặc mật khẩu không đúng");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div className="card" style={{ width: 380, padding: "36px 28px" }}>
        <Link href="/" className="btn btn-outline" style={{ width: "fit-content", minHeight: 30, padding: "5px 10px", fontSize: 12, textDecoration: "none", marginBottom: 22 }}>
          ← Trang chính
        </Link>

        {/* Logo thật */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <Image src="/easytrade.png" alt="EasyTrade" width={140} height={40} style={{ objectFit: "contain" }} priority />
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>Đăng nhập Admin</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--text-muted)" }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@easytrade.vn" required autoFocus />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--text-muted)" }}>Mật khẩu</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: "var(--loss)", background: "var(--loss-bg)", padding: "9px 12px", borderRadius: 6, border: "1px solid rgba(244,63,94,0.2)" }}>{error}</div>
          )}

          <button type="submit" className="btn btn-accent" disabled={loading} style={{ width: "100%", padding: 12, marginTop: 4, fontSize: 14, fontWeight: 700 }}>
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}
