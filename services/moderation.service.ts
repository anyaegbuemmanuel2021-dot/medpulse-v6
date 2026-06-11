import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { ModerationFlag, ModerationStatus } from '@/types';

/**
 * Report content
 */
export async function reportContent(
  contentId: string,
  contentType: string,
  reportedBy: string,
  flag: ModerationFlag
): Promise<void> {
  const db = getFirebaseDb();
  const reportRef = doc(collection(db, 'moderation_reports'));

  await setDoc(reportRef, {
    id: reportRef.id,
    contentId,
    contentType,
    reportedBy,
    flag,
    status: 'pending',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Get pending moderation items
 */
export async function getPendingModerationItems(
  pageSize: number = 50
): Promise<any[]> {
  try {
    const db = getFirebaseDb();
    const snapshot = await getDocs(
      query(
        collection(db, 'moderation_reports'),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'asc'),
        limit(pageSize)
      )
    );

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
      };
    });
  } catch (error) {
    console.error('Error getting pending moderation items:', error);
    return [];
  }
}

/**
 * Update moderation action
 */
export async function updateModerationAction(
  reportId: string,
  action: 'approved' | 'rejected' | 'remove',
  reviewedBy: string,
  notes?: string
): Promise<void> {
  try {
    const db = getFirebaseDb();
    await updateDoc(doc(db, 'moderation_reports', reportId), {
      status: action === 'remove' ? 'removed' : 'reviewed',
      action,
      reviewedBy,
      reviewedAt: Timestamp.now(),
      notes: notes || null,
    });
  } catch (error) {
    console.error('Error updating moderation action:', error);
  }
}

/**
 * Auto-moderate using simple rules
 */
export function autoModerateContent(content: string): {
  shouldFlag: boolean;
  confidence: number;
  categories: Record<string, number>;
} {
  const flagPatterns: Record<string, RegExp[]> = {
    spam: [
      /\b(buy|click|follow|subscribe|check out)\b/gi,
      /http[s]?:\/\/[^\s]+/g,
      /(repeat){2,}/gi,
    ],
    violence: [
      /\b(kill|murder|attack|bomb|shoot)\b/gi,
      /death threat/gi,
    ],
    hate_speech: [
      /\b(hate|discriminat|racist|sexist)\b/gi,
    ],
  };

  const results: Record<string, number> = {};
  let totalMatches = 0;

  for (const [category, patterns] of Object.entries(flagPatterns)) {
    let matches = 0;
    for (const pattern of patterns) {
      const matched = content.match(pattern);
      matches += matched ? matched.length : 0;
    }
    results[category] = matches;
    totalMatches += matches;
  }

  const confidence = Math.min(totalMatches / 5, 1); // Normalize confidence
  const shouldFlag = confidence > 0.3;

  return {
    shouldFlag,
    confidence,
    categories: results,
  };
}

/**
 * Log moderation action
 */
export async function logModerationAction(
  action: string,
  targetId: string,
  targetType: string,
  performedBy: string,
  reason: string,
  result: 'success' | 'failure'
): Promise<void> {
  try {
    const db = getFirebaseDb();
    const logRef = doc(collection(db, 'moderation_logs'));

    await setDoc(logRef, {
      id: logRef.id,
      action,
      targetId,
      targetType,
      performedBy,
      reason,
      result,
      timestamp: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error logging moderation action:', error);
  }
}
