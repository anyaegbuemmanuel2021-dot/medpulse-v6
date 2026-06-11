/**
 * MedPulse Enterprise – Governance Service  v6.0
 * Policy management, escalations, transparency reports.
 */
import {
  collection, query, where, orderBy, limit,
  getDocs, doc, getDoc, setDoc, addDoc, serverTimestamp,
} from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";
import type {
  PolicyDocument, PolicyAcceptance, PolicyType,
  ModerationEscalation, TransparencyReport,
} from "@/types";

export async function getActivePolicy(type: PolicyType): Promise<PolicyDocument | null> {
  const snap = await getDocs(
    query(collection(db(), "policies"),
      where("type", "==", type),
      where("isActive", "==", true),
      limit(1)
    )
  );
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as PolicyDocument;
}

export async function recordPolicyAcceptance(
  userId: string,
  policyType: PolicyType,
  policyVersion: string,
  ipAddress?: string
) {
  await addDoc(collection(db(), "policy_acceptances"), {
    userId, policyType, policyVersion,
    acceptedAt: serverTimestamp(),
    ipAddress: ipAddress ?? null,
  });
}

export async function getUserPolicyAcceptances(userId: string): Promise<PolicyAcceptance[]> {
  const snap = await getDocs(
    query(collection(db(), "policy_acceptances"),
      where("userId", "==", userId),
      orderBy("acceptedAt", "desc")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PolicyAcceptance));
}

export async function escalateReport(
  escalation: Omit<ModerationEscalation, "id" | "status" | "createdAt">
) {
  return addDoc(collection(db(), "moderation_escalations"), {
    ...escalation,
    status: "open",
    createdAt: serverTimestamp(),
  });
}

export async function getTransparencyReports(): Promise<TransparencyReport[]> {
  const snap = await getDocs(
    query(collection(db(), "transparency_reports"), orderBy("publishedAt", "desc"), limit(10))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TransparencyReport));
}
