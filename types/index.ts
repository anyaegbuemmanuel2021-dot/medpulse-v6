/**
 * MedPulse Enterprise – Core Type Definitions  v4.0
 * Covers every role, module, and data model described in the Master Prompt.
 */

// ─── USER ROLES ──────────────────────────────────────────────────────────────
export enum UserRole {
  OWNER              = "owner",
  SUPER_ADMIN        = "super_admin",
  SECURITY_ADMIN     = "security_admin",
  VERIFICATION_ADMIN = "verification_admin",
  ADVERTISEMENT_ADMIN= "advertisement_admin",
  SUPPORT_ADMIN      = "support_admin",
  MODERATOR          = "moderator",
  ANALYTICS_ADMIN    = "analytics_admin",
  USER               = "user",
  GUEST              = "guest",           // unauthenticated
}

// ─── USER LABELS ─────────────────────────────────────────────────────────────
export type UserLabel =
  | "doctor" | "nurse" | "student" | "advertiser"
  | "verified" | "premium" | "vip";

// ─── VERIFICATION ─────────────────────────────────────────────────────────────
export enum VerificationStatus {
  UNVERIFIED = "unverified",
  PENDING    = "pending",
  REVIEWING  = "reviewing",
  APPROVED   = "approved",
  REJECTED   = "rejected",
}

export type VerificationType =
  | "identity" | "medical" | "professional"
  | "medical_student" | "doctor" | "institution" | "educator" | "creator";

export interface VerificationRequest {
  id: string;
  userId: string;
  type: VerificationType;
  status: VerificationStatus;
  documents: {
    certificateURL: string;
    idURL: string;
    verificationProof?: string;
  };
  submittedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectionReason?: string;
  metadata?: Record<string, unknown>;
}

// ─── USER PROFILE ─────────────────────────────────────────────────────────────
export interface UserProfile {
  uid: string;                        // Immutable, never editable
  username: string;
  fullName: string;
  email: string;
  photoURL?: string;
  bio?: string;
  specialization?: string;
  institution?: string;
  country?: string;
  role: UserRole;
  labels: UserLabel[];
  verificationStatus: VerificationStatus;
  isVerified: boolean;
  isSuspended: boolean;
  isBanned: boolean;
  suspendedUntil?: number;
  createdAt: number;
  updatedAt: number;
  lastLogin?: number;
  followers: number;
  following: number;
  totalPosts: number;
  totalPoints: number;
  badges: Badge[];
  socialLinks?: { linkedin?: string; twitter?: string; website?: string };
  settings?: {
    notifications: boolean;
    darkMode: boolean;
    language: string;
    privacyLevel: "public" | "private" | "friends";
  };
  deviceFingerprints?: string[];
  loginHistory?: LoginRecord[];
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: number;
}

export interface LoginRecord {
  ip: string;
  device: string;
  userAgent: string;
  timestamp: number;
  success: boolean;
}

// ─── CONTENT / FEED ──────────────────────────────────────────────────────────
export type ContentType =
  | "video" | "slide" | "article" | "case_study" | "note" | "thread" | "poll";

export interface Post {
  id: string;
  userId: string;
  userProfile: Partial<UserProfile>;
  contentType: ContentType;
  title?: string;
  description?: string;
  content: {
    text?: string;
    mediaURLs?: string[];
    thumbnailURL?: string;
    duration?: number;
  };
  tags: string[];
  specialty?: string;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  views: number;
  engagementScore: number;
  feedScore?: number;
  isApproved: boolean;
  isFlagged: boolean;
  isDeleted: boolean;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
  metadata?: { location?: string; anonymous?: boolean; allowComments?: boolean };
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  userProfile: Partial<UserProfile>;
  content: string;
  likes: number;
  replies: number;
  createdAt: number;
  updatedAt: number;
  isApproved: boolean;
  isFlagged: boolean;
}

export interface Engagement {
  id: string;
  userId: string;
  postId: string;
  type: "like" | "save" | "share" | "view" | "comment";
  createdAt: number;
  metadata?: Record<string, unknown>;
}

// ─── COMMUNITIES ─────────────────────────────────────────────────────────────
export interface Community {
  id: string;
  name: string;
  description: string;
  coverImage?: string;
  members: number;
  createdBy: string;
  moderators: string[];
  tags: string[];
  isPrivate: boolean;
  createdAt: number;
  updatedAt: number;
  rules?: string[];
  channels?: Channel[];
}

