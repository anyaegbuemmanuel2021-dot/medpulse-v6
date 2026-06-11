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
  DocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { Chat, Message } from '@/types';

/**
 * Create or get direct chat
 */
export async function getOrCreateDirectChat(
  userId1: string,
  userId2: string
): Promise<Chat> {
  const db = getFirebaseDb();
  const chatId = [userId1, userId2].sort().join('_');
  const chatRef = doc(db, 'chats', chatId);
  
  const chatDoc = await getDoc(chatRef);
  
  if (chatDoc.exists()) {
    const data = chatDoc.data();
    return {
      ...data,
      lastMessageAt: data.lastMessageAt?.toDate?.() || new Date(data.lastMessageAt),
      createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
    } as Chat;
  }

  const newChat: Chat = {
    id: chatId,
    type: 'direct',
    participants: [userId1, userId2],
    lastMessageAt: new Date(),
    createdAt: new Date(),
  };

  await setDoc(chatRef, {
    ...newChat,
    lastMessageAt: Timestamp.fromDate(newChat.lastMessageAt),
    createdAt: Timestamp.fromDate(newChat.createdAt),
  });

  return newChat;
}

/**
 * Send message
 */
export async function sendMessage(
  chatId: string,
  message: Omit<Message, 'id' | 'createdAt'>
): Promise<Message> {
  const db = getFirebaseDb();
  const messageRef = doc(collection(db, `chats/${chatId}/messages`));

  const newMessage: Message = {
    ...message,
    id: messageRef.id,
    createdAt: new Date(),
  };

  await setDoc(messageRef, {
    ...newMessage,
    createdAt: Timestamp.fromDate(newMessage.createdAt),
  });

  // Update chat's last message
  await updateDoc(doc(db, 'chats', chatId), {
    lastMessage: {
      id: newMessage.id,
      content: newMessage.content,
      authorName: newMessage.authorName,
    },
    lastMessageAt: Timestamp.fromDate(new Date()),
  });

  return newMessage;
}

/**
 * Get messages in chat
 */
export async function getMessages(
  chatId: string,
  pageSize: number = 50,
  lastDoc?: DocumentSnapshot
): Promise<{ messages: Message[]; lastDoc: DocumentSnapshot | null }> {
  try {
    const db = getFirebaseDb();
    let q;

    if (lastDoc) {
      q = query(
        collection(db, `chats/${chatId}/messages`),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(pageSize)
      );
    } else {
      q = query(
        collection(db, `chats/${chatId}/messages`),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
      );
    }

    const snapshot = await getDocs(q);
    const messages = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
      } as Message;
    });

    const newLastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
    return { messages: messages.reverse(), lastDoc: newLastDoc };
  } catch (error) {
    console.error('Error getting messages:', error);
    return { messages: [], lastDoc: null };
  }
}

/**
 * Mark message as seen
 */
export async function markMessageAsSeen(
  chatId: string,
  messageId: string,
  userId: string
): Promise<void> {
  try {
    const db = getFirebaseDb();
    const messageRef = doc(db, `chats/${chatId}/messages/${messageId}`);
    const messageDoc = await getDoc(messageRef);
    
    if (!messageDoc.exists()) return;

    const message = messageDoc.data();
    const seenBy = message.seenBy || [];

    if (!seenBy.includes(userId)) {
      await updateDoc(messageRef, {
        seenBy: [...seenBy, userId],
      });
    }
  } catch (error) {
    console.error('Error marking message as seen:', error);
  }
}

/**
 * Get user chats
 */
export async function getUserChats(userId: string): Promise<Chat[]> {
  try {
    const db = getFirebaseDb();
    const snapshot = await getDocs(
      query(
        collection(db, 'chats'),
        where('participants', 'array-contains', userId),
        orderBy('lastMessageAt', 'desc')
      )
    );

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        lastMessageAt: data.lastMessageAt?.toDate?.() || new Date(data.lastMessageAt),
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
      } as Chat;
    });
  } catch (error) {
    console.error('Error getting user chats:', error);
    return [];
  }
}

/**
 * Add reaction to message
 */
export async function addReactionToMessage(
  chatId: string,
  messageId: string,
  emoji: string,
  userId: string
): Promise<void> {
  try {
    const db = getFirebaseDb();
    const reactionRef = doc(
      db,
      `chats/${chatId}/messages/${messageId}/reactions/${emoji}_${userId}`
    );

    await setDoc(reactionRef, {
      emoji,
      userId,
      createdAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error adding reaction:', error);
  }
}
