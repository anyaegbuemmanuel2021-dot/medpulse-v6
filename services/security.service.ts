/**
 * MedPulse Enterprise – Security Service  v4.0
 * Client-side wrapper for security Cloud Functions.
 * All enforcement is server-side; this is convenience only.
 */
import {
  collection, query, orderBy, limit, getDocs,
  doc, setDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseFirestore } from "@/lib/firebase";

const functions = getFunctions();

// ─── Login lockout ────────────────────────────────────────────────────────────

export async function checkLoginAllowed(
  email: string,
  ip?: string
): Promise<{ allowed: boolean; lockedUntil?: number }> {
  const fn = httpsCallable<
    { email: string; ip?: string },
    { allowed: boolean; lockedUntil?: number }
  >(functions, "checkLoginAllowed");
  const result = await fn({ email, ip });
  return result.data;
}

export async function recordFailedLogin(
  email: string,
  ip?: string,
  userAgent?: string
): Promise<void> {
  const fn = httpsCallable(functions, "recordFailedLogin");
  await fn({ email, ip, userAgent });
}

export async function clearFailedLogin(email: string): Promise<void> {
  const fn = httpsCallable(functions, "clearFailedLogin");
  await fn({ email });
}

// ─── User moderation ──────────────────────────────────────────────────────────

export async function banUser(targetUid: string, reason: string) {
  const fn = httpsCallable(functions, "banUser");
  return (await fn({ targetUid, reason })).data;
}

export async function suspendUser(targetUid: string, hours: number, reason: string) {
  const fn = httpsCallable(functions, "suspendUser");
  return (await fn({ targetUid, hours, reason })).data;
}

// ─── IP / Device bans ─────────────────────────────────────────────────────────

export async function blockIP(ip: string, reason: string, expiresAt?: number) {
  const db  = getFirebaseFirestore();
  const ref = doc(collection(db, "blocked_ips"), ip.replace(/[.:]/g, "_"));
  await setDoc(ref, { ip, reason, blockedAt: serverTimestamp(), expiresAt: expiresAt ?? null }, { merge: true });
}

export async function unblockIP(ip: string) {
  const db  = getFirebaseFirestore();
  await deleteDoc(doc(collection(db, "blocked_ips"), ip.replace(/[.:]/g, "_")));
}

export async function blockDevice(deviceId: string, reason: string) {
  const db  = getFirebaseFirestore();
  await setDoc(doc(collection(db, "blocked_devices"), deviceId), {
    deviceId, reason, blockedAt: serverTimestamp(),
  }, { merge: true });
}

// ─── Security log reader ──────────────────────────────────────────────────────

export async function getSecurityLogs(limitN = 50) {
  const db    = getFirebaseFirestore();
  const q     = query(collection(db, "security_logs"), orderBy("createdAt", "desc"), limit(limitN));
  const snap  = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAuditLogs(limitN = 50) {
  const db    = getFirebaseFirestore();
  const q     = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(limitN));
  const snap  = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
