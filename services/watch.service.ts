/**
 * MedPulse Enterprise – Watch History Service  v5.0
 */
import {
  collection, addDoc, query, where, orderBy, limit,
  getDocs, serverTimestamp,
} from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";
import type { WatchActivity } from "@/types";

export async function recordWatchHistory(
  userId: string,
  postId: string,
  duration: number,
  completionRate: number
): Promise<void> {
  await addDoc(collection(db(), "watch_history"), {
    userId, postId, duration, completionRate,
    watchedAt: serverTimestamp(),
  });
}

export async function getUserWatchHistory(userId: string, limitN = 50) {
  const snap = await getDocs(
    query(collection(db(), "watch_history"),
      where("userId", "==", userId),
      orderBy("watchedAt", "desc"),
      limit(limitN)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
