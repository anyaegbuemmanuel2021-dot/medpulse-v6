/**
 * MedPulse Enterprise – Creator Studio Service  v6.0
 */
import {
  collection, query, where, orderBy, limit,
  getDocs, doc, getDoc,
} from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";
import type { CreatorStats, Post } from "@/types";

export async function getCreatorStats(userId: string, period = "30d"): Promise<CreatorStats | null> {
  const snap = await getDoc(doc(collection(db(), "creator_stats"), `${userId}_${period}`));
  return snap.exists() ? (snap.data() as CreatorStats) : null;
}

export async function getCreatorDrafts(userId: string): Promise<Post[]> {
  const snap = await getDocs(
    query(collection(db(), "posts"),
      where("userId", "==", userId),
      where("lifecycle", "==", "draft"),
      orderBy("updatedAt", "desc"),
      limit(20)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
}

export async function getScheduledPosts(userId: string): Promise<Post[]> {
  const snap = await getDocs(
    query(collection(db(), "posts"),
      where("userId", "==", userId),
      where("lifecycle", "==", "scheduled"),
      orderBy("scheduledAt", "asc"),
      limit(20)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
}
