// File: services/trust-safety.service.ts
// Trust & Safety Operations - Full Production Implementation
// Extends existing moderation.service.ts

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
  writeBatch,
  onSnapshot,
} from 'firebase/firestore';
import auditLogService, { AuditAction } from './audit-log.service';
import notificationService from './notification.service';

// ============================================================================
// TYPES
// ============================================================================

export enum InvestigationType {
  ABUSE = 'abuse',
  SCAM = 'scam',
  HARASSMENT = 'harassment',
  IMPERSONATION = 'impersonation',
  SPAM = 'spam',
  COORDINATED_ABUSE = 'coordinated_abuse',
  CHILD_SAFETY = 'child_safety',
  MEDICAL_MISINFORMATION = 'medical_misinformation',
}

export enum InvestigationStatus {
  SUBMITTED = 'submitted',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  PENDING_EVIDENCE = 'pending_evidence',
  ESCALATED = 'escalated',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum StrikeSeverity {
  WARNING = 'warning',
  STRIKE_1 = 'strike_1',
  STRIKE_2 = 'strike_2',
  TEMP_SUSPENSION = 'temp_suspension',
  PERMANENT_BAN = 'permanent_ban',
}

export interface Investigation {
  id: string;
  caseNumber: string;
  type: InvestigationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: InvestigationStatus;

  reportedUserId: string;
  reportedContentId?: string;
  reportedCommunityId?: string;
  reporterIds: string[];

  description: string;
  evidence: {
    screenshots?: string[];
    urls?: string[];
    notes?: string;
  };

  assignedTo?: string;
  escalatedTo?: string;

  timeline: {
    submittedAt: Timestamp;
    assignedAt?: Timestamp;
    startedAt?: Timestamp;
    escalatedAt?: Timestamp;
    resolvedAt?: Timestamp;
  };

  findings?: {
    summary: string;
    recommendation: string;
    action: 'no_action' | 'warning' | 'strike' | 'suspend' | 'ban';
  };

  resolution?: {
    action: string;
    appliedAt: Timestamp;
    appliedBy: string;
    notes: string;
  };

  isConfidential: boolean;
  tags: string[];
}

export interface UserStrike {
  id: string;
  userId: string;
  severity: StrikeSeverity;
  reason: string;
  violationType: InvestigationType;
  investigationId?: string;
  appliedAt: Timestamp;
  appliedBy: string;
  expiresAt?: Timestamp;
  action: {
    description: string;
    duration?: number; // ms for temp ban
  };
  appeal?: {
    submittedAt: Timestamp;
    status: 'pending' | 'approved' | 'rejected';
    reviewedBy?: string;
    decision?: string;
  };
  isActive: boolean;
}

export interface ReputationScore {
  userId: string;
  trustScore: number;      // 0-100 higher = better
  riskScore: number;       // 0-100 higher = worse
  communityScore: number;  // 0-100
  healthcareScore: number; // 0-100 (verified professionals)

  factors: {
    accountAgeScore: number;       // 0-20
    strikeDeductions: number;      // -10 per strike (max -40)
    reportedDeductions: number;    // -5 per report (max -20)
    verificationBonus: number;     // +20 if verified professional
    engagementScore: number;       // 0-10
    communityStanding: number;     // 0-10
  };

  history: {
    timestamp: Timestamp;
    trustScoreBefore: number;
    trustScoreAfter: number;
    reason: string;
  }[];

  lastCalculatedAt: Timestamp;
  nextRecalcAt: Timestamp;
}

export interface Appeal {
  id: string;
  userId: string;
  type: 'strike' | 'suspension' | 'ban' | 'content_removal' | 'verification_rejection';
  targetId: string; // strikeId, suspensionId, etc.
  reason: string;
  evidence: string[];
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  submittedAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  decision?: string;
  decisionNotes?: string;
}

// ============================================================================
// TRUST & SAFETY SERVICE
// ============================================================================

class TrustSafetyService {
  private db = getFirestore();

  // ========================================================================
  // INVESTIGATIONS
  // ========================================================================

