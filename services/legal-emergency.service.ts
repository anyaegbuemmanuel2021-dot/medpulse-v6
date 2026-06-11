// File: services/legal-operations.service.ts
// Legal Operations Center: Policy Management, Copyright, Emergency Controls

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
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
// TYPES — LEGAL POLICY
// ============================================================================

export type PolicyType =
  | 'terms_of_service'
  | 'privacy_policy'
  | 'cookie_policy'
  | 'medical_disclaimer'
  | 'community_guidelines'
  | 'copyright_policy'
  | 'verification_policy'
  | 'appeals_policy'
  | 'data_retention_policy'
  | 'security_policy';

export interface LegalPolicy {
  id: string;
  type: PolicyType;
  version: number;
  title: string;
  content: string;        // full markdown / HTML content
  summary: string;        // plain-language summary
  changeLog: string;      // what changed from previous version
  effectiveDate: Timestamp;
  publishedAt?: Timestamp;
  scheduledAt?: Timestamp;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  requiresReAcceptance: boolean;
  createdBy: string;
  updatedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PolicyAcceptance {
  id: string;
  userId: string;
  policyId: string;
  policyType: PolicyType;
  policyVersion: number;
  acceptedAt: Timestamp;
  ipAddress: string;
  userAgent?: string;
}

// ============================================================================
// TYPES — COPYRIGHT
// ============================================================================

export type CopyrightClaimStatus =
  | 'submitted'
  | 'under_review'
  | 'upheld'
  | 'rejected'
  | 'counter_notice_received'
  | 'resolved';

export interface CopyrightClaim {
  id: string;
  claimantUserId: string;
  claimantName: string;
  claimantEmail: string;
  respondentUserId?: string;
  contentId: string;
  contentType: 'post' | 'video' | 'image' | 'audio' | 'document';
  contentUrl: string;

  ownershipStatement: string;
  originalWorkUrl?: string;
  evidence?: string[];

  status: CopyrightClaimStatus;
  reviewedBy?: string;
  reviewNotes?: string;
  resolution?: string;

  counterNotice?: {
    submittedAt: Timestamp;
    statement: string;
    evidence?: string[];
    legalContactInfo?: string;
  };

  appeal?: {
    submittedAt: Timestamp;
    reason: string;
    status: 'pending' | 'upheld' | 'rejected';
    reviewedBy?: string;
    decision?: string;
  };

  submittedAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// TYPES — EMERGENCY CONTROLS
// ============================================================================

export type EmergencyActionType =
  | 'disable_registrations'
  | 'disable_uploads'
  | 'disable_messaging'
  | 'disable_comments'
  | 'disable_livestreams'
  | 'disable_marketplace'
  | 'disable_communities'
  | 'read_only_mode'
  | 'maintenance_mode';

export interface EmergencyControl {
  action: EmergencyActionType;
  isActive: boolean;
  activatedAt?: Timestamp;
  activatedBy?: string;
  reason: string;
  estimatedDurationMinutes?: number;
  autoDeactivateAt?: Timestamp;
  deactivatedAt?: Timestamp;
  deactivatedBy?: string;
  publicMessage?: string;   // shown to users in UI
}

// ============================================================================
// LEGAL OPERATIONS SERVICE
// ============================================================================

class LegalOperationsService {
  private db = getFirestore();

  // ========================================================================
  // POLICY MANAGEMENT
  // ========================================================================

