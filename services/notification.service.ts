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
import { Notification } from '@/types';

/**
 * Create notification
 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  data: Record<string, any> = {},
  actionUrl?: string
): Promise<Notification> {
  const db = getFirebaseDb();
  const notifRef = doc(collection(db, `users/${userId}/notifications`));

  const notification: Notification = {
    id: notifRef.id,
    userId,
    type,
    title,
    message,
    data,
    read: false,
    actionUrl,
    createdAt: new Date(),
  };

  await setDoc(notifRef, {
    ...notification,
    createdAt: Timestamp.fromDate(notification.createdAt),
  });

  return notification;
}

/**
 * Get user notifications
 */
export async function getUserNotifications(
  userId: string,
  unreadOnly: boolean = false,
  pageSize: number = 20
): Promise<Notification[]> {
  try {
    const db = getFirebaseDb();
    let q;

    if (unreadOnly) {
      q = query(
        collection(db, `users/${userId}/notifications`),
        where('read', '==', false),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
      );
    } else {
      q = query(
        collection(db, `users/${userId}/notifications`),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
      );
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
      } as Notification;
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    return [];
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(
  userId: string,
  notificationId: string
): Promise<void> {
  try {
    const db = getFirebaseDb();
    await updateDoc(
      doc(db, `users/${userId}/notifications/${notificationId}`),
      { read: true }
    );
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  try {
    const db = getFirebaseDb();
    const notifications = await getUserNotifications(userId, true);

    for (const notification of notifications) {
      await updateDoc(
        doc(db, `users/${userId}/notifications/${notification.id}`),
        { read: true }
      );
    }
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
  }
}

/**
 * Send notification to multiple users
 */
export async function sendBulkNotification(
  userIds: string[],
  type: string,
  title: string,
  message: string,
  data: Record<string, any> = {}
): Promise<void> {
  try {
    for (const userId of userIds) {
      await createNotification(userId, type, title, message, data);
    }
  } catch (error) {
    console.error('Error sending bulk notification:', error);
  }
}

/**
 * Notify followers of new post
 */
export async function notifyFollowersOfNewPost(
  authorId: string,
  authorName: string,
  postId: string,
  postTitle: string
): Promise<void> {
  try {
    const db = getFirebaseDb();
    const followersSnapshot = await getDocs(
      query(
        collection(db, `users/${authorId}/followers`)
      )
    );

    for (const doc of followersSnapshot.docs) {
      const followerId = doc.data().userId;
      await createNotification(
        followerId,
        'follow_post',
        `New post from ${authorName}`,
        postTitle,
        { postId },
        `/feed/${postId}`
      );
    }
  } catch (error) {
    console.error('Error notifying followers:', error);
  }
}
