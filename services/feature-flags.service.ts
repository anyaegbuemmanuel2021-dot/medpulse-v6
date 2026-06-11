/**
 * MedPulse Enterprise – Feature Flags Service  v6.0
 * No deployment required to toggle features.
 * All enforcement is server-side via Cloud Functions and Firestore Rules.
 */
import {
  doc, getDoc, setDoc, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseFirestore } from "@/lib/firebase";
import type { FeatureFlags } from "@/types";

const DEFAULT_FLAGS: Omit<FeatureFlags, "id" | "updatedBy" | "updatedAt"> = {
  stories:             true,
  liveStreaming:       true,
  marketplace:        true,
  jobBoard:           true,
  voiceNotes:         true,
  groupChats:         true,
  communities:        true,
  aiModeration:       true,
  twoFactorAuth:      true,
  userRegistration:   true,
  uploadsEnabled:     true,
  commentsEnabled:    true,
  messagingEnabled:   true,
  livestreamsEnabled: true,
  marketplaceEnabled: true,
  jobsEnabled:        true,
};

let cachedFlags: FeatureFlags | null = null;

export async function getFeatureFlags(): Promise<FeatureFlags> {
  if (cachedFlags) return cachedFlags;
  const db   = getFirebaseFirestore();
  const snap = await getDoc(doc(db, "feature_flags", "config"));
  cachedFlags = snap.exists()
    ? (snap.data() as FeatureFlags)
    : ({ id: "config", ...DEFAULT_FLAGS, updatedBy: "system", updatedAt: 0 } as FeatureFlags);
  return cachedFlags;
}

export function subscribeToFeatureFlags(
  callback: (flags: FeatureFlags) => void
): () => void {
  const db = getFirebaseFirestore();
  return onSnapshot(doc(db, "feature_flags", "config"), (snap) => {
    const flags = snap.exists()
      ? (snap.data() as FeatureFlags)
      : ({ id: "config", ...DEFAULT_FLAGS, updatedBy: "system", updatedAt: 0 } as FeatureFlags);
    cachedFlags = flags;
    callback(flags);
  });
}

export function isFeatureEnabled(
  flags: FeatureFlags,
  feature: keyof Omit<FeatureFlags, "id" | "updatedBy" | "updatedAt">
): boolean {
  return flags[feature] as boolean;
}

// Admin: update feature flags via Cloud Function (server-side RBAC enforced)
export async function updateFeatureFlag(
  flag: keyof Omit<FeatureFlags, "id" | "updatedBy" | "updatedAt">,
  value: boolean
) {
  const fn = httpsCallable(getFunctions(), "setFeatureFlag");
  return (await fn({ flag, value })).data;
}
