// File: functions/src/index.ts  (ADD to existing functions file)
// All missing Cloud Functions for MedPulse v6
// APPEND these exports to your existing functions/src/index.ts

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Only init if not already initialised in existing file
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

// ============================================================================
// MESSAGING FUNCTIONS
// ============================================================================

/**
 * On new message — update conversation + send push notification
 */
export const onMessageCreated = functions.firestore
  .document('conversations/{conversationId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const { conversationId, messageId } = context.params;
    const message = snap.data();

    try {
      // Update conversation last message
      await db.doc(`conversations/${conversationId}`).update({
        lastMessage: { ...message, id: messageId },
        lastMessageAt: Timestamp.now(),
        messageCount: FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      });

      // Get conversation participants
      const convSnap = await db.doc(`conversations/${conversationId}`).get();
      const conversation = convSnap.data();
      if (!conversation) return;

      const recipients = (conversation.participants as string[]).filter(
        (uid: string) => uid !== message.senderId
      );

      // Send push notifications to recipients
      for (const recipientId of recipients) {
        const userSnap = await db.doc(`users/${recipientId}`).get();
        const user = userSnap.data();
        if (!user?.fcmToken) continue;

        const isMuted = conversation.isMuted?.[recipientId];
        if (isMuted) continue;

        try {
          await admin.messaging().send({
            token: user.fcmToken,
            notification: {
              title: message.senderName,
              body:
                message.type === 'media'
                  ? '📷 Sent a photo'
                  : message.type === 'voice'
                  ? '🎤 Sent a voice note'
                  : message.content?.substring(0, 100) || 'New message',
            },
            data: {
              type: 'message',
              conversationId,
              messageId,
              senderId: message.senderId,
            },
            apns: { payload: { aps: { badge: 1, sound: 'default' } } },
            android: { priority: 'high' },
          });
        } catch (pushError) {
          functions.logger.warn('Push notification failed:', pushError);
        }
      }
    } catch (error) {
      functions.logger.error('onMessageCreated error:', error);
    }
  });

/**
 * Clean up expired typing indicators every minute
 */
export const cleanupTypingIndicators = functions.pubsub
  .schedule('every 2 minutes')
  .onRun(async () => {
    try {
      const twoMinutesAgo = Timestamp.fromDate(
        new Date(Date.now() - 2 * 60 * 1000)
      );
      const snap = await db
        .collection('typing')
        .where('startedAt', '<', twoMinutesAgo)
        .get();

      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      if (snap.size > 0) await batch.commit();

      functions.logger.info(`Cleaned up ${snap.size} typing indicators`);
    } catch (error) {
      functions.logger.error('cleanupTypingIndicators error:', error);
    }
  });

// ============================================================================
// HEALTHCARE VERIFICATION FUNCTIONS
// ============================================================================

/**
 * On verification request — check regulatory body availability
 */
export const onVerificationSubmitted = functions.firestore
  .document('verification_requests/{requestId}')
  .onCreate(async (snap, context) => {
    const request = snap.data();
    try {
      // Auto-assign based on country queue
      const country = request.country as string;
      await snap.ref.update({
        queuedAt: Timestamp.now(),
        queue: country,
        estimatedReviewHours: 48,
      });

      // Alert admins
      await db.collection('admin_notifications').add({
        type: 'verification_submitted',
        requestId: context.params.requestId,
        userId: request.userId,
        country,
        regulatoryBody: request.regulatoryBody,
        priority: 'medium',
        isRead: false,
        createdAt: Timestamp.now(),
      });
    } catch (error) {
      functions.logger.error('onVerificationSubmitted error:', error);
    }
  });

/**
 * Check for expiring healthcare licenses — runs daily
 */
