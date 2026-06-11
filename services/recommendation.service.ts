/**
 * MedPulse Enterprise – Recommendation Service  v5.0
 * Reads pre-computed for_you_feed and interest_profiles written by Cloud Functions.
 */
import {
  collection, doc, getDoc, getDocs, query,
  where, orderBy, limit, setDoc, serverTimestamp,
} from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";
import type { InterestProfile, Post } from "@/types";

export async function getForYouFeed(userId: string, limitN = 20): Promise<Post[]> {
  const fyRef  = doc(collection(db(), "for_you_feed"), userId);
  const fySnap = await getDoc(fyRef);
  if (!fySnap.exists()) return [];

  const postIds: string[] = (fySnap.data().postIds ?? []).slice(0, limitN);
  const results = await Promise.all(
    postIds.map((id) => getDoc(doc(collection(db(), "posts"), id)))
  );
  return results
    .filter((d) => d.exists() && d.data()?.isDeleted !== true)
    .map((d) => ({ id: d.id, ...d.data() } as Post));
}

export async function getInterestProfile(userId: string): Promise<InterestProfile | null> {
  const snap = await getDoc(doc(collection(db(), "interest_profiles"), userId));
  return snap.exists() ? (snap.data() as InterestProfile) : null;
}

export async function updateInterestFromPost(
  userId: string,
  post: Partial<Post>,
  action: "view" | "like" | "save" | "share" | "comment"
): Promise<void> {
  const weight = { view: 1, like: 3, comment: 4, save: 5, share: 5 }[action];
  const ref    = doc(collection(db(), "interest_profiles"), userId);
  const snap   = await getDoc(ref);
  const profile: InterestProfile = snap.exists()
    ? (snap.data() as InterestProfile)
    : { userId, specialties: {}, contentTypes: {}, hashtags: {}, creators: {}, communities: {}, lastUpdated: 0 };

  if (post.specialty) profile.specialties[post.specialty] = (profile.specialties[post.specialty] ?? 0) + weight;
  if (post.contentType) profile.contentTypes[post.contentType] = (profile.contentTypes[post.contentType] ?? 0) + weight;
  if (post.userId) profile.creators[post.userId] = (profile.creators[post.userId] ?? 0) + weight;
  (post.tags ?? []).forEach((t) => { profile.hashtags[t] = (profile.hashtags[t] ?? 0) + weight; });
  profile.lastUpdated = Date.now();

  await setDoc(ref, { ...profile, lastUpdated: serverTimestamp() });
}
