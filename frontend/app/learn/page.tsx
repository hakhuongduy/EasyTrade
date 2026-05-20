"use client";

import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { getArticles, type KnowledgeArticle } from "@/lib/firestore";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const CATEGORIES = ["Tất cả", "Cơ bản", "Phân tích kỹ thuật", "Quản lý vốn", "Blockchain"];
const DEFAULT_PRACTICE_LEVERAGE = 5;

function normalizePracticeLeverage(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PRACTICE_LEVERAGE;
  return Math.min(50, Math.max(1, Math.trunc(value)));
}

function practiceHref(article: KnowledgeArticle) {
  if (!article.practicePair) return "/";
  const params = new URLSearchParams({
    asset: article.practicePair,
    leverage: String(normalizePracticeLeverage(article.practiceLeverage)),
  });
  return `/?${params.toString()}`;
}

export default function LearnPage() {
  const [active, setActive] = useState("Tất cả");
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadArticles() {
      const data = await getArticles(undefined, 50);
      if (cancelled) return;
      setArticles(data);
      setLoading(false);
    }
    void loadArticles();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(
    () => active === "Tất cả" ? articles : articles.filter((article) => article.category === active),
    [active, articles]
  );

  return (
    <div className="learn-page" style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Header />

      <main className="learn-shell" style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        <Link href="/" className="learn-back">
          <span aria-hidden="true">←</span>
          Giao dịch
        </Link>

        <section className="learn-hero">
          <div>
            <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>
              EasyTrade Academy
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "0", lineHeight: 1.15 }}>Lớp học giao dịch</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 8, maxWidth: 620 }}>
              Học từ cơ bản đến nâng cao: đọc chart, quản lý vốn, blockchain và chiến lược giao dịch.
            </p>
          </div>
          <div className="learn-hero-stat">
            <span>{articles.length}</span>
            <small>bài học</small>
          </div>
        </section>

        <div className="learn-filters" style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              className={active === cat ? "learn-filter-active" : undefined}
              style={{
                padding: "7px 14px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                border: "1px solid",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
                borderColor: active === cat ? "var(--accent)" : "var(--border)",
                background: active === cat ? "var(--accent-dim)" : "rgba(255,255,255,0.02)",
                color: active === cat ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="learn-grid">
            {[1, 2, 3].map((item) => <div key={item} className="skeleton" style={{ height: 180 }} />)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="learn-grid">
            {filtered.map((article) => (
              <article key={article.id ?? article.title} className="card learn-card">
                <div>
                  {article.imageDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={article.imageDataUrl} alt="" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)", marginBottom: 12 }} />
                  )}
                  <span className="badge badge-neutral">{article.category}</span>
                  <h2>{article.title}</h2>
                  <p>{article.content}</p>
                </div>
                <div className="learn-card-footer">
                  <span>{article.practicePair ? `${article.practicePair} ${normalizePracticeLeverage(article.practiceLeverage)}x` : "Lý thuyết"}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button type="button" className="learn-read-button" onClick={() => setSelectedArticle(article)}>Xem bài</button>
                    <Link href={practiceHref(article)}>Thực hành</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="card learn-empty">
            <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8 }}>
              Chưa có bài viết nào trong danh mục này.
              <br />
              Bài viết được tạo và quản lý từ trang Admin.
            </div>
          </div>
        )}
      </main>

      {selectedArticle && (
        <ArticleModal article={selectedArticle} onClose={() => setSelectedArticle(null)} />
      )}

      <BottomNav />
    </div>
  );
}

function ArticleModal({ article, onClose }: { article: KnowledgeArticle; onClose: () => void }) {
  const leverage = normalizePracticeLeverage(article.practiceLeverage);

  return (
    <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <article className="modal-content learn-article-modal" style={{ padding: 0, width: "min(820px, calc(100vw - 24px))", maxHeight: "86vh", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <span className="badge badge-neutral">{article.category}</span>
            <h2 style={{ fontSize: 22, lineHeight: 1.3, margin: "10px 0 0", color: "var(--text-primary)" }}>{article.title}</h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 24, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ overflowY: "auto", maxHeight: "calc(86vh - 82px)", padding: 20 }}>
          {article.imageDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={article.imageDataUrl} alt="" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)", marginBottom: 18 }} />
          )}
          <div style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
            {article.content}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
              {article.practicePair ? `Thực hành ${article.practicePair} với đòn bẩy ${leverage}x` : "Bài viết lý thuyết"}
            </span>
            <Link href={practiceHref(article)} className="btn btn-accent" style={{ textDecoration: "none" }}>
              Thực hành
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}
