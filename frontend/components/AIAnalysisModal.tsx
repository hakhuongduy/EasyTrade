"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import {
  getAIAnalysisHistory,
  saveAIAnalysisRecord,
  type AIAnalysisRecord,
  type AIAnalysisResult,
} from "@/lib/aiHistory";

interface AIAnalysisModalProps {
  symbol: string;
  onClose: () => void;
}

type ApiResponse = {
  success?: boolean;
  error?: string;
  analysis?: AIAnalysisResult;
  model?: string;
  dataSnapshot?: AIAnalysisRecord["dataSnapshot"];
  generatedAt?: string;
};

const TREND_CONFIG = {
  BULLISH: { color: "var(--profit)", bg: "var(--profit-bg)", label: "Tăng" },
  BEARISH: { color: "var(--loss)", bg: "var(--loss-bg)", label: "Giảm" },
  SIDEWAYS: { color: "var(--text-muted)", bg: "var(--bg)", label: "Đi ngang" },
} satisfies Record<AIAnalysisResult["trend"], { color: string; bg: string; label: string }>;

const REC_CONFIG = {
  LONG: { color: "var(--profit)", label: "MUA LONG", bg: "var(--profit-bg)" },
  SHORT: { color: "var(--loss)", label: "BÁN SHORT", bg: "var(--loss-bg)" },
  WAIT: { color: "var(--text-muted)", label: "CHỜ ĐỢI", bg: "var(--bg)" },
} satisfies Record<AIAnalysisResult["recommendation"], { color: string; label: string; bg: string }>;

export default function AIAnalysisModal({ symbol, onClose }: AIAnalysisModalProps) {
  const { address, isConnected } = useWallet();
  const [activeTab, setActiveTab] = useState<"latest" | "history">("latest");
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<AIAnalysisRecord | null>(null);
  const [history, setHistory] = useState<AIAnalysisRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ model?: string; generatedAt?: string }>({});

  const notify = (message: string, type: "info" | "success" | "error" = "info") => {
    window.dispatchEvent(new CustomEvent("easytrade:notify", { detail: { message, type } }));
  };

  const loadHistory = useCallback(async () => {
    if (!address) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const records = await getAIAnalysisHistory(address, symbol, 30);
      setHistory(records);
    } catch (e) {
      console.error("[AI history]", e);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [address, symbol]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setSelectedRecord(null);
    setActiveTab("latest");
    try {
      const res = await fetch(`/api/analyze?pair=${symbol}`, { cache: "no-store" });
      const data = await res.json() as ApiResponse;
      if (!res.ok || !data.success || !data.analysis) throw new Error(data.error ?? "Không thể lấy phân tích");

      setAnalysis(data.analysis);
      setMeta({ model: data.model, generatedAt: data.generatedAt });

      if (address) {
        try {
          await saveAIAnalysisRecord({
            account: address,
            symbol,
            analysis: data.analysis,
            model: data.model,
            dataSnapshot: data.dataSnapshot,
            generatedAt: data.generatedAt,
          });
          await loadHistory();
          notify("Đã lưu lịch sử phân tích", "success");
        } catch (historyError) {
          console.error("[AI history save]", historyError);
          notify("Phân tích xong nhưng chưa lưu được lịch sử", "error");
        }
      }
    } catch (e: unknown) {
      setError((e as Error).message ?? "Không thể lấy phân tích");
    } finally {
      setLoading(false);
    }
  }, [address, loadHistory, symbol]);

  const currentAnalysis = selectedRecord?.analysis ?? analysis;
  const currentMeta = selectedRecord
    ? { model: selectedRecord.model, generatedAt: selectedRecord.generatedAt ?? selectedRecord.createdAt?.toDate().toISOString() }
    : meta;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ padding: 0, width: "min(720px, calc(100vw - 24px))" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--header)", borderRadius: "6px 6px 0 0" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>AI Phân tích {symbol}/eUSD</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>
              Lưu lịch sử theo ví {isConnected && address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "sau khi kết nối"}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.65)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
          <TabButton active={activeTab === "latest"} onClick={() => { setActiveTab("latest"); setSelectedRecord(null); }}>
            Phân tích mới
          </TabButton>
          <TabButton active={activeTab === "history"} onClick={() => setActiveTab("history")}>
            Lịch sử {history.length > 0 ? `(${history.length})` : ""}
          </TabButton>
        </div>

        <div style={{ padding: 20, maxHeight: "72vh", overflowY: "auto" }}>
          {activeTab === "history" ? (
            <HistoryPanel
              records={history}
              loading={historyLoading}
              isConnected={isConnected}
              onSelect={(record) => {
                setSelectedRecord(record);
                setActiveTab("latest");
              }}
            />
          ) : loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={runAnalysis} />
          ) : currentAnalysis ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <AnalysisToolbar
                title={selectedRecord ? "Đang xem lại lịch sử" : "Kết quả phân tích mới nhất"}
                description={selectedRecord ? "Bấm phân tích lại để lấy dữ liệu thị trường mới." : "Kết quả này chỉ đổi khi bạn chủ động chạy phân tích mới."}
                actionLabel="Phân tích lại"
                onAnalyze={runAnalysis}
              />
              <AnalysisView analysis={currentAnalysis} meta={currentMeta} isHistory={!!selectedRecord} />
            </div>
          ) : (
            <StartAnalysisState symbol={symbol} onAnalyze={runAnalysis} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "11px 16px",
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        fontSize: 13,
        fontWeight: active ? 800 : 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function LoadingState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: 13 }}>AI đang phân tích thị trường...</div>
      {[80, 60, 90, 70].map((w, i) => (
        <div key={i} className="skeleton" style={{ height: 16, width: `${w}%` }} />
      ))}
    </div>
  );
}

