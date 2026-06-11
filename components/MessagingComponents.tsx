// File: components/messaging/InboxPage.tsx
// Enterprise Messaging Inbox UI — integrates with messaging.service.ts

'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Timestamp } from 'firebase/firestore';
import messagingService, { Conversation, Message } from '@/services/messaging.service';
import { useAuth } from '@/hooks/useAuth';

// ============================================================================
// INBOX PAGE
// ============================================================================

export default function InboxPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    messagingService.getUserConversations(user.uid).then(convs => {
      setConversations(convs);
      setLoading(false);
    });
  }, [user?.uid]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar — conversation list */}
      <aside className="w-80 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Messages</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="p-6 text-center text-gray-500 text-sm">No conversations yet.</p>
          ) : (
            conversations.map(conv => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                currentUserId={user!.uid}
                isSelected={conv.id === selectedConvId}
                onClick={() => setSelectedConvId(conv.id)}
              />
            ))
          )}
        </div>
      </aside>

      {/* Chat window */}
      <main className="flex-1">
        {selectedConvId ? (
          <ChatWindow
            conversationId={selectedConvId}
            currentUserId={user!.uid}
            currentUserName={user!.displayName || 'You'}
            currentUserAvatar={user!.photoURL || undefined}
          />
        ) : (
          <div className="flex h-full items-center justify-center flex-col gap-3 text-gray-400">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-lg font-medium">Select a conversation</p>
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================================
// CONVERSATION ITEM
// ============================================================================

function ConversationItem({
  conversation,
  currentUserId,
  isSelected,
  onClick,
}: {
  conversation: Conversation;
  currentUserId: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const otherUserId = conversation.participants.find(p => p !== currentUserId);
  const name =
    conversation.name ||
    (otherUserId ? conversation.participantNames?.[otherUserId] : 'Unknown');

  const avatar =
    conversation.avatar ||
    (otherUserId ? conversation.participantAvatars?.[otherUserId] : undefined);

  const lastMsg = conversation.lastMessage;
  const preview =
    lastMsg?.type === 'media'
      ? '📷 Media'
      : lastMsg?.type === 'voice'
      ? '🎤 Voice note'
      : lastMsg?.content || 'No messages yet';

  const time = conversation.lastMessageAt
    ? formatTime(conversation.lastMessageAt)
    : '';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left border-b border-gray-100 ${
        isSelected ? 'bg-blue-50 border-blue-200' : ''
      }`}
    >
      <Avatar name={name || '?'} url={avatar} size={48} />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-gray-900 truncate text-sm">{name}</span>
          {time && <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{time}</span>}
        </div>
        <p className="text-sm text-gray-500 truncate mt-0.5">{preview}</p>
      </div>
    </button>
  );
}

// ============================================================================
// CHAT WINDOW
// ============================================================================

export function ChatWindow({
  conversationId,
  currentUserId,
  currentUserName,
  currentUserAvatar,
}: {
  conversationId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to real-time messages
  useEffect(() => {
    const unsub = messagingService.subscribeToMessages(
      conversationId,
      setMessages
    );
    return unsub;
  }, [conversationId]);

  // Subscribe to typing indicators
  useEffect(() => {
    const unsub = messagingService.subscribeToTyping(
      conversationId,
      users => setTypingUsers(users.filter(u => u !== currentUserId))
    );
    return unsub;
  }, [conversationId, currentUserId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || sending) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      await messagingService.sendMessage(
        conversationId,
        currentUserId,
        currentUserName,
        currentUserAvatar,
        { text, type: 'text' }
      );
    } catch (error) {
      console.error('Send error:', error);
      setInputText(text);
    } finally {
      setSending(false);
      await messagingService.setTyping(currentUserId, conversationId, false);
    }
  }, [inputText, sending, conversationId, currentUserId, currentUserName, currentUserAvatar]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTyping = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    await messagingService.setTyping(currentUserId, conversationId, true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      messagingService.setTyping(currentUserId, conversationId, false);
    }, 2000);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.senderId === currentUserId}
          />
        ))}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 ml-2">
            <div className="flex gap-1 items-center bg-gray-100 rounded-2xl px-4 py-3">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-gray-400">typing...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="p-4 border-t border-gray-200 bg-white">
        <div className="flex items-end gap-3">
          <textarea
            value={inputText}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none border border-gray-300 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent max-h-32"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MESSAGE BUBBLE
// ============================================================================

function MessageBubble({
  message,
  isOwn,
}: {
  message: Message;
  isOwn: boolean;
}) {
  const isDeleted = message.content === '[Message deleted]';

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}>
      {!isOwn && (
        <Avatar
          name={message.senderName}
          url={message.senderAvatar}
          size={32}
          className="mr-2 flex-shrink-0 self-end"
        />
      )}

      <div className={`max-w-xs lg:max-w-md ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Reply preview */}
        {message.replyTo && (
          <div className={`text-xs px-3 py-1 rounded-t-lg border-l-2 border-blue-400 bg-gray-100 text-gray-500 mb-1 max-w-full truncate`}>
            <strong>{message.replyTo.senderName}:</strong> {message.replyTo.preview}
          </div>
        )}

        {/* Bubble */}
        <div
          className={`px-4 py-2 rounded-2xl text-sm leading-relaxed ${
            isOwn
              ? 'bg-blue-600 text-white rounded-br-sm'
              : 'bg-gray-100 text-gray-900 rounded-bl-sm'
          } ${isDeleted ? 'italic opacity-60' : ''}`}
        >
          {/* Media */}
          {message.type === 'media' && message.media && (
            <img
              src={message.media.url}
              alt="Media"
              className="rounded-lg max-w-full mb-1 cursor-pointer"
            />
          )}

          {/* Voice note */}
          {message.type === 'voice' && message.media && (
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
              <audio controls className="h-6" src={message.media.url} />
            </div>
          )}

          {/* Text content */}
          {message.content && !isDeleted && (
            <p className="break-words">{message.content}</p>
          )}
          {isDeleted && <p>Message deleted</p>}
        </div>

        {/* Reactions */}
        {Object.keys(message.reactions || {}).length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {Object.entries(message.reactions).map(([emoji, users]) => (
              users.length > 0 && (
                <span
                  key={emoji}
                  className="inline-flex items-center gap-0.5 bg-white border border-gray-200 rounded-full px-2 py-0.5 text-xs shadow-sm"
                >
                  {emoji} {users.length}
                </span>
              )
            ))}
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-xs text-gray-400">
            {message.createdAt ? formatTime(message.createdAt) : ''}
          </span>
          {isOwn && (
            <span className="text-xs text-gray-400">
              {message.status === 'read' ? '✓✓' : message.status === 'delivered' ? '✓✓' : '✓'}
            </span>
          )}
          {message.editedAt && (
            <span className="text-xs text-gray-400 italic">edited</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TRUST & SAFETY ADMIN DASHBOARD
// ============================================================================

export function TrustSafetyDashboard() {
  const [investigations, setInvestigations] = useState<any[]>([]);
  const [appeals, setAppeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { default: trustSafetyService } = await import('@/services/trust-safety.service');
      const [invs, apps] = await Promise.all([
        trustSafetyService.getOpenInvestigations(),
        trustSafetyService.getPendingAppeals(),
      ]);
      setInvestigations(invs);
      setAppeals(apps);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <AdminSkeleton />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Trust & Safety</h1>
        <div className="flex gap-2">
          <StatBadge label="Open Investigations" value={investigations.length} color="orange" />
          <StatBadge label="Pending Appeals" value={appeals.length} color="purple" />
        </div>
      </div>

      {/* Investigations */}
      <Section title="Open Investigations">
        {investigations.length === 0 ? (
          <EmptyState message="No open investigations" />
        ) : (
          <div className="space-y-3">
            {investigations.map(inv => (
              <InvestigationCard key={inv.id} investigation={inv} />
            ))}
          </div>
        )}
      </Section>

      {/* Appeals */}
      <Section title="Pending Appeals">
        {appeals.length === 0 ? (
          <EmptyState message="No pending appeals" />
        ) : (
          <div className="space-y-3">
            {appeals.map(appeal => (
              <AppealCard key={appeal.id} appeal={appeal} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function InvestigationCard({ investigation }: { investigation: any }) {
  const severityColors: Record<string, string> = {
    low: 'bg-green-100 text-green-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-gray-500">{investigation.caseNumber}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${severityColors[investigation.severity] || 'bg-gray-100 text-gray-600'}`}>
              {investigation.severity}
            </span>
            <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {investigation.type?.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-sm text-gray-700 line-clamp-2">{investigation.description}</p>
        </div>
        <div className="flex-shrink-0">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            investigation.status === 'escalated' ? 'bg-red-100 text-red-700' :
            investigation.status === 'submitted' ? 'bg-gray-100 text-gray-600' :
            'bg-blue-100 text-blue-700'
          }`}>
            {investigation.status?.replace(/_/g, ' ')}
          </span>
        </div>
      </div>
    </div>
  );
}

function AppealCard({ appeal }: { appeal: any }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
            {appeal.type?.replace(/_/g, ' ')}
          </span>
          <p className="text-sm text-gray-700 mt-2 line-clamp-2">{appeal.reason}</p>
        </div>
        <span className="text-xs text-gray-400 flex-shrink-0 ml-4">
          {appeal.submittedAt ? formatTime(appeal.submittedAt) : ''}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// SHARED UI PRIMITIVES
// ============================================================================

function Avatar({
  name,
  url,
  size,
  className = '',
}: {
  name: string;
  url?: string;
  size: number;
  className?: string;
}) {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  return url ? (
    <img
      src={url}
      alt={name}
      className={`rounded-full object-cover flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className={`rounded-full flex items-center justify-center font-semibold text-white bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-8 text-gray-400">
      <p className="text-sm">{message}</p>
    </div>
  );
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const colors: Record<string, string> = {
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    red: 'bg-red-100 text-red-700 border-red-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    green: 'bg-green-100 text-green-700 border-green-200',
  };

  return (
    <div className={`border rounded-lg px-3 py-2 text-center ${colors[color] || colors.blue}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-lg w-48" />
      <div className="h-64 bg-gray-100 rounded-2xl" />
      <div className="h-64 bg-gray-100 rounded-2xl" />
    </div>
  );
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatTime(timestamp: Timestamp): string {
  const date = timestamp.toDate();
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