export interface Channel {
  id: string;
  communityId: string;
  name: string;
  description?: string;
  type: "general" | "discussion" | "resources" | "announcements" | "voice";
  createdAt: number;
  updatedAt: number;
}

// ─── MESSAGING ───────────────────────────────────────────────────────────────
export interface Message {
  id: string;
  senderId: string;
  conversationId: string;
  content: string;
  attachments?: Attachment[];
  reactions?: Record<string, string[]>;
  mentions?: string[];
  isEdited: boolean;
  editedAt?: number;
  deletedAt?: number;
  isPinned: boolean;
  createdAt: number;
}

export interface Attachment {
  id: string;
  type: "image" | "video" | "audio" | "document" | "file";
  url: string;
  name?: string;
  size?: number;
  duration?: number;
  thumbnail?: string;
}

export interface DirectMessage {
  id: string;
  participants: string[];
  lastMessageAt: number;
  lastMessageBy: string;
  isArchived: boolean;
  isBlocked: boolean;
  createdAt: number;
}

// ─── ADVERTISEMENT ────────────────────────────────────────────────────────────
export type AdStatus = "pending" | "approved" | "rejected" | "paused" | "active" | "expired";

export interface Advertisement {
  id: string;
  advertiserId: string;
  title: string;
  description: string;
  mediaURL?: string;
  targetURL: string;
  status: AdStatus;
  targetAudience?: {
    countries?: string[];
    labels?: UserLabel[];
    ageRange?: { min: number; max: number };
  };
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  ctr: number;
  startDate: number;
  endDate?: number;
  reviewedBy?: string;
  reviewedAt?: number;
  rejectionReason?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── MAINTENANCE MODE ─────────────────────────────────────────────────────────
export interface MaintenanceMode {
  id: "config";
  isActive: boolean;
  isEmergencyLockdown: boolean;
  message: string;
  scheduledStart?: number;
  scheduledEnd?: number;
  countdownEndsAt?: number;
  enabledBy: string;
  enabledAt?: number;
  updatedAt: number;
}

// ─── EMAIL CAMPAIGNS ──────────────────────────────────────────────────────────
export type EmailStatus = "draft" | "scheduled" | "sending" | "sent" | "failed";

export interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  templateId?: string;
  body: string;
  filter: {
    countries?: string[];
    labels?: UserLabel[];
    roles?: UserRole[];
    isVerified?: boolean;
  };
  status: EmailStatus;
  scheduledAt?: number;
  sentAt?: number;
  recipientCount: number;
  openCount: number;
  clickCount: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables?: string[];
  createdAt: number;
  updatedAt: number;
}

// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────
/** Immutable – never edited or deleted */
export interface AuditLog {
  id: string;
  adminId: string;
  adminRole: UserRole;
  action: string;
  target: string;
  targetType: "user" | "post" | "ad" | "community" | "system" | "role" | "email";
  details?: Record<string, unknown>;
  ipAddress?: string;
  timestamp: number;
}

// ─── SECURITY ─────────────────────────────────────────────────────────────────
export interface SecurityLog {
  id: string;
  userId?: string;
  action: string;
  ipAddress: string;
  userAgent: string;
  device?: string;
  status: "success" | "failure";
  details?: Record<string, unknown>;
  createdAt: number;
}

export interface FailedLoginRecord {
  id: string;
  email: string;
  ipAddress: string;
  attempts: number;
  lockedUntil?: number;
  lastAttemptAt: number;
}

export interface BlockedIP {
  id: string;
  ip: string;
  reason: string;
  blockedAt: number;
  blockedBy?: string;
  expiresAt?: number;
}

export interface BlockedDevice {
  id: string;
  deviceId: string;
  reason: string;
  blockedAt: number;
  blockedBy?: string;
}

export interface RateLimit {
  id: string;
  userId: string;
  resource: string;
  requestCount: number;
  resetAt: number;
  isBlocked: boolean;
}

// ─── RECYCLE BIN ──────────────────────────────────────────────────────────────
export type RecycleBinItemType = "user" | "post" | "advertisement" | "community";

export interface RecycleBinItem {
  id: string;
  itemType: RecycleBinItemType;
  originalId: string;
  originalData: Record<string, unknown>;
  deletedBy: string;
  deletedAt: number;
  expiresAt: number;          // Auto-purge after 30 days
  restoredBy?: string;
  restoredAt?: number;
}

