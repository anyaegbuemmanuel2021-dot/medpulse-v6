import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Query,
  DocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { Post, EngagementMetrics, ModerationRecord, ContentType } from '@/types';

/**
 * Create a new post
 */
export async function createPost(
  post: Omit<Post, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Post> {
  const db = getFirebaseDb();
  const postRef = doc(collection(db, 'posts'));

  const newPost: Post = {
    ...post,
    id: postRef.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await setDoc(postRef, {
    ...newPost,
    createdAt: Timestamp.fromDate(newPost.createdAt),
    updatedAt: Timestamp.fromDate(newPost.updatedAt),
  });

  return newPost;
}

/**
 * Get post by ID
 */
export async function getPost(postId: string): Promise<Post | null> {
  try {
    const db = getFirebaseDb();
    const postDoc = await getDoc(doc(db, 'posts', postId));

    if (!postDoc.exists()) return null;

    const data = postDoc.data();
    return {
      ...data,
      createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
      updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
    } as Post;
  } catch (error) {
    console.error('Error getting post:', error);
    return null;
  }
}

/**
 * Get posts by author
 */
export async function getPostsByAuthor(
  authorId: string,
  pageSize: number = 20,
  lastDoc?: DocumentSnapshot
): Promise<{ posts: Post[]; lastDoc: DocumentSnapshot | null }> {
  try {
    const db = getFirebaseDb();
    let q: Query;

    if (lastDoc) {
      q = query(
        collection(db, 'posts'),
        where('authorId', '==', authorId),
        where('isDeleted', '==', false),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(pageSize)
      );
    } else {
      q = query(
        collection(db, 'posts'),
        where('authorId', '==', authorId),
        where('isDeleted', '==', false),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
      );
    }

    const snapshot = await getDocs(q);
    const posts = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
        updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
      } as Post;
    });

    const newLastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
    return { posts, lastDoc: newLastDoc };
  } catch (error) {
    console.error('Error getting posts by author:', error);
    return { posts: [], lastDoc: null };
  }
}

/**
 * Get trending posts
 */
export async function getTrendingPosts(
  pageSize: number = 20,
  lastDoc?: DocumentSnapshot
): Promise<{ posts: Post[]; lastDoc: DocumentSnapshot | null }> {
  try {
    const db = getFirebaseDb();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    let q: Query;

    if (lastDoc) {
      q = query(
        collection(db, 'posts'),
        where('isDeleted', '==', false),
        where('createdAt', '>=', thirtyDaysAgo),
        orderBy('createdAt', 'desc'),
        orderBy('feedScore', 'desc'),
        startAfter(lastDoc),
        limit(pageSize)
      );
    } else {
      q = query(
        collection(db, 'posts'),
        where('isDeleted', '==', false),
        where('createdAt', '>=', thirtyDaysAgo),
        orderBy('createdAt', 'desc'),
        orderBy('feedScore', 'desc'),
        limit(pageSize)
      );
    }

    const snapshot = await getDocs(q);
    const posts = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
        updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
      } as Post;
    });

    const newLastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
    return { posts, lastDoc: newLastDoc };
  } catch (error) {
    console.error('Error getting trending posts:', error);
    return { posts: [], lastDoc: null };
  }
}

/**
 * Update post engagement metrics
 */
export async function updateEngagementMetrics(
  postId: string,
  metrics: Partial<EngagementMetrics>
): Promise<void> {
  try {
    const db = getFirebaseDb();
    await updateDoc(doc(db, 'posts', postId), {
      engagementMetrics: metrics,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating engagement metrics:', error);
  }
}

/**
 * Increment post view
 */
export async function incrementPostView(postId: string): Promise<void> {
  try {
    const db = getFirebaseDb();
    const post = await getPost(postId);
    if (!post) return;

    await updateDoc(doc(db, 'posts', postId), {
      'engagementMetrics.views': (post.engagementMetrics.views || 0) + 1,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error incrementing post view:', error);
  }
}

/**
 * Like/unlike post
 */
export async function togglePostLike(postId: string, userId: string): Promise<void> {
  try {
    const db = getFirebaseDb();
    const likeRef = doc(db, `posts/${postId}/likes/${userId}`);
    const likeDoc = await getDoc(likeRef);

    const post = await getPost(postId);
    if (!post) return;

    if (likeDoc.exists()) {
      // Unlike
      await updateDoc(likeRef, { deleted: true });
      await updateDoc(doc(db, 'posts', postId), {
        'engagementMetrics.likes': Math.max(0, (post.engagementMetrics.likes || 0) - 1),
      });
    } else {
      // Like
      await setDoc(likeRef, { userId, createdAt: Timestamp.now() });
      await updateDoc(doc(db, 'posts', postId), {
        'engagementMetrics.likes': (post.engagementMetrics.likes || 0) + 1,
      });
    }
  } catch (error) {
    console.error('Error toggling like:', error);
  }
}

/**
 * Save/unsave post
 */
export async function toggleSavePost(postId: string, userId: string): Promise<void> {
  try {
    const db = getFirebaseDb();
    const saveRef = doc(db, `users/${userId}/savedPosts/${postId}`);
    const saveDoc = await getDoc(saveRef);

    if (saveDoc.exists()) {
      // Unsave
      await updateDoc(saveRef, { deleted: true });
    } else {
      // Save
      await setDoc(saveRef, {
        postId,
        savedAt: Timestamp.now(),
      });
    }
  } catch (error) {
    console.error('Error toggling save:', error);
  }
}

/**
 * Delete post
 */
export async function deletePost(postId: string): Promise<void> {
  try {
    const db = getFirebaseDb();
    await updateDoc(doc(db, 'posts', postId), {
      isDeleted: true,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error deleting post:', error);
  }
}
