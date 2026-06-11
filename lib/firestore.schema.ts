/**
 * MedPulse Enterprise - Firestore Database Schema
 * 
 * This document defines the complete Firestore schema for the MedPulse platform.
 */

// ============================================
// USERS COLLECTION
// ============================================
/*
/users/{uid}
{
  uid: string (user ID from Firebase Auth)
  email: string
  displayName: string
  photoURL?: string
  bio?: string
  specialties: string[] (e.g., ["cardiology", "neurology"])
  institution?: string
  roles: UserRole[] (e.g., ["student", "verified_creator"])
  verification: VerificationRecord | null
  createdAt: Timestamp
  updatedAt: Timestamp
  isActive: boolean
  metadata: {
    followersCount: number
    followingCount: number
    postsCount: number
    totalEngagement: number
    lastLoginAt: Timestamp
    deviceFingerprints: string[]
  }
}

Subcollections:
- /users/{uid}/interests
- /users/{uid}/savedPosts
- /users/{uid}/notifications
- /users/{uid}/followers
- /users/{uid}/following
- /users/{uid}/blockedUsers
*/

// ============================================
// POSTS COLLECTION
// ============================================
/*
/posts/{postId}
{
  id: string
  authorId: string
  authorName: string
  authorImage?: string
  title: string
  description: string
  content: {
    videoUrl?: string
    images?: string[]
    text?: string
    articleContent?: string
    mediaUrls?: string[]
    embedUrl?: string
  }
  contentType: 'video' | 'article' | 'case_study' | 'medical_slide' | 'note' | 'thread' | 'poll'
  visibility: 'public' | 'private' | 'followers'
  tags: string[]
  specialties: string[]
  thumbnail?: string
  duration?: number
  engagementMetrics: {
    views: number
    watches: number
    averageWatchTime: number
    likes: number
    comments: number
    shares: number
    saves: number
    clicks: number
  }
  feedScore: number
  moderation: {
    status: 'pending' | 'approved' | 'flagged' | 'removed'
    flags: ModerationFlag[]
    autoModResult?: AutoModerationResult
    humanReviewAt?: Timestamp
    reviewedBy?: string
    appealStatus?: 'pending' | 'approved' | 'rejected'
  }
  createdAt: Timestamp
  updatedAt: Timestamp
  isDeleted: boolean
}

Subcollections:
- /posts/{postId}/comments
- /posts/{postId}/likes
- /posts/{postId}/shares
- /posts/{postId}/reactions
*/

// ============================================
// COMMENTS COLLECTION
// ============================================
/*
/posts/{postId}/comments/{commentId}
{
  id: string
  authorId: string
  authorName: string
  authorImage?: string
  content: string
  likes: number
  replies: number
  isEdited: boolean
  editedAt?: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
  isDeleted: boolean
}

Subcollections:
- /posts/{postId}/comments/{commentId}/replies
*/

// ============================================
// CHAT COLLECTION
// ============================================
/*
/chats/{chatId}
{
  id: string (format: "uid1_uid2" for DMs, or custom for groups)
  type: 'direct' | 'group'
  participants: string[] (user UIDs)
  name?: string (for groups)
  description?: string (for groups)
  icon?: string (for groups)
  lastMessage?: {
    id: string
    content: string
    authorName: string
  }
  lastMessageAt: Timestamp
  createdAt: Timestamp
}

Subcollections:
- /chats/{chatId}/messages
- /chats/{chatId}/members (for group chats)
*/

// ============================================
// MESSAGES COLLECTION
// ============================================
/*
/chats/{chatId}/messages/{messageId}
{
  id: string
  chatId: string
  authorId: string
  authorName: string
  content: string
  contentType: 'text' | 'image' | 'video' | 'voice' | 'file'
  attachments?: {
    id: string
    type: string
    url: string
    name: string
    size: number
  }[]
  reactions?: {
    emoji: string
    users: string[]
  }[]
  isEdited: boolean
  editedAt?: Timestamp
  seenBy: string[]
  createdAt: Timestamp
  deletedAt?: Timestamp
}
*/

// ============================================
// COMMUNITIES COLLECTION
// ============================================
/*
/communities/{communityId}
{
  id: string
  name: string
  description: string
  icon: string
  banner?: string
  memberCount: number
  visibility: 'public' | 'private'
  category: string (e.g., "cardiology", "general")
  rules: string[]
  moderators: string[] (user UIDs)
  createdAt: Timestamp
  metadata: Record<string, any>
}

Subcollections:
- /communities/{communityId}/members
- /communities/{communityId}/posts
- /communities/{communityId}/channels (for Discord-like structure)
*/

