/**
 * MedPulse Enterprise – Story Service  v6.0
 * 24-hour ephemeral stories with highlights.
 */
import {
  collection, query, where, orderBy, limit,
  getDocs, addDoc, doc, updateDoc, increment, serverTimestamp,
} from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";
import type { Story, StoryHighlight } from "@/types";

export async function getFollowingStories(followingIds: string[]): Promise<Story[]> {
  if (!followingIds.length) return [];
  const now = Date.now();
  const chunk = followingIds.slice(0, 10);
  const snap = await getDocs(
    query(collection(db(), "stories"),
      where("userId", "in", chunk),
      where("expiresAt", ">", now),
      orderBy("expiresAt", "asc"),
      limit(50)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Story));
}

export async function createStory(
  story: Omit<Story, "id" | "viewCount" | "reactions" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db(), "stories"), {
    ...story,
    viewCount: 0,
    reactions: {},
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function viewStory(storyId: string): Promise<void> {
  await updateDoc(doc(collection(db(), "stories"), storyId), {
    viewCount: increment(1),
  });
}

export async function getUserHighlights(userId: string): Promise<StoryHighlight[]> {
  const snap = await getDocs(
    query(collection(db(), "story_highlights"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(20)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StoryHighlight));
}
