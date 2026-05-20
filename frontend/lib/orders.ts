import {
  collection, addDoc, getDocs, updateDoc, doc,
  query, where, orderBy, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { getEnabledPairRegistry, getPairRegistry, setPairRegistry } from "./pairs";

export type OrderStatus = "active" | "executed" | "cancelled";

export interface PendingOrder {
  id?: string;
  account: string;
  symbol: string;
  isLong: boolean;
  tp: number | null;
  sl: number | null;
  sizeDelta: number;
  status: OrderStatus;
  createdAt: Timestamp | null;
  executedAt: Timestamp | null;
  txHash: string | null;
}

export interface PendingOpenOrder {
  id?: string;
  account: string;
  symbol: string;
  isLong: boolean;
  limitPrice: number;
  collateral: number;
  leverage: number;
  collateralWei: string;
  sizeWei: string;
  tp: number | null;
  sl: number | null;
  permit: {
    value: string;
    deadline: number;
    v: number;
    r: string;
    s: string;
  };
  status: OrderStatus;
  createdAt: Timestamp | null;
  executedAt: Timestamp | null;
  txHash: string | null;
}

export interface AIConfig {
  model: string;
  temperature: number;
  thinking?: boolean;
}

export interface AppConfig {
  ai: AIConfig;
  enabledPairs: string[];
}

export async function savePendingOrder(
  order: Omit<PendingOrder, "id" | "createdAt" | "executedAt" | "txHash">
): Promise<string> {
  const docRef = await addDoc(collection(db, "pending_orders"), {
    ...order,
    status: "active",
    createdAt: serverTimestamp(),
    executedAt: null,
    txHash: null,
  });
  return docRef.id;
}

export async function getActivePendingOrders(): Promise<PendingOrder[]> {
  const q = query(
    collection(db, "pending_orders"),
    where("status", "==", "active"),
    orderBy("createdAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as PendingOrder & { limitPrice?: number }))
    .filter((order) => typeof order.limitPrice !== "number");
}

export async function getUserPendingOrders(account: string): Promise<PendingOrder[]> {
  try {
    const q = query(
      collection(db, "pending_orders"),
      where("account", "==", account),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as PendingOrder & { limitPrice?: number }))
      .filter((order) => typeof order.limitPrice !== "number");
  } catch {
    const fallback = query(collection(db, "pending_orders"), where("account", "==", account));
    const snap = await getDocs(fallback);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as PendingOrder & { limitPrice?: number }))
      .filter((order) => typeof order.limitPrice !== "number")
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  }
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  txHash?: string
): Promise<void> {
  const ref = doc(db, "pending_orders", orderId);
  await updateDoc(ref, {
    status,
    txHash: txHash ?? null,
    executedAt: status === "executed" ? serverTimestamp() : null,
  });
}

export async function savePendingOpenOrder(
  order: Omit<PendingOpenOrder, "id" | "createdAt" | "executedAt" | "txHash">
): Promise<string> {
  const docRef = await addDoc(collection(db, "pending_orders"), {
    ...order,
    kind: "open_limit",
    status: "active",
    createdAt: serverTimestamp(),
    executedAt: null,
    txHash: null,
  });
  return docRef.id;
}

export async function getActivePendingOpenOrders(account?: string): Promise<PendingOpenOrder[]> {
  const constraints = account
    ? [where("status", "==", "active"), where("account", "==", account), orderBy("createdAt", "asc")]
    : [where("status", "==", "active"), orderBy("createdAt", "asc")];

  try {
    const q = query(collection(db, "pending_orders"), ...constraints);
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as PendingOpenOrder))
      .filter((order) => typeof order.limitPrice === "number");
  } catch {
    const fallback = account
      ? query(collection(db, "pending_orders"), where("account", "==", account))
      : query(collection(db, "pending_orders"), where("status", "==", "active"));
    const snap = await getDocs(fallback);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as PendingOpenOrder))
      .filter((order) => order.status === "active" && typeof order.limitPrice === "number")
      .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
  }
}

export async function getUserPendingOpenOrders(account: string): Promise<PendingOpenOrder[]> {
  return getActivePendingOpenOrders(account);
}

export async function updateOpenOrderStatus(
  orderId: string,
  status: OrderStatus,
  txHash?: string
): Promise<void> {
  const ref = doc(db, "pending_orders", orderId);
  await updateDoc(ref, {
    status,
    txHash: txHash ?? null,
    executedAt: status === "executed" ? serverTimestamp() : null,
  });
}

export async function getAIConfig(): Promise<AIConfig> {
  const { getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(db, "app_config", "ai"));
  if (snap.exists()) return snap.data() as AIConfig;
  return { model: "deepseek-v4-flash", temperature: 0.4, thinking: false };
}

export async function setAIConfig(config: AIConfig): Promise<void> {
  const { setDoc } = await import("firebase/firestore");
  await setDoc(doc(db, "app_config", "ai"), config);
}

export async function getEnabledPairs(): Promise<string[]> {
  const pairs = await getEnabledPairRegistry();
  return pairs.map((pair) => pair.symbol);
}

export async function setEnabledPairs(pairs: string[]): Promise<void> {
  const registry = await getPairRegistry();
  const enabled = new Set(pairs.map((pair) => pair.toUpperCase()));
  await setPairRegistry(registry.map((pair) => ({ ...pair, enabled: enabled.has(pair.symbol) })));
}