  /**
   * Submit investigation report
   */
  async submitInvestigation(
    type: InvestigationType,
    reportedUserId: string,
    reporterId: string,
    description: string,
    evidence?: {
      screenshots?: string[];
      urls?: string[];
      notes?: string;
    },
    contentId?: string
  ): Promise<Investigation> {
    try {
      const caseNumber = this.generateCaseNumber();
      const severity = this.assessSeverity(type);

      const investigation: Omit<Investigation, 'id'> = {
        caseNumber,
        type,
        severity,
        status: InvestigationStatus.SUBMITTED,
        reportedUserId,
        reportedContentId: contentId,
        reporterIds: [reporterId],
        description,
        evidence: evidence || {},
        timeline: { submittedAt: Timestamp.now() },
        isConfidential: type === InvestigationType.CHILD_SAFETY,
        tags: [type],
      };

      const ref = await addDoc(
        collection(this.db, 'investigations'),
        investigation
      );

      // Auto-assign based on severity
      await this.autoAssign(ref.id, severity);

      // Auto-flag high severity
      if (severity === 'critical' || severity === 'high') {
        await this.applyProvisionalRestriction(reportedUserId, type);
      }

      await auditLogService.log(
        AuditAction.INVESTIGATION_CREATED,
        { userId: reporterId, email: '', ipAddress: '' },
        { type: 'investigation', id: ref.id },
        { metadata: { caseNumber, type, severity } }
      );

      return { ...investigation, id: ref.id } as Investigation;
    } catch (error) {
      console.error('Error submitting investigation:', error);
      throw error;
    }
  }

  /**
   * Assign investigation to investigator
   */
  async assignInvestigation(
    investigationId: string,
    investigatorId: string,
    assignedBy: string
  ): Promise<void> {
    await updateDoc(doc(this.db, 'investigations', investigationId), {
      assignedTo: investigatorId,
      status: InvestigationStatus.ASSIGNED,
      'timeline.assignedAt': Timestamp.now(),
    });

    // Notify investigator
    await notificationService.sendNotification({
      userId: investigatorId,
      type: 'investigation_assigned',
      title: 'New Investigation Assigned',
      message: `Case ${investigationId} has been assigned to you.`,
      data: { investigationId },
    });
  }

  /**
   * Update investigation status
   */
  async updateInvestigationStatus(
    investigationId: string,
    status: InvestigationStatus,
    updatedBy: string,
    notes?: string
  ): Promise<void> {
    const updateData: any = {
      status,
      [`timeline.${this.statusToTimelineKey(status)}`]: Timestamp.now(),
    };

    if (notes) {
      updateData['resolution.notes'] = notes;
      updateData['resolution.appliedBy'] = updatedBy;
      updateData['resolution.appliedAt'] = Timestamp.now();
    }

    await updateDoc(doc(this.db, 'investigations', investigationId), updateData);
  }

  /**
   * Resolve investigation with action
   */
  async resolveInvestigation(
    investigationId: string,
    resolvedBy: string,
    action: 'no_action' | 'warning' | 'strike' | 'suspend' | 'ban',
    notes: string
  ): Promise<void> {
    try {
      const invSnap = await getDoc(
        doc(this.db, 'investigations', investigationId)
      );
      if (!invSnap.exists()) throw new Error('Investigation not found');

      const investigation = invSnap.data() as Investigation;

      await updateDoc(doc(this.db, 'investigations', investigationId), {
        status: InvestigationStatus.RESOLVED,
        'findings.action': action,
        'timeline.resolvedAt': Timestamp.now(),
        resolution: {
          action,
          appliedAt: Timestamp.now(),
          appliedBy: resolvedBy,
          notes,
        },
      });

      // Apply action
      if (action === 'warning' || action === 'strike') {
        await this.applyStrike(
          investigation.reportedUserId,
          investigation.type,
          action === 'warning' ? StrikeSeverity.WARNING : undefined,
          resolvedBy,
          investigationId
        );
      } else if (action === 'suspend') {
        await this.suspendUser(
          investigation.reportedUserId,
          resolvedBy,
          notes,
          7 * 24 * 60 * 60 * 1000 // 7 days
        );
      } else if (action === 'ban') {
        await this.banUser(
          investigation.reportedUserId,
          resolvedBy,
          notes
        );
      }

      await auditLogService.log(
        AuditAction.INVESTIGATION_CLOSED,
        { userId: resolvedBy, email: '', ipAddress: '' },
        { type: 'investigation', id: investigationId },
        { metadata: { action, notes } }
      );
    } catch (error) {
      console.error('Error resolving investigation:', error);
      throw error;
    }
  }

  // ========================================================================
  // STRIKE SYSTEM
  // ========================================================================

