"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getEnabledPairRegistry } from "@/lib/pairs";

interface Article {
  id?: string;
  title: string;
  content: string;
  category: string;
  imageDataUrl?: string;
  practicePair?: string;
  practiceLeverage?: number;
  createdAt?: Timestamp | null;
}

const CATEGORIES = ["Cơ bản", "Phân tích kỹ thuật", "Quản lý vốn", "Blockchain"];
const DEFAULT_PRACTICE_LEVERAGE = 5;

const EMPTY: Omit<Article, "id" | "createdAt"> = {
  title: "",
  content: "",
  category: "Cơ bản",
  imageDataUrl: "",
  practicePair: "BTC",
  practiceLeverage: DEFAULT_PRACTICE_LEVERAGE,
};

function normalizePracticeLeverage(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PRACTICE_LEVERAGE;
  return Math.min(50, Math.max(1, Math.trunc(value)));
}

function parsePracticeLeverage(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? normalizePracticeLeverage(parsed) : undefined;
}

export default function AdminArticles() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [editing, setEditing] = useState<Article | null>(null);
  const [pairs, setPairs] = useState<string[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    const snap = await getDocs(query(collection(db, "articles"), orderBy("createdAt", "desc")));
    setArticles(snap.docs.map((item) => ({ id: item.id, ...item.data() } as Article)));
  };

  useEffect(() => {
    void load();
    getEnabledPairRegistry().then((registry) => setPairs(registry.map((pair) => pair.symbol)));
  }, []);

  const openNew = () => {
    setEditing({} as Article);
    setForm(EMPTY);
  };

  const openEdit = (article: Article) => {
    setEditing(article);
    setForm({
      title: article.title,
      content: article.content,
      category: article.category,
      imageDataUrl: article.imageDataUrl ?? "",
      practicePair: article.practicePair,
      practiceLeverage: normalizePracticeLeverage(article.practiceLeverage),
    });
  };

  const closeModal = () => setEditing(null);

  const handleImageFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, imageDataUrl: String(reader.result ?? "") }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, practiceLeverage: normalizePracticeLeverage(form.practiceLeverage) };
      if (editing?.id) {
        await updateDoc(doc(db, "articles", editing.id), payload);
      } else {
        await addDoc(collection(db, "articles"), { ...payload, createdAt: serverTimestamp() });
      }
      await load();
      closeModal();
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa bài viết này?")) return;
    setDeleting(id);
    await deleteDoc(doc(db, "articles", id));
    await load();
    setDeleting(null);
  };

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Bài viết lớp học</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" }}>{articles.length} bài viết</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Thêm bài viết</button>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface-raised)", borderBottom: "1px solid var(--border)" }}>
              {["Ảnh", "Tiêu đề", "Danh mục", "Thực hành", "Hành động"].map((heading) => (
                <th key={heading} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase" }}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => (
              <tr key={article.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td style={{ padding: "10px 14px", width: 88 }}>
                  {article.imageDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={article.imageDataUrl} alt="" style={{ width: 56, height: 38, objectFit: "cover", borderRadius: 4, border: "1px solid var(--border)" }} />
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>-</span>
                  )}
                </td>
                <td style={{ padding: "10px 14px", fontWeight: 700, maxWidth: 300 }}>{article.title}</td>
                <td style={{ padding: "10px 14px" }}><span className="badge badge-neutral">{article.category}</span></td>
                <td style={{ padding: "10px 14px", color: "var(--text-muted)" }}>{article.practicePair ? `${article.practicePair} ${normalizePracticeLeverage(article.practiceLeverage)}x` : "-"}</td>
                <td style={{ padding: "10px 14px", display: "flex", gap: 8 }}>
                  <button className="btn btn-outline" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => openEdit(article)}>Sửa</button>
                  <button className="btn" style={{ fontSize: 11, padding: "4px 10px", background: "var(--loss-bg)", color: "var(--loss)", border: "none" }} disabled={deleting === article.id} onClick={() => handleDelete(article.id!)}>
                    {deleting === article.id ? "..." : "Xóa"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {articles.length === 0 && <p style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Chưa có bài viết nào</p>}
      </div>

      {editing !== null && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && closeModal()}>
          <div className="modal-content" style={{ padding: 24, maxWidth: 620 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>{editing.id ? "Sửa bài viết" : "Thêm bài viết mới"}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Tiêu đề">
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Tên bài viết" />
              </Field>
              <Field label="Danh mục">
                <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                  {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                </select>
              </Field>
              <Field label="Nội dung">
                <textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} rows={6} placeholder="Nội dung bài viết..." style={{ resize: "vertical" }} />
              </Field>
              <Field label="Ảnh minh họa">
                <input type="file" accept="image/*" onChange={(event) => handleImageFile(event.target.files?.[0])} />
                {form.imageDataUrl && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.imageDataUrl} alt="" style={{ width: 132, height: 82, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />
                    <button className="btn btn-outline" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => setForm({ ...form, imageDataUrl: "" })}>Gỡ ảnh</button>
                  </div>
                )}
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Cặp thực hành">
                  <select value={form.practicePair} onChange={(event) => setForm({ ...form, practicePair: event.target.value })}>
                    <option value="">- Không -</option>
                    {pairs.map((pair) => <option key={pair}>{pair}</option>)}
                  </select>
                </Field>
                <Field label="Đòn bẩy mặc định">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={Number.isFinite(form.practiceLeverage) ? String(form.practiceLeverage) : ""}
                    onChange={(event) => setForm({ ...form, practiceLeverage: parsePracticeLeverage(event.target.value) })}
                  />
                </Field>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                <button className="btn btn-outline" onClick={closeModal}>Huỷ</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)" }}>{label}</label>
      {children}
    </div>
  );
}
