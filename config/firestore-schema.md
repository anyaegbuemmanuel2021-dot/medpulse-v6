# MedPulse Enterprise — Firestore Database Schema v4.0

## Collections

### /users/{uid}
Stores user profiles. UID is immutable.
- uid, username, fullName, email, photoURL, bio
- specialization, institution, country
- role: owner | super_admin | security_admin | verification_admin | advertisement_admin | support_admin | moderator | analytics_admin | user | guest
- labels: doctor | nurse | student | advertiser | verified | premium | vip
- verificationStatus: unverified | pending | reviewing | approved | rejected
- isVerified, isBanned, isSuspended, suspendedUntil
- followers, following, totalPosts, totalPoints, badges
- createdAt, updatedAt, lastLogin, deviceFingerprints

### /posts/{postId}
User-generated content.
- userId, userProfile (denormalized)
- contentType: video | slide | article | case_study | note | thread | poll
- content: { text, mediaURLs, thumbnailURL, duration }
- tags, specialty, likes, comments, shares, saves, views, feedScore
- isApproved, isFlagged, isDeleted, deletedAt
- createdAt, updatedAt

### /posts/{postId}/comments/{commentId}
- userId, content, likes, replies, isApproved, isFlagged

### /engagements/{engagementId}
- userId, postId, type: like | save | share | view | comment

### /follows/{followId}
- followerId, followingId, createdAt

### /communities/{communityId}
- name, description, coverImage, members, createdBy, moderators
- tags, isPrivate, rules, channels, createdAt, updatedAt

### /conversations/{conversationId}
- participants: [uid1, uid2]
- /messages/{messageId}: senderId, content, attachments, createdAt

### /verification_requests/{requestId}
- userId, type: identity | medical | professional
- status: pending | reviewing | approved | rejected
- documents: { certificateURL, idURL, verificationProof }
- reviewedBy, reviewedAt, rejectionReason

### /advertisements/{adId}
- advertiserId, title, description, mediaURL, targetURL
- status: pending | approved | rejected | paused | active | expired
- targetAudience: { countries, labels, ageRange }
- budget, spent, impressions, clicks, ctr
- startDate, endDate, reviewedBy, reviewedAt

### /maintenance/config
- isActive (bool), isEmergencyLockdown (bool)
- message, scheduledStart, scheduledEnd, countdownEndsAt
- enabledBy, enabledAt, updatedAt

### /email_campaigns/{campaignId}
- name, subject, body, templateId
- filter: { countries, labels, roles, isVerified }
- status: draft | scheduled | sending | sent | failed
- scheduledAt, sentAt, recipientCount, openCount, clickCount
- createdBy, createdAt, updatedAt

### /email_templates/{templateId}
- name, subject, body, variables[], createdAt, updatedAt

### /audit_logs/{logId}  ← IMMUTABLE (write=false in rules)
- adminId, adminRole, action, target, targetType, details, ipAddress, timestamp

### /security_logs/{logId}  ← IMMUTABLE
- userId, action, ipAddress, userAgent, device, status, details, createdAt

### /failed_logins/{base64email}
- email, attempts, lockedUntil, lastAttemptAt, ipAddress

### /blocked_ips/{ipKey}
- ip, reason, blockedAt, blockedBy, expiresAt

### /blocked_devices/{deviceId}
- deviceId, reason, blockedAt, blockedBy

### /moderation_actions/{actionId}
- contentId, contentType, userId, flags, aiConfidenceScore
- actionTaken: approved | shadow_hide | soft_delete | hard_delete | suspended | banned
- reason, actionBy, appealable

### /flagged_content/{flagId}
- contentId, contentType, reportedBy, flags, createdAt

### /reports/{reportId}
- reporterId, targetId, targetType, reason, status, createdAt

### /recycle_bin/{itemId}
- itemType, originalId, originalCollection, originalData
- deletedBy, deletedAt, expiresAt (30 days auto-purge)
- restoredBy, restoredAt

### /notifications/{userId}/notifications/{notificationId}
- type: like | comment | mention | follow | message | verification | admin_alert | system
- title, message, relatedId, read, readAt, createdAt

### /analytics/{docId}
- date, totalUsers, totalPosts, dau, mau, newUserCount
- totalEngagement, avgSessionDuration, retentionRate

### /courses/{courseId}
- title, description, instructor, specialty, level, duration
- modules[], totalStudents, rating, isPublished

### /user_progress/{progressId}
- userId, courseId, completedLessons[], progress, lastAccessedAt

### /roles/{roleId}
- role, displayName, description, permissions[]