function StartAnalysisState({ symbol, onAnalyze }: { symbol: string; onAnalyze: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "28px 12px", textAlign: "center" }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 900, color: "var(--text-primary)", marginBottom: 6 }}>
          Sẵn sàng phân tích {symbol}/eUSD
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 420 }}>
          Modal sẽ không tự gọi AI khi mở nữa. Bấm phân tích khi cần lấy dữ liệu thị trường và tin tức mới nhất.
        </div>
      </div>
      <button type="button" className="btn btn-accent" onClick={onAnalyze} style={{ minWidth: 150 }}>
        Phân tích
      </button>
    </div>
  );
}

function AnalysisToolbar({ title, description, actionLabel, onAnalyze }: { title: string; description: string; actionLabel: string; onAnalyze: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 6,
        background: "var(--bg)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: "var(--text-primary)", marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 }}>{description}</div>
      </div>
      <button type="button" className="btn btn-accent" onClick={onAnalyze} style={{ flexShrink: 0 }}>
        {actionLabel}
      </button>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ textAlign: "center", padding: 20, color: "var(--loss)" }}>
      <div style={{ fontSize: 13 }}>{message}</div>
      <button type="button" className="btn btn-outline" style={{ marginTop: 12 }} onClick={onRetry}>Thử lại</button>
    </div>
  );
}

