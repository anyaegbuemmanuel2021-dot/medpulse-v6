/**
 * MedPulse Enterprise – Email Campaign Service  v4.0
 */
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp,
} from "firebase/firestore";
import { getFirebaseFirestore } from "@/lib/firebase";
import type { EmailCampaign, EmailTemplate, UserLabel, UserRole } from "@/types";

const functions = getFunctions();

export async function sendCampaign(options: {
  campaignId: string;
  subject: string;
  body: string;
  filter: {
    countries?: string[];
    labels?: UserLabel[];
    roles?: UserRole[];
    isVerified?: boolean;
  };
  scheduledAt?: number;
}) {
  const fn = httpsCallable(functions, "sendEmailCampaign");
  return (await fn(options)).data;
}

export async function saveEmailTemplate(template: Omit<EmailTemplate, "id" | "createdAt" | "updatedAt">) {
  const db = getFirebaseFirestore();
  return addDoc(collection(db, "email_templates"), {
    ...template,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function getEmailTemplates(limitN = 20) {
  const db   = getFirebaseFirestore();
  const q    = query(collection(db, "email_templates"), orderBy("createdAt", "desc"), limit(limitN));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as EmailTemplate & { id: string }));
}

export async function getCampaigns(limitN = 20) {
  const db   = getFirebaseFirestore();
  const q    = query(collection(db, "email_campaigns"), orderBy("createdAt", "desc"), limit(limitN));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as EmailCampaign & { id: string }));
}