### /backups/{backupId}
- createdBy, collections[], storageURL, sizeBytes, status, createdAt

### /search_index/{indexId}
- query, results[], frequency, lastSearched

### /rate_limits/{resourceKey}
- userId, resource, requestCount, resetAt, isBlocked

### /mail/{docId}  ← Firebase Email Extension
- to, message: { subject, html }, campaignId, createdAt

## Indexes (firestore.indexes.json additions)
- users: role ASC, createdAt DESC
- users: country ASC, labels ARRAY, isVerified ASC
- posts: isApproved ASC, feedScore DESC, createdAt DESC
- posts: userId ASC, createdAt DESC
- advertisements: status ASC, createdAt DESC
- audit_logs: adminId ASC, timestamp DESC
- security_logs: action ASC, createdAt DESC
- failed_logins: email ASC, lastAttemptAt DESC
- recycle_bin: expiresAt ASC

---

## v5.0 Additions

### /user_activity/{activityId}
- userId (nullable – anonymous tracking), postId
- action: view | watch | scroll_past | replay | share | save | complete
- duration (seconds), completionRate (0-1), scrollSpeed, timestamp

### /watch_history/{historyId}
- userId, postId, duration, completionRate, watchedAt

### /for_you_feed/{userId}  ← Cloud Functions write-only
- userId, postIds[], generatedAt, expiresAt

### /interest_profiles/{userId}
- userId
- specialties: { specialty → score }
- contentTypes: { contentType → score }
- hashtags: { slug → score }
- creators: { uid → score }
- communities: { communityId → score }
- lastUpdated

### /recommendations/{userId}  ← Cloud Functions write-only
- userId, postIds[], source, generatedAt, expiresAt

### /hashtags/{hashtagId}
- slug (lowercase, unique), displayName, description
- postCount, weeklyPostCount (reset weekly), followerCount
- isTrending, trendScore, specialty, createdAt, updatedAt

### /live_streams/{streamId}
- hostId, hostProfile, title, description, thumbnailURL
- playbackURL, chatEnabled, viewerCount, peakViewerCount
- status: scheduled | live | ended | cancelled
- scheduledFor, startedAt, endedAt, duration, recordingURL
- tags, specialty, createdAt

### /events/{eventId}
- organizerId, title, description, coverImageURL, eventType
- isOnline, location, meetingURL
- startDate, endDate, timezone, maxAttendees, registeredCount
- tags, specialty, isFree, price, status, createdAt, updatedAt

### /event_registrations/{registrationId}
- eventId, userId, registeredAt

### /premium_subscriptions/{subId}
- userId, planTier: free | premium | professional | enterprise
- status: active | cancelled | expired | trial
- startDate, endDate, trialEnd, price, currency
- paymentProvider, paymentReference, features[], createdAt, updatedAt

### /community_members/{memberId}
- communityId, userId, role: member | moderator | admin, joinedAt

### /trending_snapshots/{snapId}  ← Cloud Functions write-only
- type: post | hashtag | creator | community
- targetId, score, rank, period: hourly | daily | weekly
- snapshotAt

## Feed Score Formula (V5)
Score = (watchTimeSec × 40) + (shares × 20) + (saves × 15) + (comments × 10) + (likes × 5)

Aggregated hourly by Cloud Function `aggregateFeedScores`.

## Feed Tabs
- for_you     → personalized from for_you_feed cache; fallback to feedScore DESC
- following   → posts from followed users; sorted by createdAt DESC
- trending    → posts where isTrending=true; sorted by feedScore DESC
- communities → posts from joined communities; sorted by createdAt DESC
- live        → live_streams where status=live; sorted by viewerCount DESC
- latest      → all approved posts; sorted by createdAt DESC

---

## v6.0 Additions (AfrSocial + Final Addendum)

### /stories/{storyId}
- userId, userProfile, mediaURL, mediaType: image|video
- caption, backgroundColor, duration, viewCount, reactions
- expiresAt (24h TTL), isHighlight, highlightId, createdAt
- Cloud Function purges expired stories hourly

### /story_highlights/{highlightId}
- userId, title, coverURL, storyIds[], createdAt, updatedAt

### /feature_flags/config  ← Singleton
- stories, liveStreaming, marketplace, jobBoard, voiceNotes, groupChats
- communities, aiModeration, twoFactorAuth
- EMERGENCY: userRegistration, uploadsEnabled, commentsEnabled, messagingEnabled, livestreamsEnabled
- updatedBy, updatedAt

