import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { EngagementMetrics } from '@/types';

interface UserInterest {
  userId: string;
  specialty: string;
  topic: string;
  score: number;
  lastUpdated: Date;
}

interface FeedScoreinput {
  postId: string;
  authorId: string;
  userId: string;
  watchTime?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  saves?: number;
  recency?: number;
  authorTrustScore?: number;
  userInterestMatch?: number;
}

/**
 * Calculate feed score for a post
 * TikTok-like algorithm with watch time as primary signal
 */
export function calculateFeedScore(
  engagement: EngagementMetrics,
  recencyHours: number,
  authorTrustScore: number = 0.5,
  userInterestMatch: number = 0.5
): number {
  // Weights for different signals
  const weights = {
    watchTime: 0.35,
    likes: 0.15,
    shares: 0.15,
    comments: 0.1,
    saves: 0.1,
    recency: 0.1,
    authorTrust: 0.05,
  };

  // Normalize signals (0-1 scale)
  const normalizedWatchTime = Math.min(engagement.watches / 100, 1);
  const normalizedLikes = Math.min(engagement.likes / 50, 1);
  const normalizedShares = Math.min(engagement.shares / 20, 1);
  const normalizedComments = Math.min(engagement.comments / 30, 1);
  const normalizedSaves = Math.min(engagement.saves / 25, 1);
  
  // Recency decay (24 hours = 1, older = lower)
  const recencyScore = Math.max(0, 1 - recencyHours / 24);

  // Calculate weighted score
  const score =
    weights.watchTime * normalizedWatchTime +
    weights.likes * normalizedLikes +
    weights.shares * normalizedShares +
    weights.comments * normalizedComments +
    weights.saves * normalizedSaves +
    weights.recency * recencyScore +
    weights.authorTrust * authorTrustScore;

  return score * 100; // Scale to 0-100
}

/**
 * Store user interests from interactions
 */
export async function recordUserInterest(
  userId: string,
  specialty: string,
  topic: string,
  score: number = 1
): Promise<void> {
  try {
    const db = getFirebaseDb();
    const interestRef = doc(
      db,
      `users/${userId}/interests`,
      `${specialty}_${topic}`.toLowerCase()
    );

    const interest: UserInterest = {
      userId,
      specialty,
      topic,
      score,
      lastUpdated: new Date(),
    };

    await setDoc(interestRef, {
      ...interest,
      lastUpdated: Timestamp.fromDate(interest.lastUpdated),
    });
  } catch (error) {
    console.error('Error recording user interest:', error);
  }
}

/**
 * Get user interests
 */
export async function getUserInterests(userId: string): Promise<UserInterest[]> {
  try {
    const db = getFirebaseDb();
    const snapshot = await getDocs(
      collection(db, `users/${userId}/interests`)
    );

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        lastUpdated: data.lastUpdated?.toDate?.() || new Date(data.lastUpdated),
      } as UserInterest;
    });
  } catch (error) {
    console.error('Error getting user interests:', error);
    return [];
  }
}

/**
 * Calculate user interest match score for a post
 */
export async function calculateUserInterestMatch(
  userId: string,
  postSpecialties: string[],
  postTags: string[]
): Promise<number> {
  const interests = await getUserInterests(userId);

  if (interests.length === 0) return 0.5; // Default score

  let matchScore = 0;
  let matches = 0;

  // Check specialty matches
  for (const interest of interests) {
    if (postSpecialties.includes(interest.specialty)) {
      matchScore += interest.score;
      matches++;
    }
    if (postTags.includes(interest.topic)) {
      matchScore += interest.score;
      matches++;
    }
  }

  return matches > 0 ? Math.min(matchScore / matches / 100, 1) : 0.3;
}

/**
 * Get author trust score
 */
export async function getAuthorTrustScore(authorId: string): Promise<number> {
  try {
    const db = getFirebaseDb();
    
    // Get author's posts
    const postsSnapshot = await getDocs(
      query(
        collection(db, 'posts'),
        where('authorId', '==', authorId),
        where('isDeleted', '==', false)
      )
    );

    if (postsSnapshot.empty) return 0.3; // New author

    // Calculate average engagement rate
    let totalEngagementRate = 0;
    let validPosts = 0;

    for (const postDoc of postsSnapshot.docs) {
      const post = postDoc.data();
      const engagement = post.engagementMetrics;
      const totalEngagement =
        (engagement.likes || 0) +
        (engagement.comments || 0) +
        (engagement.shares || 0);

      if (engagement.views > 0) {
        const engagementRate = totalEngagement / engagement.views;
        totalEngagementRate += engagementRate;
        validPosts++;
      }
    }

    const averageEngagementRate =
      validPosts > 0
        ? Math.min(totalEngagementRate / validPosts, 1)
        : 0.3;

    // Factor in verification status (if available)
    // TODO: Check if author is verified

    return averageEngagementRate;
  } catch (error) {
    console.error('Error getting author trust score:', error);
    return 0.3;
  }
}

/**
 * Generate feed for user
 */
export async function generateUserFeed(
  userId: string,
  limit: number = 20
): Promise<string[]> {
  try {
    const db = getFirebaseDb();

    // Get recent posts
    const snapshot = await getDocs(
      query(
        collection(db, 'posts'),
        where('isDeleted', '==', false),
        orderBy('createdAt', 'desc')
      )
    );

    // Score and rank posts
    const scoredPosts: Array<{ postId: string; score: number }> = [];

    for (const postDoc of snapshot.docs) {
      const post = postDoc.data();
      const recencyHours = (Date.now() - post.createdAt?.toDate()?.getTime()) / (1000 * 60 * 60);
      const authorTrust = await getAuthorTrustScore(post.authorId);
      const interestMatch = await calculateUserInterestMatch(
        userId,
        post.specialties || [],
        post.tags || []
      );

      const score = calculateFeedScore(
        post.engagementMetrics,
        recencyHours,
        authorTrust,
        interestMatch
      );

      scoredPosts.push({ postId: post.id, score });
    }

    // Sort by score and return top N
    return scoredPosts
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.postId);
  } catch (error) {
    console.error('Error generating feed:', error);
    return [];
  }
}