  /**
   * Create a new policy draft
   */
  async createPolicyDraft(
    type: PolicyType,
    title: string,
    content: string,
    summary: string,
    changeLog: string,
    requiresReAcceptance: boolean,
    createdBy: string
  ): Promise<LegalPolicy> {
    // Get current version
    const currentVersion = await this.getCurrentVersion(type);

    const policy: Omit<LegalPolicy, 'id'> = {
      type,
      version: currentVersion + 1,
      title,
      content,
      summary,
      changeLog,
      effectiveDate: Timestamp.now(),
      status: 'draft',
      requiresReAcceptance,
      createdBy,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const ref = await addDoc(collection(this.db, 'legal_policies'), policy);

    await auditLogService.log(
      AuditAction.POLICY_UPDATED,
      { userId: createdBy, email: '', ipAddress: '' },
      { type: 'policy', id: ref.id },
      { metadata: { policyType: type, version: policy.version } }
    );

    return { ...policy, id: ref.id } as LegalPolicy;
  }

  /**
   * Publish a policy draft
   */
  async publishPolicy(policyId: string, publishedBy: string): Promise<void> {
    const policySnap = await getDoc(doc(this.db, 'legal_policies', policyId));
    if (!policySnap.exists()) throw new Error('Policy not found');
    const policy = policySnap.data() as LegalPolicy;

    if (policy.status !== 'draft' && policy.status !== 'scheduled') {
      throw new Error('Only draft or scheduled policies can be published');
    }

    const batch = writeBatch(this.db);

    // Archive previous published version
    const prev = await this.getPublishedPolicy(policy.type);
    if (prev) {
      batch.update(doc(this.db, 'legal_policies', prev.id), { status: 'archived' });
    }

    // Publish new version
    batch.update(doc(this.db, 'legal_policies', policyId), {
      status: 'published',
      publishedAt: Timestamp.now(),
      updatedBy: publishedBy,
      updatedAt: Timestamp.now(),
    });

    await batch.commit();

    // If requires re-acceptance, notify all users
    if (policy.requiresReAcceptance) {
      await this.notifyPolicyUpdate(policy);
    }
  }

  /**
   * Schedule a policy for future publishing
   */
  async schedulePolicy(
    policyId: string,
    scheduledAt: Date,
    scheduledBy: string
  ): Promise<void> {
    await updateDoc(doc(this.db, 'legal_policies', policyId), {
      status: 'scheduled',
      scheduledAt: Timestamp.fromDate(scheduledAt),
      updatedBy: scheduledBy,
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Get currently published policy
   */
  async getPublishedPolicy(type: PolicyType): Promise<LegalPolicy | null> {
    const q = query(
      collection(this.db, 'legal_policies'),
      where('type', '==', type),
      where('status', '==', 'published'),
      orderBy('version', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { ...snap.docs[0].data(), id: snap.docs[0].id } as LegalPolicy;
  }

  /**
   * Get all versions of a policy type
   */
  async getPolicyHistory(type: PolicyType): Promise<LegalPolicy[]> {
    const q = query(
      collection(this.db, 'legal_policies'),
      where('type', '==', type),
      orderBy('version', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as LegalPolicy));
  }

  /**
   * Record user policy acceptance
   */
  async recordAcceptance(
    userId: string,
    policyId: string,
    policyType: PolicyType,
    policyVersion: number,
    ipAddress: string,
    userAgent?: string
  ): Promise<void> {
    const acceptance: Omit<PolicyAcceptance, 'id'> = {
      userId,
      policyId,
      policyType,
      policyVersion,
      acceptedAt: Timestamp.now(),
      ipAddress,
      userAgent,
    };

    await addDoc(collection(this.db, 'policy_acceptances'), acceptance);
  }

  /**
   * Check if user has accepted current policy
   */
  async hasUserAccepted(userId: string, type: PolicyType): Promise<boolean> {
    const policy = await this.getPublishedPolicy(type);
    if (!policy) return true; // No policy = no requirement

    const q = query(
      collection(this.db, 'policy_acceptances'),
      where('userId', '==', userId),
      where('policyType', '==', type),
      where('policyVersion', '==', policy.version)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  }

  /**
   * Get users who haven't accepted a policy update
   */
  async getUsersPendingAcceptance(policyId: string): Promise<string[]> {
    const acceptancesSnap = await getDocs(
      query(
        collection(this.db, 'policy_acceptances'),
        where('policyId', '==', policyId)
      )
    );
    return acceptancesSnap.docs.map(d => d.data().userId);
  }

  // ========================================================================
  // COPYRIGHT MANAGEMENT
  // ========================================================================

  /**
   * Submit copyright claim
   */
  async submitCopyrightClaim(
    claimantUserId: string,
    claimantName: string,
    claimantEmail: string,
    contentId: string,
    contentType: CopyrightClaim['contentType'],
    contentUrl: string,
    ownershipStatement: string,
    evidence?: string[],
    originalWorkUrl?: string
  ): Promise<CopyrightClaim> {
    const claim: Omit<CopyrightClaim, 'id'> = {
      claimantUserId,
      claimantName,
      claimantEmail,
      contentId,
      contentType,
      contentUrl,
      ownershipStatement,
      evidence,
      originalWorkUrl,
      status: 'submitted',
      submittedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const ref = await addDoc(collection(this.db, 'copyright_claims'), claim);

    // Auto-hide content while under review
    try {
      await updateDoc(doc(this.db, 'posts', contentId), {
        isUnderCopyrightReview: true,
        copyrightClaimId: ref.id,
      });
    } catch {}

    await auditLogService.log(
      AuditAction.COPYRIGHT_CLAIM_FILED,
      { userId: claimantUserId, email: claimantEmail, ipAddress: '' },
      { type: 'content', id: contentId },
      { metadata: { claimId: ref.id } }
    );

    return { ...claim, id: ref.id } as CopyrightClaim;
  }

  /**
   * Review copyright claim
   */
  async reviewCopyrightClaim(
    claimId: string,
    reviewedBy: string,
    decision: 'upheld' | 'rejected',
    notes: string
  ): Promise<void> {
    const claimSnap = await getDoc(doc(this.db, 'copyright_claims', claimId));
    if (!claimSnap.exists()) throw new Error('Claim not found');
    const claim = claimSnap.data() as CopyrightClaim;

    await updateDoc(doc(this.db, 'copyright_claims', claimId), {
      status: decision,
      reviewedBy,
      reviewNotes: notes,
      resolution: decision === 'upheld' ? 'Content removed' : 'Claim rejected - no violation found',
      updatedAt: Timestamp.now(),
    });

    if (decision === 'upheld') {
      // Remove the content
      try {
        await updateDoc(doc(this.db, 'posts', claim.contentId), {
          isRemovedByCopyright: true,
          removedAt: Timestamp.now(),
          removedBy: 'copyright_system',
        });
      } catch {}

      // Notify respondent
      if (claim.respondentUserId) {
        await notificationService.sendNotification({
          userId: claim.respondentUserId,
          type: 'copyright_claim_upheld',
          title: 'Content Removed - Copyright Violation',
          message:
            'Your content has been removed following a copyright claim. You may submit a counter-notice if you believe this is incorrect.',
          data: { claimId },
        });
      }
    }

    // Notify claimant
    await notificationService.sendNotification({
      userId: claim.claimantUserId,
      type: 'copyright_claim_reviewed',
      title: `Copyright Claim ${decision === 'upheld' ? 'Upheld' : 'Rejected'}`,
      message: `Your copyright claim has been ${decision}. ${notes}`,
      data: { claimId, decision },
    });
  }

  /**
   * Submit counter-notice
   */
  async submitCounterNotice(
    claimId: string,
    userId: string,
    statement: string,
    legalContactInfo?: string,
    evidence?: string[]
  ): Promise<void> {
    await updateDoc(doc(this.db, 'copyright_claims', claimId), {
      status: 'counter_notice_received',
      counterNotice: {
        submittedAt: Timestamp.now(),
        statement,
        evidence,
        legalContactInfo,
      },
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Get pending copyright claims
   */
  async getPendingClaims(): Promise<CopyrightClaim[]> {
    const q = query(
      collection(this.db, 'copyright_claims'),
      where('status', 'in', ['submitted', 'under_review', 'counter_notice_received']),
      orderBy('submittedAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as CopyrightClaim));
  }

  // ========================================================================
  // PRIVATE HELPERS
  // ========================================================================

  private async getCurrentVersion(type: PolicyType): Promise<number> {
    const q = query(
      collection(this.db, 'legal_policies'),
      where('type', '==', type),
      orderBy('version', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return 0;
    return snap.docs[0].data().version as number;
  }

  private async notifyPolicyUpdate(policy: LegalPolicy): Promise<void> {
    // In production, batch-notify affected users
    await addDoc(collection(this.db, 'admin_notifications'), {
      type: 'policy_requires_reacceptance',
      policyId: policy.id,
      policyType: policy.type,
      message: `Policy "${policy.title}" v${policy.version} requires user re-acceptance`,
      createdAt: Timestamp.now(),
    });
  }
}

// ============================================================================
// EMERGENCY CONTROLS SERVICE
// ============================================================================

class EmergencyControlsService {
  private db = getFirestore();

  /**
   * Activate an emergency control (instant effect)
   */
  async activate(
    action: EmergencyActionType,
    reason: string,
    activatedBy: string,
    options?: {
      estimatedDurationMinutes?: number;
      publicMessage?: string;
    }
  ): Promise<void> {
    const autoDeactivateAt = options?.estimatedDurationMinutes
      ? new Timestamp(
          Math.floor(Date.now() / 1000) + options.estimatedDurationMinutes * 60,
          0
        )
      : undefined;

    const control: EmergencyControl = {
      action,
      isActive: true,
      activatedAt: Timestamp.now(),
      activatedBy,
      reason,
      estimatedDurationMinutes: options?.estimatedDurationMinutes,
      autoDeactivateAt,
      publicMessage:
        options?.publicMessage || 'This feature is temporarily unavailable.',
    };

    // Write to a single doc per action for instant reads
    await setDoc(doc(this.db, 'emergency_controls', action), control);

    await auditLogService.log(
      AuditAction.EMERGENCY_MODE_ACTIVATED,
      { userId: activatedBy, email: '', ipAddress: '' },
      { type: 'system', id: action },
      { reason, metadata: options }
    );

    // Notify all admins
    await addDoc(collection(this.db, 'admin_notifications'), {
      type: 'emergency_activated',
      action,
      reason,
      activatedBy,
      createdAt: Timestamp.now(),
      priority: 'critical',
      isRead: false,
    });
  }

  /**
   * Deactivate an emergency control
   */
  async deactivate(
    action: EmergencyActionType,
    deactivatedBy: string,
    reason?: string
  ): Promise<void> {
    await updateDoc(doc(this.db, 'emergency_controls', action), {
      isActive: false,
      deactivatedAt: Timestamp.now(),
      deactivatedBy,
      deactivationReason: reason,
    });

    await auditLogService.log(
      AuditAction.MAINTENANCE_STARTED, // reuse closest action
      { userId: deactivatedBy, email: '', ipAddress: '' },
      { type: 'system', id: action },
      { reason }
    );
  }

  /**
   * Get all emergency controls status
   */
  async getStatus(): Promise<Record<EmergencyActionType, EmergencyControl>> {
    const snap = await getDocs(collection(this.db, 'emergency_controls'));
    const result: any = {};
    snap.docs.forEach(d => {
      result[d.id] = d.data();
    });
    return result;
  }

  /**
   * Check if a specific action is active
   */
  async isActive(action: EmergencyActionType): Promise<boolean> {
    const snap = await getDoc(doc(this.db, 'emergency_controls', action));
    if (!snap.exists()) return false;
    return (snap.data() as EmergencyControl).isActive;
  }

  /**
   * Subscribe to emergency controls (for middleware/UI)
   */
  subscribeToControls(
    callback: (controls: Record<string, EmergencyControl>) => void
  ): () => void {
    return onSnapshot(collection(this.db, 'emergency_controls'), snap => {
      const controls: any = {};
      snap.docs.forEach(d => { controls[d.id] = d.data(); });
      callback(controls);
    });
  }

  /**
   * Auto-deactivate expired controls (call from Cloud Function)
   */
  async expireControls(): Promise<void> {
    const now = Timestamp.now();
    const snap = await getDocs(
      query(
        collection(this.db, 'emergency_controls'),
        where('isActive', '==', true),
        where('autoDeactivateAt', '<=', now)
      )
    );

    for (const d of snap.docs) {
      await this.deactivate(
        d.id as EmergencyActionType,
        'system',
        'Auto-deactivated after scheduled duration'
      );
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const legalOpsService = new LegalOperationsService();
export const emergencyControlsService = new EmergencyControlsService();
