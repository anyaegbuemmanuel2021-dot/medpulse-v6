// File: services/messaging.service.ts
// Enterprise Messaging Platform
// Extends existing chat.service.ts with full features

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  Timestamp,
  writeBatch,
  onSnapshot,
  QuerySnapshot,
} from 'firebase/firestore';

// ============================================================================
// TYPES
// ============================================================================

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  
  content: string;
  type: 'text' | 'media' | 'voice' | 'video' | 'gif' | 'file';
  
  media?: {
    url: string;
    thumbnail?: string;
    mimeType: string;
    size: number;
    duration?: number; // for audio/video
  };
  
  reactions: Record<string, string[]>; // emoji -> [userIds]
  
  // Message features
  status: 'sending' | 'sent' | 'delivered' | 'read';
  readBy: Record<string, Timestamp>; // userId -> readAt
  editedAt?: Timestamp;
  deletedBy?: string[]; // soft delete
  
  // Interactions
  replyTo?: {
    messageId: string;
    senderName: string;
    preview: string;
  };
  forwarded?: {
    originalMessageId: string;
    originalSenderId: string;
  };
  pinned?: boolean;
  pinnedAt?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group' | 'community';
  
  // Participants
  participants: string[]; // userIds
  participantNames: Record<string, string>; // userId -> name
  participantAvatars?: Record<string, string>; // userId -> avatar
  
  // Metadata
  name?: string; // for groups
  description?: string;
  avatar?: string;
  isArchived?: boolean;
  isPinned?: boolean;
  isMuted?: Record<string, boolean>; // userId -> muted status
  
  // Settings (for groups)
  owner?: string;
  admins?: string[];
  maxMembers?: number;
  allowMediaSharing?: boolean;
  allowVoiceNotes?: boolean;
  
  // Message info
  messageCount: number;
  lastMessage?: Message;
  lastMessageAt?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PresenceData {
  userId: string;
  status: 'online' | 'away' | 'offline';
  lastSeenAt: Timestamp;
  isTyping?: boolean;
  typingIn?: string[]; // conversationIds
}

// ============================================================================
// MESSAGING SERVICE
// ============================================================================

class MessagingService {
  private db = getFirestore();

  // ========================================================================
  // CONVERSATION MANAGEMENT
  // ========================================================================

  /**
   * Get or create direct message conversation
   */
  async getOrCreateDMConversation(
    userId1: string,
    userId1Name: string,
    userId1Avatar: string,
    userId2Id: string,
    userId2Name: string,
    userId2Avatar: string
  ): Promise<Conversation> {
    try {
      // Check if conversation exists
      const q = query(
        collection(this.db, 'conversations'),
        where('type', '==', 'direct'),
        where('participants', 'array-contains', userId1)
      );

      const snapshot = await getDocs(q);
      const existing = snapshot.docs.find(doc => {
        const conv = doc.data() as Conversation;
        return (
          conv.participants.length === 2 &&
          conv.participants.includes(userId2Id)
        );
      });

      if (existing) {
        return { ...existing.data(), id: existing.id } as Conversation;
      }

      // Create new conversation
      const conversationRef = await addDoc(
        collection(this.db, 'conversations'),
        {
          type: 'direct',
          participants: [userId1, userId2Id],
          participantNames: {
            [userId1]: userId1Name,
            [userId2Id]: userId2Name,
          },
          participantAvatars: {
            [userId1]: userId1Avatar,
            [userId2Id]: userId2Avatar,
          },
          messageCount: 0,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        } as Omit<Conversation, 'id'>
      );

      return {
        id: conversationRef.id,
        type: 'direct',
        participants: [userId1, userId2Id],
        participantNames: {
          [userId1]: userId1Name,
          [userId2Id]: userId2Name,
        },
        participantAvatars: {
          [userId1]: userId1Avatar,
          [userId2Id]: userId2Avatar,
        },
        messageCount: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
    } catch (error) {
      console.error('Error getting/creating DM conversation:', error);
      throw error;
    }
  }

  /**
   * Create group conversation
   */
  async createGroupConversation(
    name: string,
    members: { id: string; name: string; avatar: string }[],
    createdBy: string,
    isPrivate: boolean = false
  ): Promise<Conversation> {
    try {
      const conversationRef = await addDoc(
        collection(this.db, 'conversations'),
        {
          type: 'group',
          name,
          participants: members.map(m => m.id),
          participantNames: Object.fromEntries(
            members.map(m => [m.id, m.name])
          ),
          participantAvatars: Object.fromEntries(
            members.map(m => [m.id, m.avatar])
          ),
          owner: createdBy,
          admins: [createdBy],
          messageCount: 0,
          allowMediaSharing: true,
          allowVoiceNotes: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        } as Omit<Conversation, 'id'>
      );

      return {
        id: conversationRef.id,
        type: 'group',
        name,
        participants: members.map(m => m.id),
        messageCount: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      } as Conversation;
    } catch (error) {
      console.error('Error creating group conversation:', error);
      throw error;
    }
  }

  /**
   * Get user's conversations
   */
  async getUserConversations(userId: string): Promise<Conversation[]> {
    try {
      const q = query(
        collection(this.db, 'conversations'),
        where('participants', 'array-contains', userId),
        orderBy('lastMessageAt', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
      } as Conversation));
    } catch (error) {
      console.error('Error getting user conversations:', error);
      return [];
    }
  }