// ─── ROLES & PERMISSIONS ──────────────────────────────────────────────────────
export type Permission =
  | "users.view" | "users.edit" | "users.ban" | "users.delete"
  | "admins.create" | "admins.delete" | "admins.view"
  | "roles.assign"
  | "posts.view" | "posts.moderate" | "posts.delete"
  | "verification.view" | "verification.manage"
  | "advertisements.view" | "advertisements.manage"
  | "security.view" | "security.manage"
  | "maintenance.manage"
  | "email.send" | "email.manage"
  | "analytics.view"
  | "audit_logs.view"
  | "reports.view" | "reports.manage"
  | "recycle_bin.view" | "recycle_bin.restore"
  | "backups.view" | "backups.restore"
  | "system.settings" | "system.lockdown";

export interface RoleDefinition {
  role: UserRole;
  displayName: string;
  description: string;
  permissions: Permission[];
}

// ─── MODERATION ───────────────────────────────────────────────────────────────
export enum ModerationFlag {
  SPAM         = "spam",
  HATE_SPEECH  = "hate_speech",
  NSFW         = "nsfw",
  MISINFORMATION = "misinformation",
  TOXICITY     = "toxicity",
  SCAM         = "scam",
  VIOLENCE     = "violence",
  COPYRIGHT    = "copyright",
}

export interface ModerationAction {
  id: string;
  contentId: string;
  contentType: "post" | "comment" | "message" | "user";
  userId: string;
  flags: ModerationFlag[];
  aiConfidenceScore: number;
  actionTaken: "approved" | "shadow_hide" | "soft_delete" | "hard_delete" | "suspended" | "banned";
  reason?: string;
  actionBy?: string;
  createdAt: number;
  updatedAt?: number;
  appealable: boolean;
}

export interface Appeal {
  id: string;
  moderationActionId: string;
  userId: string;
  reason: string;
  status: "pending" | "approved" | "denied";
  reviewedBy?: string;
  reviewedAt?: number;
  createdAt: number;
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
export enum NotificationType {
  LIKE         = "like",
  COMMENT      = "comment",
  MENTION      = "mention",
  FOLLOW       = "follow",
  MESSAGE      = "message",
  VERIFICATION = "verification",
  ADMIN_ALERT  = "admin_alert",
  SYSTEM       = "system",
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedId?: string;
  imageURL?: string;
  read: boolean;
  readAt?: number;
  createdAt: number;
  expiresAt?: number;
}

// ─── ANALYTICS ───────────────────────────────────────────────────────────────
export interface AnalyticsMetric {
  id: string;
  date: number;
  metricType: string;
  value: number;
  metadata?: Record<string, unknown>;
}

export interface PlatformAnalytics {
  date: number;
  dau: number;
  mau: number;
  newUserCount: number;
  totalPosts: number;
  totalEngagement: number;
  avgSessionDuration: number;
  retentionRate: number;
  topTrending: Post[];
}

// ─── LEARNING ─────────────────────────────────────────────────────────────────
export interface Course {
  id: string;
  title: string;
  description: string;
  instructor: string;
  thumbnailURL?: string;
  specialty: string;
  level: "beginner" | "intermediate" | "advanced";
  duration: number;
  modules: Module[];
  totalStudents: number;
  rating: number;
  reviews: number;
  tags: string[];
  isPublished: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Module {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  lessons: Lesson[];
  sequenceOrder: number;
  createdAt: number;
}

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  content: string;
  videoURL?: string;
  resources?: string[];
  duration: number;
  sequenceOrder: number;
  createdAt: number;
}

export interface UserProgress {
  id: string;
  userId: string;
  courseId: string;
  completedLessons: string[];
  currentLesson?: string;
  progress: number;
  lastAccessedAt: number;
  completedAt?: number;
}

// ─── UPLOADS ──────────────────────────────────────────────────────────────────
export interface Upload {
  id: string;
  userId: string;
  fileName: string;
  mimeType: string;
  size: number;
  cloudinaryUrl?: string;
  firebaseUrl?: string;
  thumbnail?: string;
  duration?: number;
  status: "uploading" | "processing" | "completed" | "failed";
  progress?: number;
  createdAt: number;
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
export interface SearchResult {
  type: "user" | "post" | "hashtag" | "community";
  id: string;
  title: string;
  description?: string;
  image?: string;
  relevanceScore: number;
  metadata?: Record<string, unknown>;
}

// ─── API RESPONSE ─────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  timestamp: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; hasMore: boolean };
  timestamp: number;
}

// ─── ADMIN STATS ──────────────────────────────────────────────────────────────
export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalPosts: number;
  flaggedContent: number;
  pendingVerifications: number;
  totalRevenue?: number;
  reportedUsers: number;
  activeAds: number;
  systemHealth: { uptime: number; responseTime: number; errorRate: number };
}

