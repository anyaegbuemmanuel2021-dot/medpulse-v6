/**
 * MedPulse Enterprise – System Monitoring Service  v6.0
 */
import {
  collection, query, orderBy, limit, getDocs,
  where, onSnapshot,
} from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";
import type { SystemHealthSnapshot, SystemAlert } from "@/types";

export async function getLatestHealthSnapshot(): Promise<SystemHealthSnapshot | null> {
  const snap = await getDocs(
    query(collection(db(), "system_health"), orderBy("timestamp", "desc"), limit(1))
  );
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as SystemHealthSnapshot;
}

export async function getHealthHistory(limitN = 24): Promise<SystemHealthSnapshot[]> {
  const snap = await getDocs(
    query(collection(db(), "system_health"), orderBy("timestamp", "desc"), limit(limitN))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SystemHealthSnapshot));
}

export async function getActiveAlerts(limitN = 20): Promise<SystemAlert[]> {
  const snap = await getDocs(
    query(collection(db(), "system_alerts"),
      where("resolvedAt", "==", null),
      orderBy("createdAt", "desc"),
      limit(limitN)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SystemAlert));
}

export function subscribeToAlerts(callback: (alerts: SystemAlert[]) => void): () => void {
  return onSnapshot(
    query(collection(db(), "system_alerts"),
      where("resolvedAt", "==", null),
      orderBy("severity", "desc"),
      limit(10)
    ),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SystemAlert)))
  );
}