  // ========================================================================
  // MESSAGE OPERATIONS
  // ========================================================================

  /**
   * Send message
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    senderName: string,
    senderAvatar: string | undefined,
    content: {
      text?: string;
      type?: 'text' | 'media' | 'voice' | 'video' | 'gif' | 'file';
      media?: {
        url: string;
        thumbnail?: string;
        mimeType: string;
        size: number;
        duration?: number;
      };
    },
    options?: {
      replyTo?: string;
      forwarded?: { originalMessageId: string; originalSenderId: string };
    }
  ): Promise<Message> {
    try {
      const conversationRef = doc(this.db, 'conversations', conversationId);
      const conversationSnap = await getDoc(conversationRef);

      if (!conversationSnap.exists()) {
        throw new Error('Conversation not found');
      }

      const conversation = conversationSnap.data() as Conversation;

      // Verify user is participant
      if (!conversation.participants.includes(senderId)) {
        throw new Error('User is not a participant');
      }

      const messagesCollection = collection(
        this.db,
        'conversations',
        conversationId,
        'messages'
      );

      const message: Omit<Message, 'id'> = {
        conversationId,
        senderId,
        senderName,
        senderAvatar,
        content: content.text || '',
        type: content.type || 'text',
        media: content.media,
        reactions: {},
        status: 'sent',
        readBy: { [senderId]: Timestamp.now() },
        replyTo: options?.replyTo
          ? await this.getReplyPreview(conversationId, options.replyTo)
          : undefined,
        forwarded: options?.forwarded,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const messageRef = await addDoc(messagesCollection, message);

      // Update conversation
      await updateDoc(conversationRef, {
        lastMessage: { ...message, id: messageRef.id },
        lastMessageAt: Timestamp.now(),
        messageCount: (conversation.messageCount || 0) + 1,
        updatedAt: Timestamp.now(),
      });

      return { ...message, id: messageRef.id } as Message;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Update message status (delivered/read)
   */
  async updateMessageStatus(
    conversationId: string,
    messageId: string,
    status: 'delivered' | 'read',
    userId: string
  ): Promise<void> {
    try {
      const messageRef = doc(
        this.db,
        'conversations',
        conversationId,
        'messages',
        messageId
      );

      const updateData: any = {
        status,
        updatedAt: Timestamp.now(),
      };

      if (status === 'read') {
        updateData[`readBy.${userId}`] = Timestamp.now();
      }

      await updateDoc(messageRef, updateData);
    } catch (error) {
      console.error('Error updating message status:', error);
      throw error;
    }
  }

