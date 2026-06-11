/**
 * MedPulse Enterprise – Announcement Service  v6.0
 */
import {
  collection, query, where, orderBy, limit,
  getDocs, addDoc, serverTimestamp,
} from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";
import type { PlatformAnnouncement } from "@/types";

export async function getActiveAnnouncements(limitN = 5): Promise<PlatformAnnouncement[]> {
  const snap = await getDocs(
    query(collection(db(), "announcements"),
      where("isActive", "==", true),
      orderBy("createdAt", "desc"),
      limit(limitN)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlatformAnnouncement));
}

export async function createAnnouncement(
  announcement: Omit<PlatformAnnouncement, "id" | "createdAt">
) {
  return addDoc(collection(db(), "announcements"), {
    ...announcement,
    createdAt: serverTimestamp(),
  });
}