  /**
   * Apply strike to user
   */
  async applyStrike(
    userId: string,
    violationType: InvestigationType,
    overrideSeverity?: StrikeSeverity,
    appliedBy: string = 'system',
    investigationId?: string
  ): Promise<UserStrike> {
    try {
      // Get existing active strikes
      const existingStrikes = await this.getUserStrikes(userId);
      const activeStrikes = existingStrikes.filter(s => s.isActive);

      // Determine severity based on count
      let severity: StrikeSeverity;
      if (overrideSeverity) {
        severity = overrideSeverity;
      } else {
        switch (activeStrikes.length) {
          case 0: severity = StrikeSeverity.WARNING; break;
          case 1: severity = StrikeSeverity.STRIKE_1; break;
          case 2: severity = StrikeSeverity.STRIKE_2; break;
          case 3: severity = StrikeSeverity.TEMP_SUSPENSION; break;
          default: severity = StrikeSeverity.PERMANENT_BAN;
        }
      }

      // Determine action
      const action = this.getStrikeAction(severity);

      const strike: Omit<UserStrike, 'id'> = {
        userId,
        severity,
        reason: `Violation of community guidelines: ${violationType}`,
        violationType,
        investigationId,
        appliedAt: Timestamp.now(),
        appliedBy,
        expiresAt: action.duration
          ? new Timestamp(
              Math.floor(Date.now() / 1000) + action.duration / 1000,
              0
            )
          : undefined,
        action: {
          description: action.description,
          duration: action.duration,
        },
        isActive: true,
      };

      const ref = await addDoc(collection(this.db, 'user_strikes'), strike);

      // Apply consequences
      await this.applyStrikeConsequences(userId, severity, action);

      // Notify user
      await notificationService.sendNotification({
        userId,
        type: 'strike_applied',
        title: 'Account Action',
        message: action.description,
        data: { strikeId: ref.id, severity },
      });

      // Recalculate reputation
      await this.calculateReputationScore(userId);

      await auditLogService.log(
        AuditAction.STRIKE_APPLIED,
        { userId: appliedBy, email: '', ipAddress: '' },
        { type: 'user', id: userId },
        { metadata: { severity, violationType } }
      );

      return { ...strike, id: ref.id } as UserStrike;
    } catch (error) {
      console.error('Error applying strike:', error);
      throw error;
    }
  }