export const checkExpiringLicenses = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    try {
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;

      const profilesSnap = await db
        .collection('healthcare_profiles')
        .where('verificationStatus', '==', 'verified')
        .get();

      let notified = 0;

      for (const profileDoc of profilesSnap.docs) {
        const profile = profileDoc.data();
        const licenses = profile.licenses || [];

        for (const license of licenses) {
          if (!license.expiryDate) continue;
          const expiryMs = license.expiryDate.toMillis();
          const msUntilExpiry = expiryMs - now;

          if (msUntilExpiry > 0 && msUntilExpiry <= thirtyDaysMs) {
            // 30-day warning
            await db.collection('notifications').add({
              userId: profile.userId,
              type: 'license_expiring_soon',
              title: 'License Expiring Soon',
              message: `Your ${license.issuingBody} license expires in ${Math.ceil(msUntilExpiry / (24 * 60 * 60 * 1000))} days. Please renew to maintain verified status.`,
              data: { licenseNumber: license.licenseNumber, expiryDate: license.expiryDate },
              isRead: false,
              createdAt: Timestamp.now(),
            });
            notified++;
          } else if (expiryMs < now) {
            // Expired — update status
            const updatedLicenses = licenses.map((l: any) =>
              l.licenseNumber === license.licenseNumber
                ? { ...l, verificationStatus: 'expired' }
                : l
            );

            await profileDoc.ref.update({
              licenses: updatedLicenses,
              verificationStatus: 'expired',
              updatedAt: Timestamp.now(),
            });

            await db.doc(`users/${profile.userId}`).update({
              verificationStatus: 'expired',
              isVerified: false,
              updatedAt: Timestamp.now(),
            });

            await db.collection('notifications').add({
              userId: profile.userId,
              type: 'license_expired',
              title: 'License Expired',
              message: 'Your professional license has expired. Your verified status has been removed until you renew.',
              isRead: false,
              createdAt: Timestamp.now(),
            });
          }
        }
      }

      functions.logger.info(`License check: ${notified} notifications sent`);
    } catch (error) {
      functions.logger.error('checkExpiringLicenses error:', error);
    }
  });

// ============================================================================
// TRUST & SAFETY FUNCTIONS
// ============================================================================

/**
 * On new investigation — auto-assign + provisional action for critical
 */
export const onInvestigationCreated = functions.firestore
  .document('investigations/{investigationId}')
  .onCreate(async (snap, context) => {
    const investigation = snap.data();
    try {
      if (
        investigation.severity === 'critical' ||
        investigation.type === 'child_safety'
      ) {
        // Immediately restrict user
        await db.doc(`users/${investigation.reportedUserId}`).update({
          provisionalRestriction: true,
          provisionalRestrictedAt: Timestamp.now(),
          provisionalRestrictedReason: 'Critical investigation in progress',
        });

        // Alert all super admins
        const adminsSnap = await db
          .collection('admins')
          .where('role', '==', 'super_admin')
          .get();

        for (const adminDoc of adminsSnap.docs) {
          const adminData = adminDoc.data();
          if (adminData.email) {
            await db.collection('admin_notifications').add({
              type: 'critical_investigation',
              investigationId: context.params.investigationId,
              caseNumber: investigation.caseNumber,
              reportedUserId: investigation.reportedUserId,
              priority: 'critical',
              isRead: false,
              createdAt: Timestamp.now(),
            });
          }
        }
      }
    } catch (error) {
      functions.logger.error('onInvestigationCreated error:', error);
    }
  });

/**
 * Recalculate reputation scores daily
 */
export const recalculateReputationScores = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    try {
      const usersSnap = await db.collection('users').limit(5000).get();
      let updated = 0;

      for (const userDoc of usersSnap.docs) {
        const user = userDoc.data();
        const now = Math.floor(Date.now() / 1000);
        const createdAt = user.createdAt?.seconds || now;
        const accountAgeDays = (now - createdAt) / 86400;

        // Get strikes
        const strikesSnap = await db
          .collection('user_strikes')
          .where('userId', '==', userDoc.id)
          .where('isActive', '==', true)
          .get();

        const activeStrikes = strikesSnap.size;
        const reportCount = user.reportCount || 0;
        const isVerified = user.isVerified || false;

        const trustScore = Math.max(
          0,
          Math.min(
            100,
            Math.min(20, (accountAgeDays / 180) * 20) +
              (isVerified ? 20 : 0) +
              Math.min(10, (user.postCount || 0) / 10) -
              Math.min(40, activeStrikes * 10) -
              Math.min(20, reportCount * 5)
          )
        );

        const riskScore = Math.min(
          100,
          activeStrikes * 15 +
            Math.min(30, reportCount * 5) +
            (accountAgeDays < 7 ? 20 : 0)
        );

        await db.doc(`reputation_scores/${userDoc.id}`).set(
          {
            userId: userDoc.id,
            trustScore,
            riskScore,
            lastCalculatedAt: Timestamp.now(),
            nextRecalcAt: Timestamp.fromDate(
              new Date(Date.now() + 86400000)
            ),
          },
          { merge: true }
        );

        updated++;
      }

      functions.logger.info(`Reputation scores updated for ${updated} users`);
    } catch (error) {
      functions.logger.error('recalculateReputationScores error:', error);
    }
  });

// ============================================================================
// AUTOMATION RULE ENGINE TRIGGERS
// ============================================================================

/**
 * On new post — evaluate automation rules
 */
