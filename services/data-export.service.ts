/**
 * MedPulse Enterprise – Data Export & User Rights Service  v6.0
 * GDPR-aligned: users can export their data or request account deletion.
 */
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  collection, query, where, orderBy, limit,
  getDocs, addDoc, serverTimestamp,
} from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";
import type { DataRequest } from "@/types";

export async function requestDataExport(userId: string): Promise<{ requestId: string }> {
  const fn = httpsCallable<{ userId: string }, { requestId: string }>(
    getFunctions(), "requestDataExport"
  );
  return (await fn({ userId })).data;
}

export async function requestAccountDeletion(userId: string, reason?: string): Promise<void> {
  const fn = httpsCallable(getFunctions(), "requestAccountDeletion");
  await fn({ userId, reason });
}

export async function getUserDataRequests(userId: string): Promise<DataRequest[]> {
  const snap = await getDocs(
    query(collection(db(), "data_requests"),
      where("userId", "==", userId),
      orderBy("requestedAt", "desc"),
      limit(20)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DataRequest));
}

export async function getPendingDataRequests(limitN = 50): Promise<DataRequest[]> {
  const snap = await getDocs(
    query(collection(db(), "data_requests"),
      where("status", "in", ["pending", "processing"]),
      orderBy("requestedAt", "asc"),
      limit(limitN)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DataRequest));
}
