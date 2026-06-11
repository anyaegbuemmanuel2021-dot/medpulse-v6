/**
 * MedPulse Enterprise – Hashtag Service  v5.0
 */
import {
  collection, query, where, orderBy, limit, getDocs,
  doc, getDoc, setDoc, updateDoc, increment, serverTimestamp,
} from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";
import type { Hashtag, Post } from "@/types";

export async function getTrendingHashtags(n = 20): Promise<Hashtag[]> {
  const snap = await getDocs(
    query(collection(db(), "hashtags"), where("isTrending", "==", true),
      orderBy("trendScore", "desc"), limit(n))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Hashtag));
}

export async function getHashtagBySlug(slug: string): Promise<Hashtag | null> {
  const snap = await getDocs(
    query(collection(db(), "hashtags"), where("slug", "==", slug.toLowerCase()), limit(1))
  );
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Hashtag;
}

export async function getPostsByHashtag(slug: string, limitN = 24): Promise<Post[]> {
  const snap = await getDocs(
    query(collection(db(), "posts"),
      where("tags", "array-contains", slug.toLowerCase()),
      where("isApproved", "==", true),
      where("isDeleted", "==", false),
      orderBy("feedScore", "desc"),
      limit(limitN)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
}

export async function incrementHashtagCount(slug: string): Promise<void> {
  const id  = slug.toLowerCase().replace(/[^a-z0-9_]/g, "");
  const ref = doc(collection(db(), "hashtags"), id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, {
      postCount: increment(1),
      weeklyPostCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, {
      slug: id, displayName: `#${slug}`,
      postCount: 1, weeklyPostCount: 1, followerCount: 0,
      isTrending: false, trendScore: 0,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  }
}

export async function searchHashtags(term: string, n = 10): Promise<Hashtag[]> {
  // Firestore doesn't support LIKE; use prefix range trick
  const start = term.toLowerCase();
  const end   = start + "\uf8ff";
  const snap  = await getDocs(
    query(collection(db(), "hashtags"),
      where("slug", ">=", start), where("slug", "<=", end),
      orderBy("slug"), limit(n))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Hashtag));
}