export const onPostCreatedRules = functions.firestore
  .document('posts/{postId}')
  .onCreate(async (snap, context) => {
    const post = snap.data();
    try {
      // Get user reputation
      const repSnap = await db.doc(`reputation_scores/${post.authorId}`).get();
      const rep = repSnap.data();

      const context_data = {
        userId: post.authorId,
        userTrustScore: rep?.trustScore ?? 50,
        riskScore: rep?.riskScore ?? 0,
        postId: context.params.postId,
        contentId: context.params.postId,
      };

      // Get account age
      const userSnap = await db.doc(`users/${post.authorId}`).get();
      const user = userSnap.data();
      if (user?.createdAt) {
        const ageHours = (Date.now() / 1000 - user.createdAt.seconds) / 3600;
        (context_data as any).accountAgeHours = ageHours;
      }

      // Evaluate all POST_CREATED rules
      await evaluateRules('post_created', context_data);
    } catch (error) {
      functions.logger.error('onPostCreatedRules error:', error);
    }
  });

/**
 * On report threshold — evaluate rules
 */
export const onReportThreshold = functions.firestore
  .document('posts/{postId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    const beforeCount = before.reportCount || 0;
    const afterCount = after.reportCount || 0;

    if (afterCount === beforeCount) return; // No change

    const thresholds = [5, 10, 25, 50];
    const crossed = thresholds.find(t => beforeCount < t && afterCount >= t);
    if (!crossed) return;

    await evaluateRules('report_threshold', {
      userId: after.authorId,
      contentId: context.params.postId,
      reportCount: afterCount,
      threshold: crossed,
    });
  });

/**
 * Shared rule evaluation helper
 */
async function evaluateRules(
  trigger: string,
  context_data: Record<string, any>
): Promise<void> {
  const rulesSnap = await db
    .collection('automation_rules')
    .where('trigger', '==', trigger)
    .where('isActive', '==', true)
    .orderBy('priority', 'desc')
    .get();

  for (const ruleDoc of rulesSnap.docs) {
    const rule = ruleDoc.data();
    const conditionsMet = evaluateConditionGroup(rule.conditionGroup, context_data);

    if (!conditionsMet) continue;

    for (const actionConfig of rule.actions || []) {
      await executeRuleAction(actionConfig, context_data);
    }

    await ruleDoc.ref.update({
      'stats.totalExecutions': FieldValue.increment(1),
      'stats.successCount': FieldValue.increment(1),
      'stats.lastExecutedAt': Timestamp.now(),
    });
  }
}

function evaluateConditionGroup(group: any, ctx: Record<string, any>): boolean {
  if (!group?.conditions) return false;
  const results = group.conditions.map((c: any) => evaluateCondition(c, ctx));
  const subResults = (group.groups || []).map((g: any) => evaluateConditionGroup(g, ctx));
  const all = [...results, ...subResults];
  return group.logic === 'AND' ? all.every(r => r) : all.some(r => r);
}

function evaluateCondition(condition: any, ctx: Record<string, any>): boolean {
  const value = condition.field.split('.').reduce((o: any, k: string) => o?.[k], ctx);
  const target = condition.value;
  switch (condition.operator) {
    case '>':  return Number(value) > Number(target);
    case '<':  return Number(value) < Number(target);
    case '>=': return Number(value) >= Number(target);
    case '<=': return Number(value) <= Number(target);
    case '==': return value == target;
    case '!=': return value != target;
    default:   return false;
  }
}

async function executeRuleAction(
  config: { action: string; parameters: any },
  ctx: Record<string, any>
): Promise<void> {
  const userId = ctx.userId as string;
  const { action, parameters } = config;

  switch (action) {
    case 'suspend_account':
      await db.doc(`users/${userId}`).update({
        isSuspended: true,
        suspendedAt: Timestamp.now(),
        suspendedBy: 'automation',
        suspensionReason: parameters.reason || 'Automated suspension',
      });
      break;

    case 'restrict_posting':
      await db.doc(`users/${userId}`).update({
        postingRestricted: true,
        postingRestrictedAt: Timestamp.now(),
        postingRestrictedReason: parameters.reason || 'Automated restriction',
      });
      break;

    case 'require_captcha':
      await db.doc(`users/${userId}`).update({ requiresCaptcha: true });
      break;

    case 'flag_for_review':
      await db.collection('moderation_queue').add({
        userId,
        contentId: ctx.contentId,
        reason: parameters.reason || 'Flagged by rule engine',
        priority: 'high',
        source: 'automation',
        createdAt: Timestamp.now(),
      });
      break;

    case 'notify_admin':
      await db.collection('admin_notifications').add({
        type: 'automation_trigger',
        message: parameters.message || `Rule triggered for ${userId}`,
        userId,
        context: ctx,
        priority: 'medium',
        isRead: false,
        createdAt: Timestamp.now(),
      });
      break;
  }
}