// ─── BACKUP ───────────────────────────────────────────────────────────────────
export interface Backup {
  id: string;
  createdBy: string;
  collections: string[];
  storageURL: string;
  sizeBytes: number;
  status: "running" | "completed" | "failed";
  createdAt: number;
  completedAt?: number;
}

// ═══════════════════════ V5 ADDITIONS ════════════════════════════════════════

// ─── EXTENDED ROLES (V5) ──────────────────────────────────────────────────────
// Added to UserRole enum (must be kept in sync with the enum above)
// UserRole.COMMUNITY_ADMIN  = "community_admin"
// UserRole.MODERATION_ADMIN = "moderation_admin"
// These are appended via the roles-permissions config below.

// ─── CONTENT TYPES (V5) ──────────────────────────────────────────────────────
export type ContentTypeV5 =
  | ContentType
  | "audio" | "case_study" | "research_summary" | "live_stream" | "event_announcement";

// ─── WATCH ACTIVITY ───────────────────────────────────────────────────────────
export interface WatchActivity {
  id: string;
  userId: string;
  postId: string;
  action: "view" | "watch" | "scroll_past" | "replay" | "share" | "save" | "complete";
  duration: number;          // seconds watched
  completionRate: number;    // 0-1
  scrollSpeed?: number;      // px/sec
  timestamp: number;
}

// ─── INTEREST PROFILE ─────────────────────────────────────────────────────────
export interface InterestProfile {
  userId: string;
  specialties: Record<string, number>;   // specialty → score
  contentTypes: Record<string, number>;  // contentType → score
  hashtags: Record<string, number>;      // hashtag → score
  creators: Record<string, number>;      // creatorId → score
  communities: Record<string, number>;   // communityId → score
  lastUpdated: number;
}

// ─── RECOMMENDATION ───────────────────────────────────────────────────────────
export interface Recommendation {
  userId: string;
  postIds: string[];
  generatedAt: number;
  expiresAt: number;
  source: "interest" | "trending" | "following" | "community" | "hashtag";
}

