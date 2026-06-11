/**
 * MedPulse Enterprise – AI Moderation Service  v6.0
 * Integrates Claude API via Cloud Functions for content classification.
 * All AI decisions are advisory; final actions are by human moderators.
 */
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  collection, query, where, orderBy, limit,
  getDocs, addDoc, serverTimestamp,
} from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";

export interface AIModerationResult {
  contentId: string;
  contentType: "post" | "comment" | "message" | "profile";
  text: string;
  scores: {
    spam: number;
    harassment: number;
    hateSpeech: number;
    nsfw: number;
    misinformation: number;
    scam: number;
    violence: number;
  };
  overallRisk: number;          // 0-1
  suggestedAction: "approve" | "review" | "hide" | "remove";
  categories: string[];
  hashtags: string[];           // AI-suggested hashtags
  processingMs: number;
  modelVersion: string;
}

export async function moderateContent(
  contentId: string,
  contentType: "post" | "comment" | "message" | "profile",
  text: string
): Promise<AIModerationResult> {
  const fn = httpsCallable<
    { contentId: string; contentType: string; text: string },
    AIModerationResult
  >(getFunctions(), "aiModerateContent");
  const result = await fn({ contentId, contentType, text });
  return result.data;
}

export async function suggestHashtags(text: string): Promise<string[]> {
  const fn = httpsCallable<{ text: string }, { hashtags: string[] }>(
    getFunctions(), "aiSuggestHashtags"
  );
  const result = await fn({ text });
  return result.data.hashtags;
}

export async function getFlaggedForAIReview(limitN = 50) {
  const snap = await getDocs(
    query(collection(db(), "ai_moderation_queue"),
      where("status", "==", "pending_human_review"),
      orderBy("overallRisk", "desc"),
      limit(limitN)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
