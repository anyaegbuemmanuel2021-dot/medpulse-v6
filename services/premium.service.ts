/**
 * MedPulse Enterprise – Premium Subscription Service  v5.0
 */
import {
  collection, query, where, limit, getDocs, doc, getDoc, serverTimestamp,
} from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";
import type { PremiumSubscription, PlanTier } from "@/types";

export async function getUserSubscription(userId: string): Promise<PremiumSubscription | null> {
  const snap = await getDocs(
    query(collection(db(), "premium_subscriptions"),
      where("userId", "==", userId),
      where("status", "in", ["active", "trial"]),
      limit(1)
    )
  );
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as PremiumSubscription;
}

export const PLAN_FEATURES: Record<PlanTier, string[]> = {
  free: ["Basic feed", "Community browsing", "Follow 100 users"],
  premium: [
    "Advanced analytics", "Priority support", "Enhanced profile", "No ads",
    "Community boosts", "Follow unlimited users",
  ],
  professional: [
    "Everything in Premium", "Verified creator tools", "Monetization",
    "Detailed audience insights", "Scheduling & drafts",
  ],
  enterprise: [
    "Everything in Professional", "Dedicated account manager",
    "Custom branding", "API access", "Team seats",
  ],
};

export function isPremium(sub: PremiumSubscription | null): boolean {
  return sub !== null && ["active", "trial"].includes(sub.status);
}
