/**
 * MedPulse Enterprise – Live Stream Service  v5.0
 */
import {
  collection, addDoc, query, where, orderBy, limit,
  getDocs, doc, updateDoc, serverTimestamp, increment,
} from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";
import type { LiveStream } from "@/types";

export async function getLiveStreams(limitN = 20): Promise<LiveStream[]> {
  const snap = await getDocs(
    query(collection(db(), "live_streams"),
      where("status", "==", "live"),
      orderBy("viewerCount", "desc"),
      limit(limitN)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LiveStream));
}

export async function getScheduledStreams(limitN = 10): Promise<LiveStream[]> {
  const snap = await getDocs(
    query(collection(db(), "live_streams"),
      where("status", "==", "scheduled"),
      orderBy("scheduledFor", "asc"),
      limit(limitN)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LiveStream));
}

export async function createLiveStream(
  stream: Omit<LiveStream, "id" | "viewerCount" | "peakViewerCount" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db(), "live_streams"), {
    ...stream,
    viewerCount: 0,
    peakViewerCount: 0,
    status: "scheduled",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function incrementViewerCount(streamId: string): Promise<void> {
  await updateDoc(doc(collection(db(), "live_streams"), streamId), {
    viewerCount: increment(1),
  });
}
