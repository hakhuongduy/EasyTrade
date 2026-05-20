"use client";

import { useEffect, useState } from "react";
import { getAIConfig, setAIConfig, type AIConfig } from "@/lib/orders";

const MODELS = [
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    desc: "Nhanh, tiết kiệm, phù hợp phân tích tức thời cho người dùng.",
  },
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    desc: "Mạnh hơn, phân tích sâu hơn, dùng khi ưu tiên chất lượng.",
  },
];

export default function AdminSettings() {
  const [config, setConfig] = useState<AIConfig>({ model: "deepseek-v4-flash", temperature: 0.4, thinking: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const notify = (message: string, type: "success" | "error") => {
    window.dispatchEvent(new CustomEvent("easytrade:notify", { detail: { message, type } }));
  };

  useEffect(() => {
    getAIConfig().then((c) => {
      setConfig({
        model: MODELS.some((model) => model.id === c.model) ? c.model : "deepseek-v4-flash",
        temperature: Number.isFinite(c.temperature) ? c.temperature : 0.4,
        thinking: c.thinking ?? false,
      });
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setAIConfig(config);
      setSaved(true);
      notify("Đã lưu cài đặt AI", "success");
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      notify((error as Error)?.message ?? "Lưu cài đặt AI thất bại", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 28, maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6, color: "var(--text-primary)" }}>Cài đặt AI</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 28 }}>
        Chọn model DeepSeek dùng cho tính năng phân tích thị trường.
      </p>

      {loading ? (
        <div className="skeleton" style={{ height: 220, borderRadius: 8 }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--text-muted)", marginBottom: 12 }}>
              Model DeepSeek
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {MODELS.map((model) => {
                const active = config.model === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => setConfig({ ...config, model: model.id })}
                    style={{
                      padding: 14,
                      border: `1.5px solid ${active ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: 8,
                      cursor: "pointer",
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      textAlign: "left",
                      background: active ? "var(--accent-dim)" : "var(--card)",
                      color: "var(--text-primary)",
                      fontFamily: "inherit",
                    }}
                  >
                    <span style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${active ? "var(--accent)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "var(--bg)" }}>
                      {active && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }} />}
                    </span>
                    <span>
                      <span style={{ display: "block", fontWeight: 700, fontSize: 13, color: active ? "var(--accent)" : "var(--text-primary)" }}>{model.label}</span>
                      <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{model.desc}</span>
                      <code style={{ display: "inline-block", marginTop: 7, fontSize: 11, color: "var(--text-muted)" }}>{model.id}</code>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--text-muted)" }}>Temperature</label>
              <span style={{ fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>{config.temperature.toFixed(1)}</span>
            </div>
            <input type="range" min={0} max={1} step={0.1} value={config.temperature} onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
              <span>0 - chặt chẽ</span>
              <span>1 - linh hoạt</span>
            </div>
          </div>

          <label style={{ display: "inline-flex", alignItems: "center", gap: 10, width: "fit-content", fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!!config.thinking}
              onChange={(e) => setConfig({ ...config, thinking: e.target.checked })}
              style={{ width: 14, height: 14, flex: "0 0 auto", padding: 0 }}
            />
            <span>Bật thinking mode cho phân tích sâu hơn</span>
          </label>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button className="btn btn-accent" onClick={handleSave} disabled={saving} style={{ padding: "10px 24px" }}>
              {saving ? "Đang lưu..." : "Lưu cài đặt"}
            </button>
            {saved && <span style={{ fontSize: 13, color: "var(--profit)", fontWeight: 600 }}>Đã lưu thành công</span>}
          </div>

        </div>
      )}
    </div>
  );
}
