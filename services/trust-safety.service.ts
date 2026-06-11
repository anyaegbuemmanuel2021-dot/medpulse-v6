/**
 * MedPulse Enterprise – Trust & Safety Service  v6.0
 */
import {
  collection, query, where, orderBy, limit,
  getDocs, doc, getDoc, setDoc, updateDoc,
  serverTimestamp, addDoc,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseFirestore as db } from "@/lib/firebase";
import type { UserRiskScore, BanEvasionRecord, CoordinatedAbuseGroup, AppealCase } from "@/types";

// ─── Risk scoring ─────────────────────────────────────────────────────────────

export async function getUserRiskScore(userId: string): Promise<UserRiskScore | null> {
  const snap = await getDoc(doc(db(), "user_risk_scores", userId));
  return snap.exists() ? (snap.data() as UserRiskScore) : null;
}

export async function getHighRiskUsers(limitN = 50): Promise<UserRiskScore[]> {
  const snap = await getDocs(
    query(collection(db(), "user_risk_scores"),
      where("riskLevel", "in", ["high", "critical"]),
      orderBy("riskScore", "desc"),
      limit(limitN)
    )
  );
  return snap.docs.map((d) => d.data() as UserRiskScore);
}

// ─── Ban evasion ──────────────────────────────────────────────────────────────

export async function getSuspectedBanEvasion(limitN = 50): Promise<BanEvasionRecord[]> {
  const snap = await getDocs(
    query(collection(db(), "ban_evasion_records"),
      where("status", "==", "suspected"),
      orderBy("confidence", "desc"),
      limit(limitN)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as BanEvasionRecord));
}

export async function confirmBanEvasion(recordId: string, adminId: string) {
  const fn = httpsCallable(getFunctions(), "confirmBanEvasion");
  return (await fn({ recordId, adminId })).data;
}

// ─── Coordinated abuse ────────────────────────────────────────────────────────

export async function getCoordinatedAbuseGroups(limitN = 20): Promise<CoordinatedAbuseGroup[]> {
  const snap = await getDocs(
    query(collection(db(), "coordinated_abuse_groups"),
      where("actionTaken", "==", null),
      orderBy("detectedAt", "desc"),
      limit(limitN)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CoordinatedAbuseGroup));
}

// ─── Appeals ─────────────────────────────────────────────────────────────────

export async function submitAppeal(appeal: Omit<AppealCase, "id" | "status" | "submittedAt">) {
  return addDoc(collection(db(), "appeals"), {
    ...appeal,
    status: "pending",
    submittedAt: serverTimestamp(),
  });
}

export async function getPendingAppeals(limitN = 50): Promise<AppealCase[]> {
  const snap = await getDocs(
    query(collection(db(), "appeals"),
      where("status", "in", ["pending", "under_review"]),
      orderBy("submittedAt", "asc"),
      limit(limitN)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppealCase));
}

export async function resolveAppeal(
  appealId: string,
  resolution: { status: "approved" | "denied"; resolution: string; moderatorNotes?: string },
  adminId: string
) {
  const fn = httpsCallable(getFunctions(), "resolveAppeal");
  return (await fn({ appealId, ...resolution, adminId })).data;
}
