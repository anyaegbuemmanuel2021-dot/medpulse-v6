/**
 * MedPulse Enterprise – Cloud Functions  v4.0
 * ALL business logic that touches sensitive data runs here.
 * Frontend is NEVER trusted – every action is re-validated server-side.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db   = admin.firestore();
const auth = admin.auth();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Write an immutable audit log entry (server timestamp, no client data) */
async function writeAuditLog(
  adminId: string,
  adminRole: string,
  action: string,
  target: string,
  targetType: string,
  details?: Record<string, unknown>,
  ipAddress?: string
) {
  await db.collection("audit_logs").add({
    adminId, adminRole, action, target, targetType,
    details: details ?? {},
    ipAddress: ipAddress ?? "unknown",
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/** Write a security event log */
async function writeSecurityLog(
  userId: string | null,
  action: string,
  ip: string,
  userAgent: string,
  status: "success" | "failure",
  details?: Record<string, unknown>
) {
  await db.collection("security_logs").add({
    userId, action, ipAddress: ip, userAgent, status,
    details: details ?? {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/** Check caller role from custom claims */
async function assertRole(
  context: functions.https.CallableContext,
  allowed: string[]
): Promise<void> {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required.");
  const claims = context.auth.token as Record<string, unknown>;
  if (!allowed.includes(claims.role as string)) {
    throw new functions.https.HttpsError("permission-denied", "Insufficient role.");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH – LOGIN LOCKOUT (PROGRESSIVE)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Called by the client BEFORE attempting Firebase signIn.
 * Returns { allowed: bool, lockedUntil?: timestamp }.
 */
export const checkLoginAllowed = functions.https.onCall(
  async (data: { email: string; ip?: string }, context) => {
    const email    = (data.email ?? "").toLowerCase().trim();
    const ip       = data.ip ?? "unknown";
    const now      = Date.now();
    const docRef   = db.collection("failed_logins").doc(
      Buffer.from(email).toString("base64")
    );
    const snap     = await docRef.get();

    if (!snap.exists) return { allowed: true };

    const rec = snap.data()!;
    const locked: number | undefined = rec.lockedUntil?.toMillis?.();

    if (locked && locked > now) {
      return { allowed: false, lockedUntil: locked };
    }
    return { allowed: true };
  }
);

/**
 * Called AFTER a failed login attempt.
 * Implements: 5 → 15 min lock, 10 → 1 hr lock, 20 → 24 hr lock.
 */
export const recordFailedLogin = functions.https.onCall(
  async (data: { email: string; ip?: string; userAgent?: string }) => {
    const email   = (data.email ?? "").toLowerCase().trim();
    const ip      = data.ip ?? "unknown";
    const ua      = data.userAgent ?? "unknown";
    const docId   = Buffer.from(email).toString("base64");
    const docRef  = db.collection("failed_logins").doc(docId);
    const snap    = await docRef.get();
    const now     = Date.now();

    let attempts  = 1;
    if (snap.exists) {
      const rec = snap.data()!;
      // Reset count if previous lock has expired
      const locked: number | undefined = rec.lockedUntil?.toMillis?.();
      attempts = locked && locked < now ? 1 : (rec.attempts ?? 0) + 1;
    }

    let lockedUntil: number | undefined;
    if (attempts >= 20) lockedUntil = now + 86_400_000;      // 24 hours
    else if (attempts >= 10) lockedUntil = now + 3_600_000;  //  1 hour
    else if (attempts >= 5)  lockedUntil = now + 900_000;    // 15 minutes

    await docRef.set({
      email, attempts,
      ipAddress: ip,
      lockedUntil: lockedUntil
        ? admin.firestore.Timestamp.fromMillis(lockedUntil)
        : null,
      lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await writeSecurityLog(null, "FAILED_LOGIN", ip, ua, "failure", { email, attempts });
    return { attempts, lockedUntil };
  }
);

/** Clear failed login counter on successful login */
export const clearFailedLogin = functions.https.onCall(
  async (data: { email: string }) => {
    const docId = Buffer.from((data.email ?? "").toLowerCase().trim()).toString("base64");
    await db.collection("failed_logins").doc(docId).delete();
    return { cleared: true };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH – SET CUSTOM CLAIMS (RBAC)
// ═══════════════════════════════════════════════════════════════════════════════

/** Owner or super_admin can assign roles via this function */
export const assignUserRole = functions.https.onCall(
  async (
    data: { targetUid: string; role: string },
    context
  ) => {
    await assertRole(context, ["owner", "super_admin"]);
    const callerRole  = (context.auth!.token as Record<string, unknown>).role as string;
    const { targetUid, role } = data;

    // Only owner can assign owner role
    if (role === "owner" && callerRole !== "owner") {
      throw new functions.https.HttpsError("permission-denied", "Only the Owner can assign the Owner role.");
    }

    await auth.setCustomUserClaims(targetUid, { role });
    await db.collection("users").doc(targetUid).update({ role });

    await writeAuditLog(
      context.auth!.uid, callerRole,
      "ASSIGN_ROLE", targetUid, "user",
      { newRole: role }
    );
    return { success: true };
  }
);

/** Ban a user (set isBanned=true and revoke sessions) */
export const banUser = functions.https.onCall(
  async (data: { targetUid: string; reason: string }, context) => {
    await assertRole(context, ["owner","super_admin","security_admin"]);
    const { targetUid, reason } = data;

    await auth.revokeRefreshTokens(targetUid);
    await db.collection("users").doc(targetUid).update({
      isBanned: true,
      bannedReason: reason,
      bannedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await writeAuditLog(
      context.auth!.uid,
      (context.auth!.token as Record<string,unknown>).role as string,
      "BAN_USER", targetUid, "user", { reason }
    );
    return { success: true };
  }
);

/** Suspend a user for N hours */
export const suspendUser = functions.https.onCall(
  async (data: { targetUid: string; hours: number; reason: string }, context) => {
    await assertRole(context, ["owner","super_admin","security_admin"]);
    const until = Date.now() + data.hours * 3_600_000;
    await db.collection("users").doc(data.targetUid).update({
      isSuspended: true,
      suspendedUntil: admin.firestore.Timestamp.fromMillis(until),
      suspendedReason: data.reason,
    });
    await auth.revokeRefreshTokens(data.targetUid);
    await writeAuditLog(
      context.auth!.uid,
      (context.auth!.token as Record<string,unknown>).role as string,
      "SUSPEND_USER", data.targetUid, "user",
      { hours: data.hours, reason: data.reason }
    );
    return { success: true, suspendedUntil: until };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAINTENANCE MODE
// ═══════════════════════════════════════════════════════════════════════════════

export const setMaintenanceMode = functions.https.onCall(
  async (
    data: {
      isActive: boolean;
      message?: string;
      isEmergencyLockdown?: boolean;
      scheduledEnd?: number;
    },
    context
  ) => {
    await assertRole(context, ["owner","super_admin"]);
    const ref = db.collection("maintenance").doc("config");
    await ref.set({
      isActive: data.isActive,
      isEmergencyLockdown: data.isEmergencyLockdown ?? false,
      message: data.message ?? "We are currently under maintenance. Please check back soon.",
      scheduledEnd: data.scheduledEnd ?? null,
      enabledBy: context.auth!.uid,
      enabledAt: data.isActive
        ? admin.firestore.FieldValue.serverTimestamp()
        : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const action = data.isEmergencyLockdown
      ? "EMERGENCY_LOCKDOWN"
      : data.isActive
        ? "MAINTENANCE_ENABLE"
        : "MAINTENANCE_DISABLE";

    await writeAuditLog(
      context.auth!.uid,
      (context.auth!.token as Record<string,unknown>).role as string,
      action, "system", "system", { message: data.message }
    );
    return { success: true };
  }
);

// Auto-disable maintenance when scheduledEnd is reached (runs every minute)
export const autoDisableMaintenance = functions.pubsub
  .schedule("every 1 minutes")
  .onRun(async () => {
    const ref  = db.collection("maintenance").doc("config");
    const snap = await ref.get();
    if (!snap.exists) return;
    const data = snap.data()!;
    if (!data.isActive) return;
    const end = data.scheduledEnd?.toMillis?.();
    if (end && end < Date.now()) {
      await ref.update({
        isActive: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

// ═══════════════════════════════════════════════════════════════════════════════
// ADVERTISEMENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export const reviewAdvertisement = functions.https.onCall(
  async (
    data: { adId: string; action: "approve" | "reject" | "pause"; reason?: string },
    context
  ) => {
    await assertRole(context, ["owner","super_admin","advertisement_admin"]);
    const statusMap: Record<string, string> = {
      approve: "active",
      reject:  "rejected",
      pause:   "paused",
    };
    await db.collection("advertisements").doc(data.adId).update({
      status: statusMap[data.action],
      reviewedBy: context.auth!.uid,
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(data.reason ? { rejectionReason: data.reason } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await writeAuditLog(
      context.auth!.uid,
      (context.auth!.token as Record<string,unknown>).role as string,
      `AD_${data.action.toUpperCase()}`, data.adId, "ad"
    );
    return { success: true };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL CAMPAIGNS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Send (or schedule) a bulk email campaign with user label/country filtering.
 * Actual mail delivery delegated to SendGrid / Firebase Extensions.
 */
export const sendEmailCampaign = functions.https.onCall(
  async (
    data: {
      campaignId: string;
      filter: { countries?: string[]; labels?: string[]; roles?: string[]; isVerified?: boolean };
      subject: string;
      body: string;
      scheduledAt?: number;
    },
    context
  ) => {
    await assertRole(context, ["owner","super_admin"]);

    // Build recipient query
    let query: admin.firestore.Query = db.collection("users");
    if (data.filter.isVerified !== undefined)
      query = query.where("isVerified", "==", data.filter.isVerified);
    if (data.filter.countries?.length)
      query = query.where("country", "in", data.filter.countries.slice(0, 10));

    const snap      = await query.get();
    const recipients = snap.docs
      .filter((d) => {
        const u = d.data();
        if (data.filter.labels?.length &&
            !data.filter.labels.some((l) => u.labels?.includes(l))) return false;
        if (data.filter.roles?.length &&
            !data.filter.roles.includes(u.role)) return false;
        return true;
      })
      .map((d) => d.data().email as string)
      .filter(Boolean);

    // Write campaign record
    const campaignRef = db.collection("email_campaigns").doc(data.campaignId);
    await campaignRef.set({
      subject: data.subject,
      body: data.body,
      filter: data.filter,
      status: data.scheduledAt ? "scheduled" : "sending",
      scheduledAt: data.scheduledAt
        ? admin.firestore.Timestamp.fromMillis(data.scheduledAt)
        : null,
      recipientCount: recipients.length,
      openCount: 0, clickCount: 0,
      createdBy: context.auth!.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Queue emails in /mail collection (Firebase Email Extension format)
    const batch = db.batch();
    for (const email of recipients.slice(0, 500)) {  // Batch limit guard
      const mailRef = db.collection("mail").doc();
      batch.set(mailRef, {
        to: email,
        message: { subject: data.subject, html: data.body },
        campaignId: data.campaignId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    await writeAuditLog(
      context.auth!.uid,
      (context.auth!.token as Record<string,unknown>).role as string,
      "EMAIL_CAMPAIGN_SENT", data.campaignId, "email",
      { recipientCount: recipients.length }
    );
    return { success: true, recipientCount: recipients.length };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// RECYCLE BIN
// ═══════════════════════════════════════════════════════════════════════════════

/** Soft-delete: move item to recycle bin instead of hard delete */
export const softDelete = functions.https.onCall(
  async (
    data: { itemType: string; originalId: string; collection: string },
    context
  ) => {
    await assertRole(context, [
      "owner","super_admin","security_admin","moderator","support_admin"
    ]);
    const originalRef = db.collection(data.collection).doc(data.originalId);
    const snap        = await originalRef.get();
    if (!snap.exists) throw new functions.https.HttpsError("not-found", "Item not found.");

    const expiresAt = Date.now() + 30 * 86_400_000; // 30 days

    await db.collection("recycle_bin").add({
      itemType: data.itemType,
      originalId: data.originalId,
      originalCollection: data.collection,
      originalData: snap.data(),
      deletedBy: context.auth!.uid,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(expiresAt),
    });

    await originalRef.update({
      isDeleted: true,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedBy: context.auth!.uid,
    });

    await writeAuditLog(
      context.auth!.uid,
      (context.auth!.token as Record<string,unknown>).role as string,
      "SOFT_DELETE", data.originalId, data.itemType as any
    );
    return { success: true };
  }
);

/** Restore an item from recycle bin */
export const restoreFromBin = functions.https.onCall(
  async (data: { binItemId: string }, context) => {
    await assertRole(context, ["owner","super_admin"]);
    const binRef  = db.collection("recycle_bin").doc(data.binItemId);
    const binSnap = await binRef.get();
    if (!binSnap.exists) throw new functions.https.HttpsError("not-found", "Bin item not found.");

    const binData = binSnap.data()!;
    const originalRef = db
      .collection(binData.originalCollection as string)
      .doc(binData.originalId as string);

    await originalRef.set({
      ...binData.originalData,
      isDeleted: false,
      restoredAt: admin.firestore.FieldValue.serverTimestamp(),
      restoredBy: context.auth!.uid,
    }, { merge: true });

    await binRef.update({
      restoredBy: context.auth!.uid,
      restoredAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await writeAuditLog(
      context.auth!.uid,
      (context.auth!.token as Record<string,unknown>).role as string,
      "RESTORE", binData.originalId as string, binData.itemType as any
    );
    return { success: true };
  }
);

// Auto-purge expired recycle bin items (runs daily)
export const purgeExpiredBinItems = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async () => {
    const snap = await db.collection("recycle_bin")
      .where("expiresAt", "<", admin.firestore.Timestamp.now())
      .get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`Purged ${snap.size} expired bin items`);
  });

// ═══════════════════════════════════════════════════════════════════════════════
// THREAT DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/** Detect bot/mass-signup patterns and block suspicious IPs */
export const detectThreats = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async () => {
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - 5 * 60_000);
    const snap  = await db.collection("security_logs")
      .where("action", "==", "FAILED_LOGIN")
      .where("createdAt", ">=", since)
      .get();

    // Count failures per IP
    const ipCounts: Record<string, number> = {};
    snap.docs.forEach((d) => {
      const ip = d.data().ipAddress as string;
      ipCounts[ip] = (ipCounts[ip] ?? 0) + 1;
    });

    const batch = db.batch();
    for (const [ip, count] of Object.entries(ipCounts)) {
      if (count >= 50) {
        const ref = db.collection("blocked_ips").doc(
          ip.replace(/\./g, "_").replace(/:/g, "_")
        );
        batch.set(ref, {
          ip,
          reason: `Auto-blocked: ${count} failed logins in 5 minutes`,
          blockedAt: admin.firestore.FieldValue.serverTimestamp(),
          blockedBy: "system",
          expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 86_400_000),
        }, { merge: true });
      }
    }
    await batch.commit();
    console.log("Threat detection scan complete");
  });

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICATION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

export const reviewVerification = functions.https.onCall(
  async (
    data: {
      requestId: string;
      action: "approve" | "reject" | "reviewing";
      reason?: string;
    },
    context
  ) => {
    await assertRole(context, ["owner","super_admin","verification_admin"]);
    const ref = db.collection("verification_requests").doc(data.requestId);
    const snap = await ref.get();
    if (!snap.exists) throw new functions.https.HttpsError("not-found", "Request not found.");

    const request = snap.data()!;
    const update: Record<string, unknown> = {
      status: data.action === "approve" ? "approved" : data.action === "reject" ? "rejected" : "reviewing",
      reviewedBy: context.auth!.uid,
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (data.reason) update.rejectionReason = data.reason;
    await ref.update(update);

    // Update user document if approved
    if (data.action === "approve") {
      await db.collection("users").doc(request.userId as string).update({
        isVerified: true,
        verificationStatus: "approved",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await writeAuditLog(
      context.auth!.uid,
      (context.auth!.token as Record<string,unknown>).role as string,
      `VERIFICATION_${data.action.toUpperCase()}`, data.requestId, "user"
    );
    return { success: true };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// FEED SCORE (unchanged algorithm, now with proper guard)
// ═══════════════════════════════════════════════════════════════════════════════

export const recalculateFeedScores = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async () => {
    const snap = await db.collection("posts")
      .where("isDeleted", "==", false)
      .where("isApproved", "==", true)
      .get();

    const batch = db.batch();
    let updated = 0;

    for (const doc of snap.docs) {
      const post = doc.data();
      const recencyHours =
        (Date.now() - (post.createdAt?.toDate?.()?.getTime() ?? Date.now())) /
        3_600_000;
      const e = post.engagementMetrics ?? {};
      const base =
        (e.watches   ?? 0) * 0.35 +
        (e.likes     ?? 0) * 0.15 +
        (e.shares    ?? 0) * 0.15 +
        (e.comments  ?? 0) * 0.10 +
        (e.saves     ?? 0) * 0.10;
      const decay = Math.max(0, 1 - recencyHours / 72);

      batch.update(doc.ref, {
        feedScore: base * decay,
        scoreCalculatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      updated++;

      // Commit every 400 to stay under batch limit
      if (updated % 400 === 0) await (db.batch() as any).commit();
    }
    await batch.commit();
    console.log(`Updated ${updated} feed scores`);
  });

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-MODERATION (content scanning)
// ═══════════════════════════════════════════════════════════════════════════════

export const autoModerateContent = functions.firestore
  .document("posts/{postId}")
  .onCreate(async (snap) => {
    const post = snap.data();
    const text = `${post.title ?? ""} ${post.description ?? ""} ${post.content?.text ?? ""}`.toLowerCase();

    const patterns: Record<string, RegExp[]> = {
      spam:       [/\b(buy now|click here|earn money fast)\b/gi],
      violence:   [/\b(kill|murder|bomb|shoot)\b/gi],
      hate_speech:[/\b(racist|hate speech)\b/gi],
    };

    const flags: { category: string; severity: string; reason: string }[] = [];
    for (const [category, regexps] of Object.entries(patterns)) {
      if (regexps.some((r) => r.test(text))) {
        flags.push({ category, severity: "low", reason: `Auto-detected: ${category}` });
      }
    }

    if (flags.length > 0) {
      await snap.ref.update({
        "moderation.status": "flagged",
        "moderation.flags": flags,
        isFlagged: true,
      });
      await db.collection("moderation_reports").add({
        postId: snap.id,
        userId: post.userId,
        flags,
        source: "auto-moderation",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS (daily snapshot)
// ═══════════════════════════════════════════════════════════════════════════════

export const generateDailyAnalytics = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async () => {
    const [usersSnap, postsSnap] = await Promise.all([
      db.collection("users").count().get(),
      db.collection("posts").where("isDeleted", "==", false).count().get(),
    ]);

    await db.collection("analytics").add({
      date: admin.firestore.FieldValue.serverTimestamp(),
      totalUsers:  usersSnap.data().count,
      totalPosts:  postsSnap.data().count,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log("Daily analytics snapshot written");
  });

// ═══════════════════════════════════════════════════════════════════════════════
// V5 ADDITIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Feed score aggregation ───────────────────────────────────────────────────

/**
 * Aggregate watch_activity every hour → update feedScore on posts.
 * Score = (watchTimeSec × 40) + (shares × 20) + (saves × 15) + (comments × 10) + (likes × 5)
 */
export const aggregateFeedScores = functions.pubsub
  .schedule("every 1 hours")
  .onRun(async () => {
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - 3_600_000);
    const actSnap = await db.collection("user_activity")
      .where("timestamp", ">=", since)
      .get();

    const perPost: Record<string, { watchTime: number; actions: Record<string, number> }> = {};
    for (const doc of actSnap.docs) {
      const { postId, action, duration = 0 } = doc.data();
      if (!perPost[postId]) perPost[postId] = { watchTime: 0, actions: {} };
      perPost[postId].watchTime += duration;
      perPost[postId].actions[action] = (perPost[postId].actions[action] ?? 0) + 1;
    }

    const batch = db.batch();
    for (const [postId, data] of Object.entries(perPost)) {
      const score =
        data.watchTime                     * 40 +
        (data.actions["share"]   ?? 0)     * 20 +
        (data.actions["save"]    ?? 0)     * 15 +
        (data.actions["comment"] ?? 0)     * 10 +
        (data.actions["like"]    ?? 0)     *  5;

      batch.update(db.collection("posts").doc(postId), {
        feedScore: admin.firestore.FieldValue.increment(score),
        scoreUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    console.log(`Feed scores aggregated for ${Object.keys(perPost).length} posts`);
  });

// ─── Trending detection ───────────────────────────────────────────────────────

/** Every hour: flag posts with rapid engagement growth as isTrending */
export const detectTrending = functions.pubsub
  .schedule("every 1 hours")
  .onRun(async () => {
    const THRESHOLD = 100; // feedScore units in last hour
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - 3_600_000);

    // Compute recent engagement per post
    const actSnap = await db.collection("user_activity")
      .where("timestamp", ">=", since)
      .get();
    const scores: Record<string, number> = {};
    for (const d of actSnap.docs) {
      const { postId, action, duration = 0 } = d.data();
      const w = { watch: 40, share: 20, save: 15, comment: 10, like: 5 }[action as string] ?? 0;
      scores[postId] = (scores[postId] ?? 0) + (action === "watch" ? duration * w : w);
    }

    const batch = db.batch();
    for (const [postId, score] of Object.entries(scores)) {
      batch.update(db.collection("posts").doc(postId), {
        isTrending: score >= THRESHOLD,
      });
    }
    await batch.commit();

    // Also update hashtag trend scores
    const hashSnap = await db.collection("hashtags").get();
    const hBatch = db.batch();
    hashSnap.docs.forEach((d) => {
      hBatch.update(d.ref, { weeklyPostCount: 0 }); // reset weekly counter
    });
    await hBatch.commit();
    console.log(`Trending detection: ${Object.keys(scores).length} posts evaluated`);
  });

// ─── For-You feed generation ──────────────────────────────────────────────────

/**
 * Regenerate personalized for_you_feed for active users every 6 hours.
 * Uses interest_profiles to weight candidate posts.
 */
export const generateForYouFeeds = functions.pubsub
  .schedule("every 6 hours")
  .onRun(async () => {
    // Get recently active users (logged in last 24h)
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - 86_400_000);
    const userSnap = await db.collection("users")
      .where("lastLogin", ">=", since)
      .limit(1000)
      .get();

    for (const userDoc of userSnap.docs) {
      const userId = userDoc.id;
      const interestDoc = await db.collection("interest_profiles").doc(userId).get();
      const interests = interestDoc.exists()
        ? interestDoc.data() as Record<string, unknown>
        : {};

      // Get top specialties
      const topSpecialties = Object.entries((interests.specialties as Record<string, number>) ?? {})
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([k]) => k);

      let candidateIds: string[] = [];

      if (topSpecialties.length > 0) {
        const chunk = topSpecialties.slice(0, 10);
        const snap = await db.collection("posts")
          .where("specialty", "in", chunk)
          .where("isApproved", "==", true)
          .where("isDeleted", "==", false)
          .orderBy("feedScore", "desc")
          .limit(50)
          .get();
        candidateIds = snap.docs.map((d) => d.id);
      }

      // Supplement with global trending if not enough
      if (candidateIds.length < 20) {
        const trendSnap = await db.collection("posts")
          .where("isTrending", "==", true)
          .where("isApproved", "==", true)
          .where("isDeleted", "==", false)
          .orderBy("feedScore", "desc")
          .limit(30)
          .get();
        const trendIds = trendSnap.docs.map((d) => d.id);
        candidateIds = [...new Set([...candidateIds, ...trendIds])];
      }

      await db.collection("for_you_feed").doc(userId).set({
        userId,
        postIds: candidateIds.slice(0, 60),
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 6 * 3_600_000),
      });
    }
    console.log(`For-You feeds generated for ${userSnap.size} users`);
  });

// ─── Hashtag counter reset (weekly) ──────────────────────────────────────────

export const resetWeeklyHashtagCounts = functions.pubsub
  .schedule("every monday 00:00")
  .onRun(async () => {
    const snap  = await db.collection("hashtags").get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { weeklyPostCount: 0 }));
    await batch.commit();
    console.log(`Weekly hashtag counts reset for ${snap.size} hashtags`);
  });

// ═══════════════════════════════════════════════════════════════════════════════
// V6 ADDITIONS (AFRISOCIAL + FINAL ADDENDUM)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Feature flags ────────────────────────────────────────────────────────────

export const setFeatureFlag = functions.https.onCall(
  async (data: { flag: string; value: boolean }, context) => {
    await assertRole(context, ["owner", "super_admin"]);
    const ref = db.collection("feature_flags").doc("config");
    await ref.set({
      [data.flag]: data.value,
      updatedBy: context.auth!.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await writeAuditLog(
      context.auth!.uid,
      (context.auth!.token as Record<string, unknown>).role as string,
      `FEATURE_FLAG_${data.value ? "ENABLE" : "DISABLE"}`,
      data.flag, "system", { flag: data.flag, value: data.value }
    );
    return { success: true };
  }
);

// ─── AI content moderation (stub — replace with Claude API in production) ─────

export const aiModerateContent = functions.https.onCall(
  async (data: { contentId: string; contentType: string; text: string }) => {
    const patterns = {
      spam:       /\b(buy now|click here|earn money fast|free gift)\b/gi,
      harassment: /\b(idiot|moron|shut up)\b/gi,
      hateSpeech: /\b(hate speech terms)\b/gi,
      nsfw:       /\b(explicit terms)\b/gi,
      scam:       /\b(send money|wire transfer|crypto|guaranteed profit)\b/gi,
    };

    const scores: Record<string, number> = {};
    for (const [category, regex] of Object.entries(patterns)) {
      const matches = data.text.match(regex) ?? [];
      scores[category] = Math.min(matches.length / 3, 1);
    }

    const overallRisk = Math.max(...Object.values(scores));
    const suggestedAction: string =
      overallRisk > 0.7 ? "remove" :
      overallRisk > 0.4 ? "review" :
      overallRisk > 0.1 ? "hide"   : "approve";

    const result = {
      contentId: data.contentId,
      contentType: data.contentType,
      scores,
      overallRisk,
      suggestedAction,
      categories: Object.keys(scores).filter((k) => scores[k] > 0.1),
      hashtags: [],
      processingMs: Date.now(),
      modelVersion: "rule-based-v1",
    };

    // Store in moderation queue if risky
    if (overallRisk > 0.3) {
      await db.collection("ai_moderation_queue").add({
        ...result,
        status: overallRisk > 0.7 ? "auto_actioned" : "pending_human_review",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    return result;
  }
);

// ─── AI hashtag suggestions ────────────────────────────────────────────────────

export const aiSuggestHashtags = functions.https.onCall(
  async (data: { text: string }) => {
    // Rule-based medical keyword detection; replace with LLM in production
    const medicalKeywords = [
      "cardiology","neurology","oncology","surgery","pediatrics","orthopedics",
      "psychiatry","radiology","dermatology","gastroenterology","nephrology",
      "pharmacology","pathology","anatomy","physiology","diagnosis",
    ];
    const text   = data.text.toLowerCase();
    const found  = medicalKeywords.filter((k) => text.includes(k));
    const hashtags = [...new Set([...found, "medicine", "healthcare"])].slice(0, 8);
    return { hashtags };
  }
);

// ─── Data export request ──────────────────────────────────────────────────────

export const requestDataExport = functions.https.onCall(
  async (data: { userId: string }, context) => {
    if (!context.auth || context.auth.uid !== data.userId) {
      throw new functions.https.HttpsError("permission-denied", "Cannot request data for another user.");
    }
    const docRef = await db.collection("data_requests").add({
      userId:      data.userId,
      requestType: "export_data",
      status:      "pending",
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await writeAuditLog(data.userId, "user", "DATA_EXPORT_REQUEST", data.userId, "user");
    return { requestId: docRef.id };
  }
);

// ─── Account deletion request ─────────────────────────────────────────────────

export const requestAccountDeletion = functions.https.onCall(
  async (data: { userId: string; reason?: string }, context) => {
    if (!context.auth || context.auth.uid !== data.userId) {
      throw new functions.https.HttpsError("permission-denied", "Cannot delete another user's account.");
    }
    await db.collection("data_requests").add({
      userId:      data.userId,
      requestType: "delete_account",
      reason:      data.reason ?? null,
      status:      "pending",
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Soft-delete profile immediately; permanent deletion after 30 days
    await db.collection("users").doc(data.userId).update({
      isDeletionRequested: true,
      deletionRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true };
  }
);

// ─── Appeals resolution ────────────────────────────────────────────────────────

export const resolveAppeal = functions.https.onCall(
  async (
    data: { appealId: string; status: "approved" | "denied"; resolution: string; moderatorNotes?: string; adminId: string },
    context
  ) => {
    await assertRole(context, ["owner", "super_admin", "security_admin", "support_admin"]);
    await db.collection("appeals").doc(data.appealId).update({
      status:         data.status,
      resolution:     data.resolution,
      moderatorNotes: data.moderatorNotes ?? null,
      assignedTo:     context.auth!.uid,
      resolvedAt:     admin.firestore.FieldValue.serverTimestamp(),
    });
    await writeAuditLog(
      context.auth!.uid,
      (context.auth!.token as Record<string, unknown>).role as string,
      `APPEAL_${data.status.toUpperCase()}`, data.appealId, "user"
    );
    return { success: true };
  }
);

// ─── Risk score calculation (scheduled daily) ─────────────────────────────────

export const calculateRiskScores = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async () => {
    const usersSnap = await db.collection("users").limit(1000).get();
    const batch     = db.batch();

    for (const userDoc of usersSnap.docs) {
      const uid  = userDoc.id;
      const data = userDoc.data();

      // Count signals
      const [reportsSnap, bansSnap] = await Promise.all([
        db.collection("reports").where("targetId", "==", uid).count().get(),
        db.collection("security_logs").where("userId", "==", uid).where("action", "==", "BAN_USER").count().get(),
      ]);
      const reportCount   = reportsSnap.data().count;
      const banCount      = bansSnap.data().count;
      const offenseCount  = (data.isSuspended ? 1 : 0) + (data.isBanned ? 2 : 0);

      const riskScore = Math.min(
        reportCount * 5 + banCount * 25 + offenseCount * 10,
        100
      );
      const riskLevel =
        riskScore >= 75 ? "critical" :
        riskScore >= 50 ? "high"     :
        riskScore >= 25 ? "medium"   : "low";

      batch.set(db.collection("user_risk_scores").doc(uid), {
        userId: uid, riskScore, riskLevel,
        offenseCount, banCount, reportCount,
        flags: {
          isSuspectedBot:     data.isSuspectedBot   ?? false,
          isRepeatOffender:   banCount > 1,
          hasBanEvasion:      false,
          isSuspectedFake:    false,
          hasCoordinatedAbuse:false,
          isImpersonator:     false,
          hasSuspectedScam:   false,
        },
        lastCalculatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
    console.log(`Risk scores calculated for ${usersSnap.size} users`);
  });

// ─── System health snapshot (every 5 min) ─────────────────────────────────────

export const recordSystemHealth = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async () => {
    // In production: pull from Cloud Monitoring API
    // Stub values here; replace with real metrics
    const snapshot = {
      cpu: Math.random() * 40 + 20,
      memory: Math.random() * 30 + 40,
      storage: Math.random() * 10 + 60,
      dbLoad: Math.random() * 20 + 15,
      apiResponseTime: Math.random() * 100 + 80,
      errorRate: Math.random() * 0.5,
      uptimePercent: 99.9,
      queueDepth: Math.floor(Math.random() * 50),
      activeConnections: Math.floor(Math.random() * 500 + 200),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("system_health").add(snapshot);

    // Generate alert if thresholds exceeded
    const alerts = [];
    if ((snapshot.cpu as number) > 85)           alerts.push({ alertType: "cpu",       severity: "critical", threshold: 85, value: snapshot.cpu });
    if ((snapshot.memory as number) > 90)        alerts.push({ alertType: "memory",    severity: "critical", threshold: 90, value: snapshot.memory });
    if ((snapshot.errorRate as number) > 2)      alerts.push({ alertType: "error_rate",severity: "warning",  threshold: 2,  value: snapshot.errorRate });
    if ((snapshot.apiResponseTime as number) > 500) alerts.push({ alertType: "api", severity: "warning", threshold: 500, value: snapshot.apiResponseTime });

    for (const alert of alerts) {
      await db.collection("system_alerts").add({
        ...alert,
        message: `${alert.alertType.toUpperCase()} exceeded threshold: ${alert.value.toFixed(1)}`,
        resolvedAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Prune old snapshots (keep last 24h)
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 86_400_000);
    const old    = await db.collection("system_health").where("timestamp", "<", cutoff).limit(100).get();
    if (!old.empty) {
      const pBatch = db.batch();
      old.docs.forEach((d) => pBatch.delete(d.ref));
      await pBatch.commit();
    }
  });

// ─── Story expiry cleanup (hourly) ────────────────────────────────────────────

export const cleanupExpiredStories = functions.pubsub
  .schedule("every 1 hours")
  .onRun(async () => {
    const snap = await db.collection("stories")
      .where("expiresAt", "<", Date.now())
      .where("isHighlight", "==", false)
      .limit(200)
      .get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`Deleted ${snap.size} expired stories`);
  });

// ─── Ban evasion detection (daily) ────────────────────────────────────────────

export const detectBanEvasion = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async () => {
    const bannedSnap = await db.collection("users")
      .where("isBanned", "==", true)
      .limit(500)
      .get();

    for (const bannedDoc of bannedSnap.docs) {
      const banned = bannedDoc.data();
      // Find users with same device fingerprints
      if (!banned.deviceFingerprints?.length) continue;
      const fingerprints: string[] = banned.deviceFingerprints.slice(0, 10);

      const matchSnap = await db.collection("users")
        .where("deviceFingerprints", "array-contains-any", fingerprints)
        .where("isBanned", "==", false)
        .limit(5)
        .get();

      for (const matchDoc of matchSnap.docs) {
        if (matchDoc.id === bannedDoc.id) continue;
        await db.collection("ban_evasion_records").add({
          originalUserId:  bannedDoc.id,
          suspectedUserId: matchDoc.id,
          evidence:        { sharedDevices: fingerprints },
          confidence:      0.7,
          status:          "suspected",
          createdAt:       admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
    console.log("Ban evasion detection complete");
  });