  /**
   * Get user strikes
   */
  async getUserStrikes(userId: string): Promise<UserStrike[]> {
    const q = query(
      collection(this.db, 'user_strikes'),
      where('userId', '==', userId),
      orderBy('appliedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as UserStrike));
  }

  // ========================================================================
  // REPUTATION SCORING
  // ========================================================================

  /**
   * Calculate full reputation score
   */
  async calculateReputationScore(userId: string): Promise<ReputationScore> {
    try {
      const userSnap = await getDoc(doc(this.db, 'users', userId));
      if (!userSnap.exists()) throw new Error('User not found');
      const user = userSnap.data();

      const now = Math.floor(Date.now() / 1000);
      const createdAt = user.createdAt?.seconds || now;
      const accountAgeDays = (now - createdAt) / 86400;

      // Account age score (0-20 over 180 days)
      const accountAgeScore = Math.min(20, (accountAgeDays / 180) * 20);

      // Strike deductions
      const strikes = await this.getUserStrikes(userId);
      const activeStrikes = strikes.filter(s => s.isActive);
      const strikeDeductions = Math.min(40, activeStrikes.length * 10);

      // Report deductions
      const reportCount = user.reportCount || 0;
      const reportedDeductions = Math.min(20, reportCount * 5);

      // Verification bonus
      const isVerified = user.isVerified || false;
      const verificationBonus = isVerified ? 20 : 0;

      // Community engagement
      const postCount = user.postCount || 0;
      const engagementScore = Math.min(10, postCount / 10);
      const communityStanding = user.communityStanding || 5;

      const factors = {
        accountAgeScore,
        strikeDeductions: -strikeDeductions,
        reportedDeductions: -reportedDeductions,
        verificationBonus,
        engagementScore,
        communityStanding,
      };

      const trustScore = Math.max(
        0,
        Math.min(
          100,
          accountAgeScore +
            verificationBonus +
            engagementScore +
            communityStanding -
            strikeDeductions -
            reportedDeductions
        )
      );

      const riskScore = Math.min(
        100,
        (strikeDeductions / 40) * 50 +
          (reportedDeductions / 20) * 30 +
          (accountAgeDays < 7 ? 20 : 0)
      );

      const score: ReputationScore = {
        userId,
        trustScore,
        riskScore,
        communityScore: Math.max(0, 100 - riskScore),
        healthcareScore: isVerified ? trustScore : 0,
        factors,
        history: [],
        lastCalculatedAt: Timestamp.now(),
        nextRecalcAt: new Timestamp(
          Math.floor(Date.now() / 1000) + 86400,
          0
        ),
      };

      await setDoc(
        doc(this.db, 'reputation_scores', userId),
        score
      );

      return score;
    } catch (error) {
      console.error('Error calculating reputation:', error);
      throw error;
    }
  }

  /**
   * Get reputation score
   */
  async getReputationScore(userId: string): Promise<ReputationScore | null> {
    const snap = await getDoc(doc(this.db, 'reputation_scores', userId));
    if (!snap.exists()) return this.calculateReputationScore(userId);
    return snap.data() as ReputationScore;
  }

  // ========================================================================
  // APPEALS
  // ========================================================================

  /**
   * Submit appeal
   */
  async submitAppeal(
    userId: string,
    type: Appeal['type'],
    targetId: string,
    reason: string,
    evidence: string[] = []
  ): Promise<Appeal> {
    const appeal: Omit<Appeal, 'id'> = {
      userId,
      type,
      targetId,
      reason,
      evidence,
      status: 'pending',
      submittedAt: Timestamp.now(),
    };

    const ref = await addDoc(collection(this.db, 'appeals'), appeal);
    return { ...appeal, id: ref.id } as Appeal;
  }

  /**
   * Review appeal
   */
  async reviewAppeal(
    appealId: string,
    reviewedBy: string,
    decision: 'approved' | 'rejected',
    decisionNotes: string
  ): Promise<void> {
    const appealSnap = await getDoc(doc(this.db, 'appeals', appealId));
    if (!appealSnap.exists()) throw new Error('Appeal not found');
    const appeal = appealSnap.data() as Appeal;

    await updateDoc(doc(this.db, 'appeals', appealId), {
      status: decision,
      reviewedAt: Timestamp.now(),
      reviewedBy,
      decision,
      decisionNotes,
    });

    if (decision === 'approved') {
      await this.processApprovedAppeal(appeal);
    }

    await notificationService.sendNotification({
      userId: appeal.userId,
      type: 'appeal_decision',
      title: `Appeal ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
      message: decisionNotes,
      data: { appealId, decision },
    });
  }

  // ========================================================================
  // USER ACTIONS
  // ========================================================================

  /**
   * Suspend user
   */
  async suspendUser(
    userId: string,
    suspendedBy: string,
    reason: string,
    durationMs: number
  ): Promise<void> {
    const expiresAt = new Timestamp(
      Math.floor(Date.now() / 1000) + durationMs / 1000,
      0
    );

    await updateDoc(doc(this.db, 'users', userId), {
      isSuspended: true,
      suspendedAt: Timestamp.now(),
      suspendedBy,
      suspensionReason: reason,
      suspensionExpiresAt: expiresAt,
    });

    await auditLogService.log(
      AuditAction.USER_SUSPENDED,
      { userId: suspendedBy, email: '', ipAddress: '' },
      { type: 'user', id: userId },
      { reason, metadata: { durationMs } }
    );
  }

  /**
   * Ban user
   */
  async banUser(
    userId: string,
    bannedBy: string,
    reason: string
  ): Promise<void> {
    await updateDoc(doc(this.db, 'users', userId), {
      isBanned: true,
      bannedAt: Timestamp.now(),
      bannedBy,
      banReason: reason,
    });

    await auditLogService.log(
      AuditAction.USER_BANNED,
      { userId: bannedBy, email: '', ipAddress: '' },
      { type: 'user', id: userId },
      { reason }
    );
  }

  /**
   * Shadow-ban user (hidden from others, not aware of ban)
   */
  async shadowBanUser(
    userId: string,
    bannedBy: string,
    reason: string
  ): Promise<void> {
    await updateDoc(doc(this.db, 'users', userId), {
      isShadowBanned: true,
      shadowBannedAt: Timestamp.now(),
      shadowBannedBy: bannedBy,
      shadowBanReason: reason,
    });
  }

  // ========================================================================
  // QUERY & ANALYTICS
  // ========================================================================

  /**
   * Get open investigations
   */
  async getOpenInvestigations(limit = 50): Promise<Investigation[]> {
    const q = query(
      collection(this.db, 'investigations'),
      where('status', 'in', [
        InvestigationStatus.SUBMITTED,
        InvestigationStatus.ASSIGNED,
        InvestigationStatus.IN_PROGRESS,
        InvestigationStatus.ESCALATED,
      ]),
      orderBy('timeline.submittedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Investigation));
  }

  /**
   * Get pending appeals
   */
  async getPendingAppeals(): Promise<Appeal[]> {
    const q = query(
      collection(this.db, 'appeals'),
      where('status', '==', 'pending'),
      orderBy('submittedAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Appeal));
  }

  // ========================================================================
  // PRIVATE HELPERS
  // ========================================================================

  private generateCaseNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `TS-${timestamp}-${random}`;
  }

  private assessSeverity(type: InvestigationType): 'low' | 'medium' | 'high' | 'critical' {
    const criticalTypes = [
      InvestigationType.CHILD_SAFETY,
      InvestigationType.COORDINATED_ABUSE,
    ];
    const highTypes = [
      InvestigationType.SCAM,
      InvestigationType.IMPERSONATION,
      InvestigationType.MEDICAL_MISINFORMATION,
    ];
    if (criticalTypes.includes(type)) return 'critical';
    if (highTypes.includes(type)) return 'high';
    if (type === InvestigationType.HARASSMENT) return 'medium';
    return 'low';
  }

  private getStrikeAction(severity: StrikeSeverity): {
    description: string;
    duration?: number;
  } {
    switch (severity) {
      case StrikeSeverity.WARNING:
        return { description: 'Warning issued. Further violations may result in account restrictions.' };
      case StrikeSeverity.STRIKE_1:
        return { description: 'Strike 1 applied. Posting restricted for 24 hours.', duration: 24 * 60 * 60 * 1000 };
      case StrikeSeverity.STRIKE_2:
        return { description: 'Strike 2 applied. Account restricted for 72 hours.', duration: 72 * 60 * 60 * 1000 };
      case StrikeSeverity.TEMP_SUSPENSION:
        return { description: 'Account suspended for 7 days.', duration: 7 * 24 * 60 * 60 * 1000 };
      case StrikeSeverity.PERMANENT_BAN:
        return { description: 'Account permanently banned for repeated violations.' };
    }
  }

  private async applyStrikeConsequences(
    userId: string,
    severity: StrikeSeverity,
    action: { description: string; duration?: number }
  ): Promise<void> {
    if (severity === StrikeSeverity.PERMANENT_BAN) {
      await this.banUser(userId, 'system', action.description);
    } else if (
      severity === StrikeSeverity.TEMP_SUSPENSION &&
      action.duration
    ) {
      await this.suspendUser(userId, 'system', action.description, action.duration);
    } else if (
      severity === StrikeSeverity.STRIKE_1 ||
      severity === StrikeSeverity.STRIKE_2
    ) {
      await updateDoc(doc(this.db, 'users', userId), {
        postingRestricted: true,
        postingRestrictedUntil: new Timestamp(
          Math.floor(Date.now() / 1000) + (action.duration || 0) / 1000,
          0
        ),
      });
    }
  }

  private async processApprovedAppeal(appeal: Appeal): Promise<void> {
    if (appeal.type === 'strike') {
      await updateDoc(doc(this.db, 'user_strikes', appeal.targetId), {
        isActive: false,
        'appeal.status': 'approved',
      });
      await updateDoc(doc(this.db, 'users', appeal.userId), {
        isSuspended: false,
        postingRestricted: false,
      });
    } else if (appeal.type === 'suspension') {
      await updateDoc(doc(this.db, 'users', appeal.userId), {
        isSuspended: false,
        suspensionReason: null,
      });
    } else if (appeal.type === 'ban') {
      await updateDoc(doc(this.db, 'users', appeal.userId), {
        isBanned: false,
        banReason: null,
      });
    }
  }

  private async autoAssign(investigationId: string, severity: string): Promise<void> {
    if (severity === 'critical') {
      await updateDoc(doc(this.db, 'investigations', investigationId), {
        status: InvestigationStatus.ESCALATED,
        'timeline.escalatedAt': Timestamp.now(),
      });
    }
  }

  private async applyProvisionalRestriction(
    userId: string,
    type: InvestigationType
  ): Promise<void> {
    if (type === InvestigationType.CHILD_SAFETY) {
      await updateDoc(doc(this.db, 'users', userId), {
        provisionalRestriction: true,
        provisionalRestrictedAt: Timestamp.now(),
      });
    }
  }

  private statusToTimelineKey(status: InvestigationStatus): string {
    const map: Record<string, string> = {
      assigned: 'assignedAt',
      in_progress: 'startedAt',
      escalated: 'escalatedAt',
      resolved: 'resolvedAt',
    };
    return map[status] || 'updatedAt';
  }
}

export default new TrustSafetyService();
