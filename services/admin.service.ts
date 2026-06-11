/**
 * MedPulse Enterprise – Admin Service  v4.0
 * All write operations proxy through Cloud Functions for server-side RBAC.
 */
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  collection, query, where, orderBy, limit,
  getDocs, doc, getDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { getFirebaseFirestore } from "@/lib/firebase";
import type { AdminStats, UserRole } from "@/types";

const functions = getFunctions();

// ─── Role management ──────────────────────────────────────────────────────────

export async function assignRole(targetUid: string, role: UserRole) {
  const fn = httpsCallable(functions, "assignUserRole");
  return (await fn({ targetUid, role })).data;
}

// ─── Dashboard stats ──────────────────────────────────────────────────────────

export async function getAdminStats(): Promise<AdminStats> {
  const db = getFirebaseFirestore();
  const [usersSnap, postsSnap, flaggedSnap, pendingVerif, activeAds] = await Promise.all([
    getDocs(query(collection(db, "users"), limit(1))),
    getDocs(query(collection(db, "posts"), where("isDeleted", "==", false), limit(1))),
    getDocs(query(collection(db, "flagged_content"), limit(1))),
    getDocs(query(collection(db, "verification_requests"), where("status", "==", "pending"), limit(1))),
    getDocs(query(collection(db, "advertisements"), where("status", "==", "active"), limit(1))),
  ]);

  return {
    totalUsers: 0, // Use count queries in production
    activeUsers: 0,
    totalPosts: 0,
    flaggedContent: flaggedSnap.size,
    pendingVerifications: pendingVerif.size,
    activeAds: activeAds.size,
    reportedUsers: 0,
    systemHealth: { uptime: 99.9, responseTime: 120, errorRate: 0.01 },
  };
}

// ─── User management ──────────────────────────────────────────────────────────

export async function getUsersList(limitN = 50) {
  const db   = getFirebaseFirestore();
  const q    = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(limitN));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getUserById(uid: string) {
  const db   = getFirebaseFirestore();
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ─── Recycle bin ──────────────────────────────────────────────────────────────

export async function softDelete(itemType: string, originalId: string, col: string) {
  const fn = httpsCallable(functions, "softDelete");
  return (await fn({ itemType, originalId, collection: col })).data;
}

export async function restoreFromBin(binItemId: string) {
  const fn = httpsCallable(functions, "restoreFromBin");
  return (await fn({ binItemId })).data;
}

export async function getRecycleBin(limitN = 50) {
  const db   = getFirebaseFirestore();
  const q    = query(collection(db, "recycle_bin"), orderBy("deletedAt", "desc"), limit(limitN));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
