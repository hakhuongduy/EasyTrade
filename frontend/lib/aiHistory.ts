import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

export type AITrend = "BULLISH" | "BEARISH" | "SIDEWAYS";
export type AIRecommendation = "LONG" | "SHORT" | "WAIT";

export interface AIAnalysisResult {
  trend: AITrend;
  confidence: number;
  summary: string;
  marketTrend?: string;
  technicalAnalysis?: string;
  newsImpact?: string;
  support: number;
  resistance: number;
  recommendation: AIRecommendation;
  suggestedLeverage: number;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  invalidationPrice?: number;
  takeProfitZone?: string;
  stopLossZone?: string;
  actionPlan?: string[];
  sourcesUsed?: string[];
  reason: string;
}

export interface AIAnalysisRecord {
  id?: string;
  account: string;
  symbol: string;
  analysis: AIAnalysisResult;
  model?: string;
  dataSnapshot?: {
    currentPrice?: string;
    klinesData?: string[];
    marketTrend?: string[];
    news?: Array<{
      source: string;
      title: string;
      link: string;
      publishedAt?: string;
      summary?: string;
    }>;
  };
  generatedAt?: string;
  createdAt: Timestamp | null;
}

function localKey(account: string) {
  return `easytrade:ai-analysis-history:${account.toLowerCase()}`;
}

function getLocalHistory(account: string, symbol?: string, limitCount = 30): AIAnalysisRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(localKey(account));
    const records = raw ? JSON.parse(raw) as AIAnalysisRecord[] : [];
    return records
      .filter((record) => !symbol || record.symbol === symbol)
      .sort((a, b) => {
        const aTime = a.generatedAt ? Date.parse(a.generatedAt) : 0;
        const bTime = b.generatedAt ? Date.parse(b.generatedAt) : 0;
        return bTime - aTime;
      })
      .slice(0, limitCount);
  } catch {
    return [];
  }
}

function saveLocalHistory(record: Omit<AIAnalysisRecord, "id" | "createdAt">) {
  if (typeof window === "undefined") return `local-${Date.now()}`;
  const id = `local-${Date.now()}`;
  const nextRecord: AIAnalysisRecord = {
    ...record,
    id,
    generatedAt: record.generatedAt ?? new Date().toISOString(),
    createdAt: null,
  };
  const current = getLocalHistory(record.account, undefined, 200);
  const next = [nextRecord, ...current].slice(0, 200);
  window.localStorage.setItem(localKey(record.account), JSON.stringify(next));
  return id;
}

export async function saveAIAnalysisRecord(record: Omit<AIAnalysisRecord, "id" | "createdAt">) {
  try {
    const docRef = await addDoc(collection(db, "ai_analysis_history"), {
      ...record,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch {
    return saveLocalHistory(record);
  }
}

export async function getAIAnalysisHistory(account: string, symbol?: string, limitCount = 30): Promise<AIAnalysisRecord[]> {
  try {
    const constraints = [
      where("account", "==", account),
      ...(symbol ? [where("symbol", "==", symbol)] : []),
      orderBy("createdAt", "desc"),
      limit(limitCount),
    ];
    const q = query(collection(db, "ai_analysis_history"), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as AIAnalysisRecord));
  } catch {
    const fallback = query(collection(db, "ai_analysis_history"), where("account", "==", account));
    try {
      const snapshot = await getDocs(fallback);
      return snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as AIAnalysisRecord))
        .filter((record) => !symbol || record.symbol === symbol)
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
        .slice(0, limitCount);
    } catch {
      return getLocalHistory(account, symbol, limitCount);
    }
  }
}