  /**
   * Edit message
   */
  async editMessage(
    conversationId: string,
    messageId: string,
    userId: string,
    newText: string
  ): Promise<void> {
    try {
      const messageRef = doc(
        this.db,
        'conversations',
        conversationId,
        'messages',
        messageId
      );

      const messageSnap = await getDoc(messageRef);
      const message = messageSnap.data() as Message;

      if (message.senderId !== userId) {
        throw new Error('Only message sender can edit');
      }

      await updateDoc(messageRef, {
        content: newText,
        editedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('Error editing message:', error);
      throw error;
    }
  }

  /**
   * Delete message (soft delete)
   */
  async deleteMessage(
    conversationId: string,
    messageId: string,
    userId: string
  ): Promise<void> {
    try {
      const messageRef = doc(
        this.db,
        'conversations',
        conversationId,
        'messages',
        messageId
      );

      const messageSnap = await getDoc(messageRef);
      const message = messageSnap.data() as Message;

      if (message.senderId !== userId) {
        throw new Error('Only message sender can delete');
      }

      const deletedBy = message.deletedBy || [];
      deletedBy.push(userId);

      await updateDoc(messageRef, {
        deletedBy,
        content: '[Message deleted]',
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }

  /**
   * Add reaction to message
   */
  async addReaction(
    conversationId: string,
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<void> {
    try {
      const messageRef = doc(
        this.db,
        'conversations',
        conversationId,
        'messages',
        messageId
      );

      const messageSnap = await getDoc(messageRef);
      const message = messageSnap.data() as Message;

      const reactions = { ...message.reactions };
      if (!reactions[emoji]) {
        reactions[emoji] = [];
      }

      if (!reactions[emoji].includes(userId)) {
        reactions[emoji].push(userId);
      }

      await updateDoc(messageRef, {
        reactions,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('Error adding reaction:', error);
      throw error;
    }
  }

  /**
   * Get messages for conversation
   */
  async getMessages(
    conversationId: string,
    pageSize: number = 50
  ): Promise<Message[]> {
    try {
      const q = query(
        collection(this.db, 'conversations', conversationId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as Message))
        .reverse();
    } catch (error) {
      console.error('Error fetching messages:', error);
      return [];
    }
  }

  /**
   * Subscribe to real-time messages
   */
  subscribeToMessages(
    conversationId: string,
    callback: (messages: Message[]) => void
  ): () => void {
    try {
      const q = query(
        collection(this.db, 'conversations', conversationId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(100)
      );

      return onSnapshot(q, (snapshot: QuerySnapshot) => {
        const messages = snapshot.docs
          .map(doc => ({ ...doc.data(), id: doc.id } as Message))
          .reverse();
        callback(messages);
      });
    } catch (error) {
      console.error('Error subscribing to messages:', error);
      return () => {};
    }
  }

  /**
   * Search messages
   */
  async searchMessages(
    conversationId: string,
    searchTerm: string
  ): Promise<Message[]> {
    try {
      const q = query(
        collection(this.db, 'conversations', conversationId, 'messages'),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const allMessages = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
      } as Message));

      return allMessages.filter(msg =>
        msg.content.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } catch (error) {
      console.error('Error searching messages:', error);
      return [];
    }
  }

  // ========================================================================
  // PRESENCE & TYPING
  // ========================================================================

  /**
   * Set user typing status
   */
  async setTyping(
    userId: string,
    conversationId: string,
    isTyping: boolean
  ): Promise<void> {
    try {
      if (isTyping) {
        await setDoc(doc(this.db, 'typing', `${conversationId}_${userId}`), {
          userId,
          conversationId,
          startedAt: Timestamp.now(),
        });
      } else {
        await deleteDoc(doc(this.db, 'typing', `${conversationId}_${userId}`));
      }
    } catch (error) {
      console.error('Error setting typing status:', error);
    }
  }

  /**
   * Subscribe to typing indicators
   */
  subscribeToTyping(
    conversationId: string,
    callback: (typingUsers: string[]) => void
  ): () => void {
    try {
      const q = query(
        collection(this.db, 'typing'),
        where('conversationId', '==', conversationId)
      );

      return onSnapshot(q, (snapshot: QuerySnapshot) => {
        const typingUsers = snapshot.docs.map(doc => doc.data().userId);
        callback(typingUsers);
      });
    } catch (error) {
      console.error('Error subscribing to typing:', error);
      return () => {};
    }
  }

  // ========================================================================
  // PRIVATE HELPERS
  // ========================================================================

  private async getReplyPreview(
    conversationId: string,
    messageId: string
  ): Promise<{ messageId: string; senderName: string; preview: string }> {
    const messageSnap = await getDoc(
      doc(this.db, 'conversations', conversationId, 'messages', messageId)
    );

    if (!messageSnap.exists()) {
      throw new Error('Message not found');
    }

    const message = messageSnap.data() as Message;

    return {
      messageId,
      senderName: message.senderName,
      preview: message.content.substring(0, 100),
    };
  }
}

export default new MessagingService();