function AnalysisView({ analysis, meta, isHistory }: { analysis: AIAnalysisResult; meta: { model?: string; generatedAt?: string }; isHistory: boolean }) {
  const trend = TREND_CONFIG[analysis.trend];
  const rec = REC_CONFIG[analysis.recommendation];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {isHistory && (
        <div style={{ fontSize: 12, color: "var(--accent)", background: "var(--accent-dim)", border: "1px solid rgba(244,201,93,0.22)", borderRadius: 6, padding: "9px 11px" }}>
          Đang xem lại một bản phân tích cũ
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ background: trend.bg, color: trend.color, padding: "8px 14px", borderRadius: 4, fontWeight: 800, fontSize: 14 }}>
          {trend.label}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
            <span>Độ tin cậy</span><span style={{ fontWeight: 800, color: "var(--text-primary)" }}>{analysis.confidence}%</span>
          </div>
          <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, analysis.confidence))}%`, background: trend.color, borderRadius: 3 }} />
          </div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, padding: "10px 12px", background: "var(--bg)", borderRadius: 4, borderLeft: "3px solid var(--border)" }}>
        {analysis.summary}
      </div>

      <DetailBlock title="Xu hướng thị trường" content={analysis.marketTrend} />
      <DetailBlock title="Phân tích kỹ thuật" content={analysis.technicalAnalysis} />
      <DetailBlock title="Tác động tin tức" content={analysis.newsImpact} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <MetricBox label="Hỗ trợ" value={`$${analysis.support.toLocaleString("en-US")}`} color="var(--profit)" bg="var(--profit-bg)" />
        <MetricBox label="Kháng cự" value={`$${analysis.resistance.toLocaleString("en-US")}`} color="var(--loss)" bg="var(--loss-bg)" />
      </div>

      <div style={{ background: rec.bg, padding: 12, borderRadius: 4, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>KHUYẾN NGHỊ</div>
          <div style={{ fontWeight: 900, fontSize: 16, color: rec.color }}>{rec.label}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>ĐÒN BẨY ĐỀ XUẤT</div>
          <div style={{ fontWeight: 900, fontSize: 16, color: "var(--text-primary)" }}>{analysis.suggestedLeverage}x</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <MetricBox label="Rủi ro" value={analysis.riskLevel ?? "-"} color={riskColor(analysis.riskLevel)} bg="var(--bg)" />
        <MetricBox label="Vô hiệu" value={analysis.invalidationPrice ? `$${analysis.invalidationPrice.toLocaleString("en-US")}` : "-"} color="var(--text-primary)" bg="var(--bg)" />
        <MetricBox label="TP / SL" value={`${analysis.takeProfitZone || "-"} / ${analysis.stopLossZone || "-"}`} color="var(--text-primary)" bg="var(--bg)" />
      </div>

      {analysis.actionPlan && analysis.actionPlan.length > 0 && (
        <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 800, marginBottom: 8 }}>Kế hoạch hành động</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {analysis.actionPlan.map((item, index) => (
              <div key={`${item}-${index}`} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                <b style={{ color: "var(--accent)" }}>{index + 1}.</b>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>{analysis.reason}</div>

      {analysis.sourcesUsed && analysis.sourcesUsed.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
          Nguồn tin dùng: {analysis.sourcesUsed.join(", ")}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "var(--text-muted)", fontSize: 10 }}>
        <span>{meta.model ? `Model: ${meta.model}` : "Model: -"}</span>
        <span>{meta.generatedAt ? new Date(meta.generatedAt).toLocaleString("vi-VN") : ""}</span>
      </div>

      <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>
        Phân tích chỉ mang tính tham khảo, không phải lời khuyên tài chính.
      </div>
    </div>
  );
}

function MetricBox({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ padding: 10, background: bg, borderRadius: 4, textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ fontWeight: 800, color, fontSize: 15 }}>{value}</div>
    </div>
  );
}

function DetailBlock({ title, content }: { title: string; content?: string }) {
  if (!content) return null;
  return (
    <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 800, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65 }}>{content}</div>
    </div>
  );
}

function riskColor(risk?: string) {
  if (risk === "LOW") return "var(--profit)";
  if (risk === "HIGH") return "var(--loss)";
  return "var(--accent)";
}

function HistoryPanel({ records, loading, isConnected, onSelect }: { records: AIAnalysisRecord[]; loading: boolean; isConnected: boolean; onSelect: (record: AIAnalysisRecord) => void }) {
  if (!isConnected) {
    return <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 24, fontSize: 13 }}>Kết nối ví để xem lịch sử phân tích.</p>;
  }
  if (loading) return <div className="skeleton" style={{ height: 140, borderRadius: 8 }} />;
  if (records.length === 0) {
    return <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 24, fontSize: 13 }}>Chưa có lịch sử phân tích cho cặp này.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {records.map((record) => {
        const rec = REC_CONFIG[record.analysis.recommendation];
        const createdAt = record.createdAt?.toDate().toLocaleString("vi-VN") ?? (record.generatedAt ? new Date(record.generatedAt).toLocaleString("vi-VN") : "-");
        return (
          <button
            type="button"
            key={record.id}
            onClick={() => onSelect(record)}
            style={{
              border: "1px solid var(--border)",
              background: "var(--card)",
              borderRadius: 6,
              padding: 12,
              textAlign: "left",
              cursor: "pointer",
              display: "grid",
              gridTemplateColumns: "90px 1fr 90px",
              gap: 12,
              alignItems: "center",
              color: "var(--text-primary)",
            }}
          >
            <span style={{ fontWeight: 900 }}>{record.symbol}/eUSD</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{record.analysis.summary}</span>
              <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{createdAt}</span>
            </span>
            <span style={{ justifySelf: "end", color: rec.color, background: rec.bg, borderRadius: 4, padding: "5px 8px", fontSize: 11, fontWeight: 900 }}>
              {record.analysis.recommendation}
            </span>
          </button>
        );
      })}
    </div>
  );
}
