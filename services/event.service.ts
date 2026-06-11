/**
 * MedPulse Enterprise – Event Service  v5.0
 */
import {
  collection, addDoc, query, where, orderBy, limit,
  getDocs, doc, updateDoc, increment, serverTimestamp,
} from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";
import type { MedEvent } from "@/types";

export async function getUpcomingEvents(limitN = 20): Promise<MedEvent[]> {
  const snap = await getDocs(
    query(collection(db(), "events"),
      where("status", "==", "upcoming"),
      where("startDate", ">=", Date.now()),
      orderBy("startDate", "asc"),
      limit(limitN)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MedEvent));
}

export async function registerForEvent(eventId: string, userId: string): Promise<void> {
  await addDoc(collection(db(), "event_registrations"), {
    eventId, userId, registeredAt: serverTimestamp(),
  });
  await updateDoc(doc(collection(db(), "events"), eventId), {
    registeredCount: increment(1),
  });
}

export async function createEvent(
  event: Omit<MedEvent, "id" | "registeredCount" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(db(), "events"), {
    ...event,
    registeredCount: 0,
    status: "upcoming",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}
