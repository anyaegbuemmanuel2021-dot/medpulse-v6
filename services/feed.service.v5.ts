/**
 * MedPulse Enterprise – Feed Service  v5.0
 *
 * Score Formula (from Master Prompt):
 *   Score = (WatchTime × 40) + (Shares × 20) + (Saves × 15) + (Comments × 10) + (Likes × 5)
 *
 * Feed tabs: for_you | following | trending | communities | live | latest
 */

import {
  collection, query, where, orderBy, limit,
  startAfter, getDocs, addDoc, doc, getDoc,
  serverTimestamp, DocumentSnapshot,
} from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";
import type { Post, FeedTab, WatchActivity } from "@/types";

// ─── Score formula ────────────────────────────────────────────────────────────

export function computeFeedScore(p: {
  watchTimeSec: number;
  shares: number;
  saves: number;
  comments: number;
  likes: number;
}): number {
  return (
    p.watchTimeSec * 40 +
    p.shares       * 20 +
    p.saves        * 15 +
    p.comments     * 10 +
    p.likes        *  5
  );
}

// ─── Tab-based feed fetcher ────────────────────────────────────────────────────

interface FeedOptions {
  tab: FeedTab;
  userId: string | null;
  cursor: string | null;
  limit: number;
}

interface FeedResult {
  posts: Post[];
  nextCursor: string | null;
}

export async function getTabFeed(options: FeedOptions): Promise<FeedResult> {
  const { tab, userId, cursor, limit: lim } = options;
  const firestore = db();

  // Resolve cursor document
  let cursorDoc: DocumentSnapshot | null = null;
  if (cursor) {
    cursorDoc = await getDoc(doc(collection(firestore, "posts"), cursor));
  }

  let q;
  const postsRef = collection(firestore, "posts");
  const baseWhere = where("isDeleted", "==", false);
  const approvedWhere = where("isApproved", "==", true);

  switch (tab) {
    case "for_you": {
      // Personalized: use cached for_you_feed if available for authenticated user
      if (userId) {
        const fyDoc = await getDoc(doc(collection(firestore, "for_you_feed"), userId));
        if (fyDoc.exists()) {
          const postIds: string[] = fyDoc.data().postIds ?? [];
          const startIdx = cursor ? postIds.indexOf(cursor) + 1 : 0;
          const slice = postIds.slice(startIdx, startIdx + lim);
          const posts = await fetchPostsByIds(slice);
          return { posts, nextCursor: slice[slice.length - 1] ?? null };
        }
      }
      // Fallback: score-ranked public feed
      q = cursorDoc
        ? query(postsRef, baseWhere, approvedWhere, orderBy("feedScore", "desc"), startAfter(cursorDoc), limit(lim))
        : query(postsRef, baseWhere, approvedWhere, orderBy("feedScore", "desc"), limit(lim));
      break;
    }

    case "following": {
      if (!userId) {
        return { posts: [], nextCursor: null };
      }
      // Get following list
      const followSnap = await getDocs(
        query(collection(firestore, "follows"), where("followerId", "==", userId), limit(200))
      );
      const followingIds = followSnap.docs.map((d) => d.data().followingId as string);
      if (!followingIds.length) return { posts: [], nextCursor: null };

      // Firestore 'in' supports max 30
      const chunk = followingIds.slice(0, 30);
      q = cursorDoc
        ? query(postsRef, baseWhere, approvedWhere, where("userId", "in", chunk), orderBy("createdAt", "desc"), startAfter(cursorDoc), limit(lim))
        : query(postsRef, baseWhere, approvedWhere, where("userId", "in", chunk), orderBy("createdAt", "desc"), limit(lim));
      break;
    }

    case "trending": {
      q = cursorDoc
        ? query(postsRef, baseWhere, approvedWhere, where("isTrending", "==", true), orderBy("feedScore", "desc"), startAfter(cursorDoc), limit(lim))
        : query(postsRef, baseWhere, approvedWhere, where("isTrending", "==", true), orderBy("feedScore", "desc"), limit(lim));
      break;
    }

    case "communities": {
      if (!userId) {
        // Public community posts
        q = cursorDoc
          ? query(postsRef, baseWhere, approvedWhere, where("communityId", "!=", null), orderBy("communityId"), orderBy("feedScore", "desc"), startAfter(cursorDoc), limit(lim))
          : query(postsRef, baseWhere, approvedWhere, where("communityId", "!=", null), orderBy("communityId"), orderBy("feedScore", "desc"), limit(lim));
      } else {
        const memSnap = await getDocs(
          query(collection(firestore, "community_members"), where("userId", "==", userId), limit(50))
        );
        const communityIds = memSnap.docs.map((d) => d.data().communityId as string);
        if (!communityIds.length) return { posts: [], nextCursor: null };
        const chunk = communityIds.slice(0, 10);
        q = cursorDoc
          ? query(postsRef, baseWhere, approvedWhere, where("communityId", "in", chunk), orderBy("createdAt", "desc"), startAfter(cursorDoc), limit(lim))
          : query(postsRef, baseWhere, approvedWhere, where("communityId", "in", chunk), orderBy("createdAt", "desc"), limit(lim));
      }
      break;
    }

    case "live": {
      const streamsRef = collection(firestore, "live_streams");
      const streamsQ = cursorDoc
        ? query(streamsRef, where("status", "==", "live"), orderBy("viewerCount", "desc"), startAfter(cursorDoc), limit(lim))
        : query(streamsRef, where("status", "==", "live"), orderBy("viewerCount", "desc"), limit(lim));
      const snap = await getDocs(streamsQ);
      // Map live streams as a lightweight Post shape
      const posts: Post[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        contentType: "live_stream",
      } as unknown as Post));
      const last = snap.docs[snap.docs.length - 1];
      return { posts, nextCursor: last?.id ?? null };
    }

    case "latest":
    default: {
      q = cursorDoc
        ? query(postsRef, baseWhere, approvedWhere, orderBy("createdAt", "desc"), startAfter(cursorDoc), limit(lim))
        : query(postsRef, baseWhere, approvedWhere, orderBy("createdAt", "desc"), limit(lim));
      break;
    }
  }

  const snap = await getDocs(q);
  const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
  const last  = snap.docs[snap.docs.length - 1];
  return { posts, nextCursor: last?.id ?? null };
}

// ─── Watch time tracking ───────────────────────────────────────────────────────

export async function trackWatchActivity(
  postId: string,
  duration: number,
  action: WatchActivity["action"] = "view",
  completionRate = 0,
  userId?: string
): Promise<void> {
  try {
    const firestore = db();
    await addDoc(collection(firestore, "user_activity"), {
      userId:         userId ?? null,
      postId,
      action,
      duration,
      completionRate,
      timestamp:      serverTimestamp(),
    });
  } catch {
    // Non-blocking; don't surface tracking errors to users
  }
}

// ─── Batch-fetch posts by IDs ──────────────────────────────────────────────────

async function fetchPostsByIds(ids: string[]): Promise<Post[]> {
  if (!ids.length) return [];
  const firestore = db();
  const results = await Promise.all(
    ids.map((id) => getDoc(doc(collection(firestore, "posts"), id)))
  );
  return results
    .filter((d) => d.exists())
    .map((d) => ({ id: d.id, ...d.data() } as Post));
}
