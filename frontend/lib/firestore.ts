import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PnLRecord {
  id?: string;
  account: string;
  symbol: string;
  isLong: boolean;
  entryPrice: number;
  exitPrice: number;
  size: number;
  collateral: number;
  pnl: number;
  closedAt: Timestamp | null;
}

export interface KnowledgeArticle {
  id?: string;
  title: string;
  content: string;
  category: string;
  imageDataUrl?: string;
  practicePair?: string;
  practiceLeverage?: number;
  createdAt: Timestamp | null;
}

// ─── PnL History ─────────────────────────────────────────────────────────────

// Lưu lịch sử PnL sau khi trader đóng lệnh (được gọi từ frontend)
export async function savePnLRecord(record: Omit<PnLRecord, "id" | "closedAt">) {
  const docRef = await addDoc(collection(db, "pnl_history"), {
    ...record,
    closedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getPnLHistory(account: string, limitCount = 20): Promise<PnLRecord[]> {
  try {
    const q = query(
      collection(db, "pnl_history"),
      where("account", "==", account),
      orderBy("closedAt", "desc"),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as PnLRecord));
  } catch {
    const fallback = query(collection(db, "pnl_history"), where("account", "==", account));
    const snapshot = await getDocs(fallback);
    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as PnLRecord))
      .sort((a, b) => (b.closedAt?.seconds ?? 0) - (a.closedAt?.seconds ?? 0))
      .slice(0, limitCount);
  }
}

// ─── Knowledge Articles ───────────────────────────────────────────────────────

export async function getArticles(category?: string, limitCount = 10): Promise<KnowledgeArticle[]> {
  const q = category
    ? query(
        collection(db, "articles"),
        where("category", "==", category),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      )
    : query(collection(db, "articles"), orderBy("createdAt", "desc"), limit(limitCount));

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as KnowledgeArticle));
}