// ============================================
// VERIFICATION REQUESTS COLLECTION
// ============================================
/*
/verification_requests/{requestId}
{
  id: string
  userId: string
  type: 'student' | 'doctor' | 'institution' | 'creator'
  status: 'pending' | 'approved' | 'rejected' | 'revoked'
  documents: {
    id: string
    type: 'certificate' | 'id' | 'license' | 'credential'
    url: string
    uploadedAt: Timestamp
  }[]
  submittedAt: Timestamp
  reviewedAt?: Timestamp
  reviewedBy?: string
  rejectionReason?: string
  metadata: Record<string, any>
}
*/

// ============================================
// VERIFIED USERS COLLECTION
// ============================================
/*
/verified_users/{userId}
{
  userId: string
  verificationLevel: 'level_1' | 'level_2' | 'level_3'
  badges: string[]
  credibility: number (0-100)
  verifiedAt: Timestamp
}
*/

// ============================================
// MODERATION COLLECTIONS
// ============================================
/*
/moderation_reports/{reportId}
{
  id: string
  contentId: string
  contentType: string
  reportedBy: string
  flag: {
    category: 'spam' | 'hate_speech' | 'nsfw' | 'misinformation' | 'toxicity' | 'violence' | 'scam'
    severity: 'low' | 'medium' | 'high' | 'critical'
    reportedAt: Timestamp
    reportedBy: string
    reason: string
  }
  status: 'pending' | 'reviewed' | 'removed'
  action?: 'approved' | 'rejected' | 'remove'
  reviewedBy?: string
  reviewedAt?: Timestamp
  notes?: string
  createdAt: Timestamp
}

/moderation_logs/{logId}
{
  id: string
  action: string
  targetId: string
  targetType: string
  performedBy: string
  reason: string
  result: 'success' | 'failure'
  timestamp: Timestamp
}
*/

// ============================================
// NOTIFICATIONS COLLECTION
// ============================================
/*
/users/{uid}/notifications/{notificationId}
{
  id: string
  userId: string
  type: 'mention' | 'like' | 'comment' | 'follow' | 'message' | 'verification' | 'admin'
  title: string
  message: string
  data: Record<string, any>
  read: boolean
  actionUrl?: string
  createdAt: Timestamp
}
*/

// ============================================
// RATE LIMITS COLLECTION
// ============================================
/*
/rate_limits/{userId}_{endpoint}
{
  userId: string
  endpoint: string
  count: number
  resetAt: Timestamp
}
*/

// ============================================
// SECURITY LOGS COLLECTION
// ============================================
/*
/security_logs/{logId}
{
  id: string
  userId: string
  action: string
  ipAddress: string
  deviceFingerprint: string
  result: 'success' | 'failure'
  details: Record<string, any>
  timestamp: Timestamp
}

/admin_audit_logs/{logId}
{
  id: string
  adminId: string
  action: string
  targetId?: string
  targetType?: string
  changes: Record<string, any>
  timestamp: Timestamp
}
*/

// ============================================
// ANALYTICS COLLECTIONS
// ============================================
/*
/analytics/daily/{date}
{
  date: string (YYYY-MM-DD)
  dau: number (Daily Active Users)
  mau: number (Monthly Active Users)
  engagementRate: number (0-1)
  retentionRate: number (0-1)
  averageSessionDuration: number (seconds)
  newUsers: number
  activeCreators: number
}

/feed_scores/{postId}
{
  postId: string
  score: number
  signals: {
    watchTime: number
    likes: number
    shares: number
    comments: number
    saves: number
    recency: number
    authorTrustScore: number
    userInterestMatch: number
  }
  calculatedAt: Timestamp
}

/engagement_metrics/{postId}
{
  postId: string
  daily: Record<string, any>
  weekly: Record<string, any>
  monthly: Record<string, any>
}

/user_interests/{userId}_{specialty}_{topic}
{
  userId: string
  specialty: string
  topic: string
  score: number
  lastUpdated: Timestamp
}
*/

// ============================================
// SEARCH INDEX COLLECTION
// ============================================
/*
/search_index/{docId}
{
  postId: string
  type: 'post' | 'user' | 'community'
  title: string
  content: string (truncated for search)
  tags: string[]
  author: string
  createdAt: Timestamp
}

/trending_searches/{docId}
{
  query: string
  count: number
  lastUpdated: Timestamp
}
*/

// ============================================
// COMPOSITE INDEXES NEEDED
// ============================================
/*
1. Collection: posts
   Fields: authorId (Asc), isDeleted (Asc), createdAt (Desc)
   
2. Collection: posts
   Fields: isDeleted (Asc), createdAt (Desc), feedScore (Desc)
   
3. Collection: posts
   Fields: specialties (Asc), isDeleted (Asc), createdAt (Desc)
   
4. Collection: verification_requests
   Fields: status (Asc), submittedAt (Asc)
   
5. Collection: moderation_reports
   Fields: status (Asc), createdAt (Asc)
   
6. Collection: chats
   Fields: participants (Asc), lastMessageAt (Desc)
   
7. Collection: users
   Fields: isActive (Asc), roles (Asc), createdAt (Desc)
*/

export {};