### /marketplace_listings/{listingId}
- sellerId, sellerProfile, title, description, category
- condition: new|like_new|good|fair|for_parts
- price, currency, negotiable, imageURLs, location
- isOnlineAvailable, status: active|sold|paused|removed|pending_review
- viewCount, tags, createdAt, updatedAt

### /jobs/{jobId}
- organizationId, postedBy, title, description
- requirements[], responsibilities[], salary
- location, isRemote, jobType, experienceLevel, specialty
- applicationURL, deadline, applicantCount, status: open|closed|draft

### /organizations/{orgId}
- ownerId, admins[], name, handle, type, description
- logoURL, coverURL, website, location, size, industry
- foundedYear, isVerified, followerCount, employeeCount

### /appeals/{appealId}
- userId, appealType, targetId, description, evidenceURLs[]
- status: pending|under_review|approved|denied|withdrawn
- assignedTo, moderatorNotes, resolution, submittedAt, resolvedAt

### /data_requests/{requestId}
- userId, requestType: export_data|delete_account|restrict_processing
- status: pending|processing|completed|rejected
- downloadURL, expiresAt, requestedAt, processedAt, processedBy

### /policies/{policyId}
- type: terms_of_service|privacy_policy|cookie_policy|community_guidelines
  |medical_disclaimer|copyright_policy|intellectual_property
  |appeals_policy|verification_policy|data_retention_policy
- version, title, content, publishedAt, effectiveAt, isActive, createdBy

### /policy_acceptances/{acceptanceId}  ← IMMUTABLE
- userId, policyType, policyVersion, acceptedAt, ipAddress, userAgent

### /user_risk_scores/{userId}  ← Cloud Functions write-only
- riskScore (0-100), riskLevel: low|medium|high|critical
- flags: isSuspectedBot, isRepeatOffender, hasBanEvasion, etc.
- offenseCount, banCount, reportCount, lastCalculatedAt

### /ban_evasion_records/{recordId}  ← Cloud Functions write-only
- originalUserId, suspectedUserId, evidence, confidence, status
- status: suspected|confirmed|dismissed

### /coordinated_abuse_groups/{groupId}  ← Cloud Functions write-only
- userIds[], evidenceType: engagement_farm|spam_network|fake_review_ring|harassment_group
- confidence, detectedAt, actionTaken, resolvedAt

### /ai_moderation_queue/{itemId}  ← Cloud Functions write-only
- contentId, contentType, scores{}, overallRisk, suggestedAction
- categories[], status: pending_human_review|auto_actioned|reviewed

### /content_versions/{versionId}
- contentId, contentType, version, data{}, editedBy, editedAt, changeReason

### /system_health/{snapshotId}  ← Cloud Functions write-only
- cpu%, memory%, storage%, dbLoad%, apiResponseTime(ms)
- errorRate%, uptimePercent, queueDepth, activeConnections, timestamp
- Auto-pruned after 24h

### /system_alerts/{alertId}  ← Cloud Functions write-only
- alertType: cpu|memory|storage|error_rate|api|security|queue
- severity: info|warning|critical
- message, value, threshold, resolvedAt, createdAt

### /announcements/{announcementId}
- title, body, type: general|maintenance|feature|emergency|policy
- targetFilter: {roles, countries, labels}, isActive
- scheduledAt, sentAt, expiresAt, createdBy, createdAt

### /transparency_reports/{reportId}
- period (e.g. "2026-Q1"), totalReports, actionsOnContent
- accountsSuspended, accountsBanned, governmentRequests
- verificationRequests, publishedAt, reportURL

### /moderation_escalations/{escId}
- reportId, escalatedBy, escalatedTo, reason
- priority: low|medium|high|critical
- status: open|in_review|resolved, createdAt, resolvedAt

### /creator_stats/{userId_period}  ← Cloud Functions write-only
- userId, period: 7d|30d|90d|all
- totalViews, totalWatchTime, totalLikes, totalComments
- totalShares, totalSaves, followerGrowth, avgEngagementRate
- topPost, estimatedRevenue, calculatedAt

## Content Lifecycle States (V6)
Draft → Scheduled → Published → Archived → Soft Deleted → Restored → Permanently Deleted

## Admin Dashboard Modules (V6 — 17 modules)
Users, Admins, Roles, Verification Center, Advertisement Center,
Security Center, Maintenance Center, Email Center, Analytics,
Audit Logs, Reports, Recycle Bin, Backups, Settings,
**Feature Flags**, **Trust & Safety**, **Emergency Controls**,
**SOC Dashboard**, **Data Requests**, **Governance**, **AI Moderation**,
**Monetization**, **Announcements**