// ============================================================================
// SECURITY FUNCTIONS
// ============================================================================

/**
 * On failed login — detect brute force
 */
export const onFailedLogin = functions.https.onCall(async (data, context) => {
  const { userId, ipAddress } = data;

  try {
    await db.collection('security_events').add({
      type: 'failed_login',
      severity: 'low',
      status: 'open',
      sourceIP: ipAddress,
      userId,
      details: { timestamp: Date.now() },
      autoMitigated: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Count failures in last 15 minutes
    const windowStart = Timestamp.fromDate(new Date(Date.now() - 15 * 60000));
    const eventsSnap = await db
      .collection('security_events')
      .where('type', '==', 'failed_login')
      .where('sourceIP', '==', ipAddress)
      .where('createdAt', '>=', windowStart)
      .get();

    if (eventsSnap.size >= 5) {
      // Lock the account temporarily
      if (userId) {
        await db.doc(`users/${userId}`).update({
          isLocked: true,
          lockedAt: Timestamp.now(),
          lockedReason: 'Too many failed login attempts',
          lockedUntil: Timestamp.fromDate(new Date(Date.now() + 30 * 60000)),
        });
      }

      // Record brute force event
      await db.collection('security_events').add({
        type: 'brute_force',
        severity: 'high',
        status: 'mitigated',
        sourceIP: ipAddress,
        userId,
        details: { attempts: eventsSnap.size },
        autoMitigated: true,
        mitigationAction: `Account locked for 30 minutes`,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }

    return { success: true };
  } catch (error) {
    functions.logger.error('onFailedLogin error:', error);
    return { success: false };
  }
});

// ============================================================================
// EMERGENCY CONTROLS FUNCTIONS
// ============================================================================

/**
 * Auto-deactivate expired emergency controls — runs every 5 minutes
 */
export const expireEmergencyControls = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    try {
      const now = Timestamp.now();
      const snap = await db
        .collection('emergency_controls')
        .where('isActive', '==', true)
        .where('autoDeactivateAt', '<=', now)
        .get();

      const batch = db.batch();
      snap.docs.forEach(d => {
        batch.update(d.ref, {
          isActive: false,
          deactivatedAt: Timestamp.now(),
          deactivatedBy: 'system',
          deactivationReason: 'Auto-deactivated after scheduled duration',
        });
      });

      if (snap.size > 0) {
        await batch.commit();
        functions.logger.info(`Auto-deactivated ${snap.size} emergency controls`);
      }
    } catch (error) {
      functions.logger.error('expireEmergencyControls error:', error);
    }
  });

// ============================================================================
// PLATFORM HEALTH MONITOR
// ============================================================================

/**
 * Record platform health snapshot every 5 minutes
 */
export const recordPlatformHealth = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    try {
      const startTime = Date.now();

      // Quick Firestore read as latency check
      await db.collection('users').limit(1).get();
      const latency = Date.now() - startTime;

      // Count recent errors
      const fiveMinAgo = Timestamp.fromDate(new Date(Date.now() - 5 * 60000));
      const errorEventsSnap = await db
        .collection('security_events')
        .where('createdAt', '>=', fiveMinAgo)
        .get();

      // Count active users (online in last 5 minutes)
      const activeUsersSnap = await db
        .collection('users')
        .where('lastSeenAt', '>=', fiveMinAgo)
        .get();

      const healthStatus = latency < 1000 ? 'healthy' : latency < 3000 ? 'degraded' : 'down';

      const snapshot = {
        overallStatus: healthStatus,
        services: {
          database: { service: 'database', status: healthStatus, latency, checkedAt: Timestamp.now() },
          api: { service: 'api', status: 'healthy', latency: latency * 1.1, checkedAt: Timestamp.now() },
        },
        metrics: {
          requestsPerMinute: errorEventsSnap.size * 10,
          avgLatencyMs: latency,
          errorRate: Math.min(100, errorEventsSnap.size * 0.5),
          activeUsers: activeUsersSnap.size,
          dbReads: 0,
          dbWrites: 0,
          storageUsedPercent: 0,
        },
        activeIncidents: [],
        recordedAt: Timestamp.now(),
      };

      await db.collection('platform_health').add(snapshot);

      // Alert if degraded
      if (latency > 3000) {
        await db.collection('admin_notifications').add({
          type: 'health_alert',
          title: 'High Database Latency',
          message: `Database latency is ${latency}ms — exceeds 3000ms threshold`,
          priority: 'critical',
          isRead: false,
          createdAt: Timestamp.now(),
        });
      }

      // Prune old health snapshots (keep 48h)
      const twoDaysAgo = Timestamp.fromDate(new Date(Date.now() - 48 * 3600000));
      const oldSnaps = await db
        .collection('platform_health')
        .where('recordedAt', '<', twoDaysAgo)
        .limit(100)
        .get();

      const pruneBatch = db.batch();
      oldSnaps.docs.forEach(d => pruneBatch.delete(d.ref));
      if (oldSnaps.size > 0) await pruneBatch.commit();
    } catch (error) {
      functions.logger.error('recordPlatformHealth error:', error);
    }
  });