// ─── HASHTAG ──────────────────────────────────────────────────────────────────
export interface Hashtag {
  id: string;
  slug: string;                  // lowercase, no spaces
  displayName: string;
  description?: string;
  postCount: number;
  weeklyPostCount: number;
  followerCount: number;
  isTrending: boolean;
  trendScore: number;
  specialty?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── LIVE STREAM ──────────────────────────────────────────────────────────────
export type StreamStatus = "scheduled" | "live" | "ended" | "cancelled";

export interface LiveStream {
  id: string;
  hostId: string;
  hostProfile: Partial<UserProfile>;
  title: string;
  description?: string;
  thumbnailURL?: string;
  streamKey?: string;           // Never exposed to clients
  playbackURL?: string;
  chatEnabled: boolean;
  viewerCount: number;
  peakViewerCount: number;
  duration?: number;            // seconds, set on end
  recordingURL?: string;        // replay archive
  status: StreamStatus;
  scheduledFor?: number;
  startedAt?: number;
  endedAt?: number;
  tags: string[];
  specialty?: string;
  createdAt: number;
}

// ─── EVENT ────────────────────────────────────────────────────────────────────
export type EventType =
  | "conference" | "workshop" | "webinar" | "community_event" | "live_stream";

export interface MedEvent {
  id: string;
  organizerId: string;
  title: string;
  description: string;
  coverImageURL?: string;
  eventType: EventType;
  isOnline: boolean;
  location?: string;
  meetingURL?: string;
  startDate: number;
  endDate: number;
  timezone: string;
  maxAttendees?: number;
  registeredCount: number;
  tags: string[];
  specialty?: string;
  isFree: boolean;
  price?: number;
  status: "upcoming" | "live" | "ended" | "cancelled";
  createdAt: number;
  updatedAt: number;
}

// ─── PREMIUM SUBSCRIPTION ─────────────────────────────────────────────────────
export type PlanTier = "free" | "premium" | "professional" | "enterprise";

export interface PremiumSubscription {
  id: string;
  userId: string;
  planTier: PlanTier;
  status: "active" | "cancelled" | "expired" | "trial";
  startDate: number;
  endDate?: number;
  trialEnd?: number;
  price: number;
  currency: string;
  paymentProvider?: string;
  paymentReference?: string;
  features: string[];
  createdAt: number;
  updatedAt: number;
}

// ─── TRENDING SNAPSHOT ────────────────────────────────────────────────────────
export interface TrendingSnapshot {
  id: string;
  type: "post" | "hashtag" | "creator" | "community";
  targetId: string;
  score: number;
  rank: number;
  period: "hourly" | "daily" | "weekly";
  snapshotAt: number;
}

// ─── FEED TAB ─────────────────────────────────────────────────────────────────
export type FeedTab = "for_you" | "following" | "trending" | "communities" | "live" | "latest";

// ─── FEED SCORE INPUT ─────────────────────────────────────────────────────────
export interface FeedScoreInput {
  watchTimeSec: number;
  completionRate: number;
  shares: number;
  saves: number;
  comments: number;
  likes: number;
  recencyHours: number;
  authorTrustScore?: number;
  userInterestMatch?: number;
}

// ═══════════════════════ V6 ADDITIONS (AFRISOCIAL + FINAL ADDENDUM) ══════════

// ─── STORIES ──────────────────────────────────────────────────────────────────
export interface Story {
  id: string;
  userId: string;
  userProfile: Partial<UserProfile>;
  mediaURL: string;
  mediaType: "image" | "video";
  caption?: string;
  backgroundColor?: string;
  duration: number;          // seconds (max 15 for video)
  viewCount: number;
  reactions: Record<string, string[]>; // emoji → [userId]
  expiresAt: number;         // 24 hrs after creation
  isHighlight: boolean;
  highlightId?: string;
  createdAt: number;
}

export interface StoryHighlight {
  id: string;
  userId: string;
  title: string;
  coverURL?: string;
  storyIds: string[];
  createdAt: number;
  updatedAt: number;
}

// ─── MARKETPLACE ──────────────────────────────────────────────────────────────
export type ListingStatus = "active" | "sold" | "paused" | "removed" | "pending_review";

export interface MarketplaceListing {
  id: string;
  sellerId: string;
  sellerProfile: Partial<UserProfile>;
  title: string;
  description: string;
  category: string;
  condition: "new" | "like_new" | "good" | "fair" | "for_parts";
  price: number;
  currency: string;
  negotiable: boolean;
  imageURLs: string[];
  location?: string;
  isOnlineAvailable: boolean;
  status: ListingStatus;
  viewCount: number;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  soldAt?: number;
  reviewedAt?: number;
}

export interface SellerReview {
  id: string;
  sellerId: string;
  reviewerId: string;
  listingId: string;
  rating: number;            // 1-5
  comment?: string;
  createdAt: number;
}

// ─── JOB BOARD ────────────────────────────────────────────────────────────────
export interface JobPost {
  id: string;
  organizationId: string;
  postedBy: string;
  title: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  salary?: { min: number; max: number; currency: string; period: string };
  location: string;
  isRemote: boolean;
  jobType: "full_time" | "part_time" | "contract" | "internship" | "volunteer";
  specialty?: string;
  experienceLevel: "entry" | "mid" | "senior" | "executive";
  applicationURL?: string;
  applicationEmail?: string;
  deadline?: number;
  applicantCount: number;
  status: "open" | "closed" | "draft";
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

// ─── COMPANY / ORGANIZATION PAGES ─────────────────────────────────────────────
export interface OrganizationPage {
  id: string;
  ownerId: string;
  admins: string[];
  name: string;
  handle: string;            // unique slug
  type: "company" | "hospital" | "university" | "ngo" | "government" | "other";
  description: string;
  logoURL?: string;
  coverURL?: string;
  website?: string;
  location?: string;
  size?: string;
  industry?: string;
  foundedYear?: number;
  isVerified: boolean;
  followerCount: number;
  employeeCount: number;
  createdAt: number;
  updatedAt: number;
}

// ─── FEATURE FLAGS ────────────────────────────────────────────────────────────
export interface FeatureFlags {
  id: "config";
  stories:             boolean;
  liveStreaming:       boolean;
  marketplace:        boolean;
  jobBoard:           boolean;
  voiceNotes:         boolean;
  groupChats:         boolean;
  communities:        boolean;
  aiModeration:       boolean;
  twoFactorAuth:      boolean;
  userRegistration:   boolean;    // Emergency: disable new signups
  uploadsEnabled:     boolean;    // Emergency: disable all uploads
  commentsEnabled:    boolean;    // Emergency: disable all comments
  messagingEnabled:   boolean;    // Emergency: disable messaging
  livestreamsEnabled: boolean;    // Emergency: disable livestreams
  marketplaceEnabled: boolean;
  jobsEnabled:        boolean;
  updatedBy: string;
  updatedAt: number;
}

// ─── EMERGENCY CONTROLS ───────────────────────────────────────────────────────
export interface EmergencyNotice {
  id: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  isActive: boolean;
  targetAudience: "all" | "authenticated" | "admins";
  createdBy: string;
  createdAt: number;
  expiresAt?: number;
}

// ─── TRUST & SAFETY ───────────────────────────────────────────────────────────
export interface UserRiskScore {
  userId: string;
  riskScore: number;           // 0-100; higher = riskier
  riskLevel: "low" | "medium" | "high" | "critical";
  flags: {
    isSuspectedBot: boolean;
    isSuspectedFake: boolean;
    isRepeatOffender: boolean;
    hasBanEvasion: boolean;
    hasCoordinatedAbuse: boolean;
    isImpersonator: boolean;
    hasSuspectedScam: boolean;
  };
  offenseCount: number;
  banCount: number;
  reportCount: number;
  lastCalculatedAt: number;
}

export interface BanEvasionRecord {
  id: string;
  originalUserId: string;
  suspectedUserId: string;
  evidence: {
    sharedIPs?: string[];
    sharedDevices?: string[];
    similarUsername?: boolean;
    similarEmail?: boolean;
    behaviorMatch?: number;
  };
  confidence: number;         // 0-1
  status: "suspected" | "confirmed" | "dismissed";
  reviewedBy?: string;
  reviewedAt?: number;
  createdAt: number;
}

export interface CoordinatedAbuseGroup {
  id: string;
  userIds: string[];
  evidenceType: "engagement_farm" | "spam_network" | "fake_review_ring" | "harassment_group";
  confidence: number;
  detectedAt: number;
  actionTaken?: string;
  resolvedAt?: number;
}

// ─── CONTENT LIFECYCLE ────────────────────────────────────────────────────────
export type ContentLifecycleStatus =
  | "draft" | "scheduled" | "published" | "archived"
  | "soft_deleted" | "restored" | "permanently_deleted";

export interface ContentVersion {
  id: string;
  contentId: string;
  contentType: "post" | "article" | "comment";
  version: number;
  data: Record<string, unknown>;   // snapshot of content at this version
  editedBy: string;
  editedAt: number;
  changeReason?: string;
}

// ─── DATA EXPORT / USER RIGHTS ────────────────────────────────────────────────
export type DataRequestType = "export_data" | "delete_account" | "restrict_processing";
export type DataRequestStatus = "pending" | "processing" | "completed" | "rejected";

export interface DataRequest {
  id: string;
  userId: string;
  requestType: DataRequestType;
  status: DataRequestStatus;
  downloadURL?: string;
  expiresAt?: number;            // download link validity
  requestedAt: number;
  processedAt?: number;
  processedBy?: string;
  rejectionReason?: string;
}

// ─── POLICY & COMPLIANCE ──────────────────────────────────────────────────────
export type PolicyType =
  | "terms_of_service" | "privacy_policy" | "cookie_policy"
  | "community_guidelines" | "medical_disclaimer" | "copyright_policy"
  | "intellectual_property" | "appeals_policy" | "verification_policy"
  | "data_retention_policy";

export interface PolicyDocument {
  id: string;
  type: PolicyType;
  version: string;
  title: string;
  content: string;
  publishedAt: number;
  effectiveAt: number;
  isActive: boolean;
  createdBy: string;
}

export interface PolicyAcceptance {
  id: string;
  userId: string;
  policyType: PolicyType;
  policyVersion: string;
  acceptedAt: number;
  ipAddress?: string;
  userAgent?: string;
}

// ─── APPEALS ──────────────────────────────────────────────────────────────────
export type AppealType =
  | "content_removal" | "account_ban" | "account_suspension"
  | "verification_rejection" | "community_ban" | "other";

export type AppealStatus = "pending" | "under_review" | "approved" | "denied" | "withdrawn";

export interface AppealCase {
  id: string;
  userId: string;
  appealType: AppealType;
  targetId: string;             // contentId, banId, etc.
  description: string;
  evidenceURLs?: string[];
  status: AppealStatus;
  assignedTo?: string;
  moderatorNotes?: string;
  resolution?: string;
  submittedAt: number;
  resolvedAt?: number;
}

// ─── GOVERNANCE ───────────────────────────────────────────────────────────────
export interface ModerationEscalation {
  id: string;
  reportId: string;
  escalatedBy: string;
  escalatedTo: string;
  reason: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_review" | "resolved";
  createdAt: number;
  resolvedAt?: number;
}

export interface TransparencyReport {
  id: string;
  period: string;               // e.g. "2026-Q1"
  totalReports: number;
  actionsOnContent: number;
  accountsSuspended: number;
  accountsBanned: number;
  governmentRequests: number;
  verificationRequests: number;
  publishedAt: number;
  reportURL?: string;
}

// ─── SYSTEM MONITORING ────────────────────────────────────────────────────────
export interface SystemHealthSnapshot {
  id: string;
  timestamp: number;
  cpu: number;                  // %
  memory: number;               // %
  storage: number;              // %
  dbLoad: number;               // %
  apiResponseTime: number;      // ms
  errorRate: number;            // %
  uptimePercent: number;
  queueDepth: number;
  activeConnections: number;
}

export interface SystemAlert {
  id: string;
  alertType: "cpu" | "memory" | "storage" | "error_rate" | "api" | "security" | "queue";
  severity: "info" | "warning" | "critical";
  message: string;
  value: number;
  threshold: number;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  resolvedAt?: number;
  createdAt: number;
}

// ─── ANNOUNCEMENTS ────────────────────────────────────────────────────────────
export interface PlatformAnnouncement {
  id: string;
  title: string;
  body: string;
  type: "general" | "maintenance" | "feature" | "emergency" | "policy";
  targetFilter?: {
    roles?: string[];
    countries?: string[];
    labels?: string[];
  };
  isActive: boolean;
  scheduledAt?: number;
  sentAt?: number;
  expiresAt?: number;
  createdBy: string;
  createdAt: number;
}

// ─── CREATOR STUDIO ───────────────────────────────────────────────────────────
export interface CreatorStats {
  userId: string;
  period: "7d" | "30d" | "90d" | "all";
  totalViews: number;
  totalWatchTime: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  followerGrowth: number;
  topPost?: Partial<Post>;
  avgEngagementRate: number;
  estimatedRevenue?: number;
  calculatedAt: number;
}

// ─── EXTENDED PROFILE ─────────────────────────────────────────────────────────
export interface WorkExperience {
  id: string;
  userId: string;
  jobTitle: string;
  organization: string;
  location?: string;
  startDate: number;
  endDate?: number;
  isCurrent: boolean;
  description?: string;
}

export interface Education {
  id: string;
  userId: string;
  institution: string;
  degree?: string;
  fieldOfStudy?: string;
  startYear: number;
  endYear?: number;
  isCurrent: boolean;
}

export interface Certification {
  id: string;
  userId: string;
  name: string;
  issuingOrg: string;
  issueDate: number;
  expiryDate?: number;
  credentialURL?: string;
}

export interface Recommendation {
  id: string;
  fromUserId: string;
  toUserId: string;
  relationship: string;
  content: string;
  isPublic: boolean;
  createdAt: number;
}

// ─── BOT DETECTION ────────────────────────────────────────────────────────────
export interface BotDetectionRecord {
  id: string;
  userId?: string;
  ipAddress: string;
  userAgent: string;
  deviceFingerprint?: string;
  behaviorScore: number;        // 0-100; higher = more bot-like
  signals: {
    tooFastRegistration?: boolean;
    uniformPostTiming?: boolean;
    unusualClickPattern?: boolean;
    headlessBrowserDetected?: boolean;
    knownBotUserAgent?: boolean;
    vpnOrProxy?: boolean;
    dataCenterIP?: boolean;
  };
  classification: "human" | "suspected_bot" | "confirmed_bot";
  action: "none" | "captcha_required" | "blocked";
  detectedAt: number;
}
