/**
 * MedPulse Enterprise - Environment Configuration
 * Centralized configuration for all environments
 */

export const ENVIRONMENT = process.env.NODE_ENV || "development";

export const FIREBASE_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "",
};

export const CLOUDINARY_CONFIG = {
  cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "",
  uploadPreset: process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "",
  apiKey: process.env.CLOUDINARY_API_KEY || "",
  apiSecret: process.env.CLOUDINARY_API_SECRET || "",
};

export const APP_CONFIG = {
  name: "MedPulse Enterprise",
  version: "1.0.0",
  description: "World-class enterprise medical social-learning ecosystem",
  domain: process.env.NEXT_PUBLIC_APP_DOMAIN || "medpulse.local",
  supportEmail: "support@medpulse.enterprise",
  adminEmail: process.env.ADMIN_EMAIL || "",
  maxFileSize: 100 * 1024 * 1024, // 100MB
  maxVideoSize: 500 * 1024 * 1024, // 500MB
  allowedVideoFormats: ["mp4", "webm", "mov"],
  allowedImageFormats: ["jpg", "jpeg", "png", "webp", "gif"],
  allowedDocumentFormats: ["pdf", "doc", "docx", "ppt", "pptx", "xlsx"],
};

export const API_CONFIG = {
  timeout: 30000,
  retries: 3,
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
};

export const CACHE_CONFIG = {
  ttl: {
    user: 5 * 60 * 1000, // 5 minutes
    post: 10 * 60 * 1000, // 10 minutes
    feed: 5 * 60 * 1000, // 5 minutes
    analytics: 60 * 60 * 1000, // 1 hour
    search: 30 * 60 * 1000, // 30 minutes
  },
};

export const PAGINATION_CONFIG = {
  defaultLimit: 20,
  maxLimit: 100,
  defaultPage: 1,
};

export const RATE_LIMIT_CONFIG = {
  postCreation: {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  messageCreation: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
  },
  uploadFile: {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  apiCall: {
    maxRequests: 1000,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
};

export const VERIFICATION_CONFIG = {
  documentExpiryDays: 365,
  autoApprovalThreshold: 0.95, // 95% confidence
  manualReviewRequiredRoles: ["doctor", "institution"],
};

export const MODERATION_CONFIG = {
  autoHideThreshold: 0.9, // 90% confidence
  flagForReviewThreshold: 0.7, // 70% confidence
  maxFlagsBeforeSuspend: 5,
  suspensionDurationDays: 7,
};

export const NOTIFICATION_CONFIG = {
  expiryDays: 30,
  batchSize: 100,
  retryAttempts: 3,
};

export const ANALYTICS_CONFIG = {
  trackingEnabled: true,
  batchSize: 50,
  flushIntervalMs: 5 * 60 * 1000, // 5 minutes
};

export const SECURITY_CONFIG = {
  sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
  maxLoginAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
  requireMFA: false, // can be enabled per user role
  appCheckEnabled: true,
};

export const FEATURES = {
  enableChat: true,
  enableCommunities: true,
  enableCreatorMode: true,
  enableLearningPath: true,
  enableAnalytics: true,
  enableAIModeration: true,
  enablePWA: true,
  enableOfflineMode: true,
};