// ============================================================================
// LEGAL & POLICY FUNCTIONS
// ============================================================================

/**
 * Auto-publish scheduled policies
 */
export const publishScheduledPolicies = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    try {
      const now = Timestamp.now();
      const snap = await db
        .collection('legal_policies')
        .where('status', '==', 'scheduled')
        .where('scheduledAt', '<=', now)
        .get();

      for (const policyDoc of snap.docs) {
        const policy = policyDoc.data();

        // Archive existing published version
        const existingSnap = await db
          .collection('legal_policies')
          .where('type', '==', policy.type)
          .where('status', '==', 'published')
          .get();

        const batch = db.batch();
        existingSnap.docs.forEach(d => batch.update(d.ref, { status: 'archived' }));
        batch.update(policyDoc.ref, {
          status: 'published',
          publishedAt: Timestamp.now(),
        });
        await batch.commit();

        functions.logger.info(`Published policy: ${policy.type} v${policy.version}`);
      }
    } catch (error) {
      functions.logger.error('publishScheduledPolicies error:', error);
    }
  });

// ============================================================================
// SUPPORT SLA FUNCTIONS
// ============================================================================

/**
 * Check SLA breaches every 30 minutes
 */
export const checkSLABreaches = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async () => {
    try {
      const now = Timestamp.now();
      const openTicketsSnap = await db
        .collection('support_tickets')
        .where('status', 'in', ['open', 'assigned', 'in_progress'])
        .get();

      let breached = 0;
      const batch = db.batch();

      for (const ticketDoc of openTicketsSnap.docs) {
        const ticket = ticketDoc.data();
        const responseDeadline = ticket.sla?.responseDeadline;
        const resolutionDeadline = ticket.sla?.resolutionDeadline;

        let isSLABreached = false;

        if (!ticket.sla?.firstResponseAt && responseDeadline && responseDeadline <= now) {
          isSLABreached = true;
        }
        if (!ticket.sla?.resolvedAt && resolutionDeadline && resolutionDeadline <= now) {
          isSLABreached = true;
        }

        if (isSLABreached && !ticket.sla?.breached) {
          batch.update(ticketDoc.ref, {
            'sla.breached': true,
            priority: ticket.priority === 'low' ? 'medium' : ticket.priority,
          });

          await db.collection('admin_notifications').add({
            type: 'sla_breach',
            ticketId: ticketDoc.id,
            ticketNumber: ticket.ticketNumber,
            priority: 'high',
            isRead: false,
            createdAt: Timestamp.now(),
          });
          breached++;
        }
      }

      if (breached > 0) await batch.commit();
      functions.logger.info(`SLA check: ${breached} breaches found`);
    } catch (error) {
      functions.logger.error('checkSLABreaches error:', error);
    }
  });

// ============================================================================
// AUDIT LOG ARCHIVAL
// ============================================================================

/**
 * Archive old audit logs — runs weekly
 */
export const archiveAuditLogs = functions.pubsub
  .schedule('every monday 02:00')
  .onRun(async () => {
    try {
      const retentionDays = 90; // Keep 90 days hot, rest archived
      const cutoff = Timestamp.fromDate(
        new Date(Date.now() - retentionDays * 86400000)
      );

      const oldLogsSnap = await db
        .collection('audit_logs')
        .where('timestamp', '<', cutoff)
        .limit(5000)
        .get();

      if (oldLogsSnap.empty) return;

      const batch = db.batch();
      oldLogsSnap.docs.forEach(d => {
        batch.set(db.doc(`audit_logs_archive/${d.id}`), d.data());
      });

      await batch.commit();
      functions.logger.info(`Archived ${oldLogsSnap.size} audit log entries`);
    } catch (error) {
      functions.logger.error('archiveAuditLogs error:', error);
    }
  });
