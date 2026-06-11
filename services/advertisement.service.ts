/**
 * MedPulse Enterprise – Advertisement Service  v4.0
 */
import {
  collection, addDoc, query, where, orderBy,
  limit, getDocs, serverTimestamp, updateDoc, doc,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseFirestore } from "@/lib/firebase";
import type { Advertisement } from "@/types";

const functions = getFunctions();

export async function submitAd(ad: Omit<Advertisement, "id" | "status" | "spent" | "impressions" | "clicks" | "ctr" | "createdAt" | "updatedAt">) {
  const db = getFirebaseFirestore();
  return addDoc(collection(db, "advertisements"), {
    ...ad,
    status: "pending",
    spent: 0, impressions: 0, clicks: 0, ctr: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function reviewAd(
  adId: string,
  action: "approve" | "reject" | "pause",
  reason?: string
) {
  const fn = httpsCallable(functions, "reviewAdvertisement");
  return (await fn({ adId, action, reason })).data;
}

export async function getActiveAds(limitN = 10) {
  const db   = getFirebaseFirestore();
  const q    = query(
    collection(db, "advertisements"),
    where("status", "==", "active"),
    orderBy("createdAt", "desc"),
    limit(limitN)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Advertisement & { id: string }));
}

export async function getPendingAds(limitN = 50) {
  const db   = getFirebaseFirestore();
  const q    = query(
    collection(db, "advertisements"),
    where("status", "==", "pending"),
    orderBy("createdAt", "asc"),
    limit(limitN)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Advertisement & { id: string }));
}
