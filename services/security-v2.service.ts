// File: services/bot-protection.service.ts
// Bot Protection & Device Fingerprinting Platform

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

// ============================================================================
// TYPES
// ============================================================================

export interface DeviceFingerprint {
  id: string;
  userId?: string;
  fingerprint: string; // hashed device signature
  raw: {
    userAgent: string;
    screenResolution: string;
    timezone: string;
    language: string;
    platform: string;
    colorDepth: number;
    cookieEnabled: boolean;
    doNotTrack: boolean;
  };
  ipAddress: string;
  isp?: string;
  country?: string;
  isVPN: boolean;
  isProxy: boolean;
  isDatacenter: boolean;
  firstSeenAt: Timestamp;
  lastSeenAt: Timestamp;
  usageCount: number;
  associatedUserIds: string[];
}

export interface BotScore {
  userId: string;
  overall: number; // 0-100, higher = more likely bot
  breakdown: {
    deviceScore: number;
    behaviorScore: number;
    patternScore: number;
    ipScore: number;
    accountScore: number;
  };
  verdict: 'human' | 'suspicious' | 'likely_bot' | 'confirmed_bot';
  requiredActions: string[];
  lastUpdated: Timestamp;
}

export enum ThreatType {
  FAILED_LOGIN = 'failed_login',
  CREDENTIAL_STUFFING = 'credential_stuffing',
  BRUTE_FORCE = 'brute_force',
  ACCOUNT_TAKEOVER = 'account_takeover',
  DDOS_ATTACK = 'ddos_attack',
  BOT_TRAFFIC = 'bot_traffic',
  MALWARE_UPLOAD = 'malware_upload',
  API_ABUSE = 'api_abuse',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  ACCOUNT_FARM = 'account_farm',
}

export interface SecurityEvent {
  id: string;
  type: ThreatType;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'mitigated' | 'closed';
  sourceIP: string;
  userId?: string;
  details: any;
  autoMitigated: boolean;
  mitigationAction?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface IPBlock {
  ip: string;
  reason: string;
  type: 'ip' | 'asn' | 'cidr';
  blockedBy: string;
  blockedAt: Timestamp;
  expiresAt?: Timestamp;
  isActive: boolean;
}

// ============================================================================
// BOT PROTECTION SERVICE
// ============================================================================

class BotProtectionService {
  private db = getFirestore();

  /**
   * Analyze request and calculate bot score
   */
  async analyzeRequest(
    userId: string,
    ipAddress: string,
    deviceData: {
      userAgent: string;
      screenResolution?: string;
      timezone?: string;
      language?: string;
      platform?: string;
    },
    behaviorData?: {
      requestsPerMinute?: number;
      mouseMovements?: boolean;
      keyboardPatterns?: boolean;
      averageTypingSpeed?: number;
    }
  ): Promise<BotScore> {
    try {
      const [
        deviceScore,
        behaviorScore,
        patternScore,
        ipScore,
        accountScore,
      ] = await Promise.all([
        this.scoreDevice(deviceData),
        this.scoreBehavior(userId, behaviorData),
        this.scoreRequestPatterns(userId),
        this.scoreIP(ipAddress),
        this.scoreAccount(userId),
      ]);

      const overall = Math.round(
        deviceScore * 0.2 +
          behaviorScore * 0.3 +
          patternScore * 0.2 +
          ipScore * 0.2 +
          accountScore * 0.1
      );

      const verdict = this.getVerdict(overall);
      const requiredActions = this.getRequiredActions(overall, verdict);

      const botScore: BotScore = {
        userId,
        overall,
        breakdown: { deviceScore, behaviorScore, patternScore, ipScore, accountScore },
        verdict,
        requiredActions,
        lastUpdated: Timestamp.now(),
      };

      await setDoc(doc(this.db, 'bot_scores', userId), botScore);

      // Store fingerprint
      await this.storeFingerprint(userId, ipAddress, deviceData);

      // Trigger auto-actions
      if (overall > 85) {
        await this.triggerAutoProtection(userId, botScore);
      }

      return botScore;
    } catch (error) {
      console.error('Error analyzing request:', error);
      throw error;
    }
  }

  /**
   * Check IP reputation
   */
  async checkIPReputation(ipAddress: string): Promise<{
    isBlocked: boolean;
    isSuspicious: boolean;
    isVPN: boolean;
    isProxy: boolean;
    isDatacenter: boolean;
    threatScore: number;
  }> {
    try {
      const blockSnap = await getDoc(doc(this.db, 'ip_blocks', ipAddress));
      if (blockSnap.exists()) {
        const block = blockSnap.data() as IPBlock;
        if (block.isActive) {
          return {
            isBlocked: true,
            isSuspicious: true,
            isVPN: false,
            isProxy: false,
            isDatacenter: false,
            threatScore: 100,
          };
        }
      }

      // Check known bad IP ranges (simplified)
      const fpSnap = await getDocs(
        query(
          collection(this.db, 'device_fingerprints'),
          where('ipAddress', '==', ipAddress)
        )
      );

      let suspiciousCount = 0;
      let totalAssociatedUsers = 0;

      fpSnap.docs.forEach(d => {
        const fp = d.data() as DeviceFingerprint;
        totalAssociatedUsers += fp.associatedUserIds.length;
        if (fp.isVPN || fp.isProxy || fp.isDatacenter) suspiciousCount++;
      });

      const threatScore = Math.min(100, suspiciousCount * 20 + totalAssociatedUsers * 2);

      return {
        isBlocked: false,
        isSuspicious: threatScore > 40,
        isVPN: suspiciousCount > 0,
        isProxy: false,
        isDatacenter: false,
        threatScore,
      };
    } catch (error) {
      console.error('Error checking IP:', error);
      return { isBlocked: false, isSuspicious: false, isVPN: false, isProxy: false, isDatacenter: false, threatScore: 0 };
    }
  }

  /**
   * Block IP address
   */
  async blockIP(
    ip: string,
    reason: string,
    type: 'ip' | 'asn' | 'cidr',
    blockedBy: string,
    durationHours?: number
  ): Promise<void> {
    const block: IPBlock = {
      ip,
      reason,
      type,
      blockedBy,
      blockedAt: Timestamp.now(),
      expiresAt: durationHours
        ? new Timestamp(
            Math.floor(Date.now() / 1000) + durationHours * 3600,
            0
          )
        : undefined,
      isActive: true,
    };

    await setDoc(doc(this.db, 'ip_blocks', ip), block);
  }

  /**
   * Detect account farm network
   */
  async detectAccountFarm(userIds: string[]): Promise<{
    isLikelyFarm: boolean;
    confidence: number;
    sharedFactors: string[];
  }> {
    const sharedFactors: string[] = [];
    let confidencePoints = 0;

    // Check shared device fingerprints
    const fingerprintCounts: Record<string, number> = {};
    for (const userId of userIds) {
      const fpSnap = await getDocs(
        query(
          collection(this.db, 'device_fingerprints'),
          where('associatedUserIds', 'array-contains', userId)
        )
      );
      fpSnap.docs.forEach(d => {
        const fp = d.data() as DeviceFingerprint;
        fingerprintCounts[fp.fingerprint] =
          (fingerprintCounts[fp.fingerprint] || 0) + 1;
      });
    }

    const sharedFingerprints = Object.values(fingerprintCounts).filter(c => c > 1).length;
    if (sharedFingerprints > 0) {
      sharedFactors.push(`${sharedFingerprints} shared device fingerprints`);
      confidencePoints += sharedFingerprints * 25;
    }

    // Check registration timing (accounts created within minutes)
    const userDocs = await Promise.all(
      userIds.map(id => getDoc(doc(this.db, 'users', id)))
    );
    const createdAts = userDocs
      .filter(d => d.exists())
      .map(d => d.data()!.createdAt?.seconds || 0)
      .sort();

    if (createdAts.length > 1) {
      const timeRange = createdAts[createdAts.length - 1] - createdAts[0];
      if (timeRange < 3600) {
        // Created within 1 hour
        sharedFactors.push('Accounts created within 1 hour of each other');
        confidencePoints += 30;
      }
    }

    return {
      isLikelyFarm: confidencePoints > 50,
      confidence: Math.min(100, confidencePoints),
      sharedFactors,
    };
  }

  // ========================================================================
  // PRIVATE SCORING METHODS
  // ========================================================================

  private async scoreDevice(deviceData: any): Promise<number> {
    let score = 0;
    if (!deviceData.screenResolution) score += 20;
    if (!deviceData.timezone) score += 10;
    if (deviceData.userAgent?.includes('HeadlessChrome')) score += 50;
    if (deviceData.userAgent?.includes('PhantomJS')) score += 60;
    if (deviceData.userAgent?.includes('Selenium')) score += 70;
    return Math.min(100, score);
  }

  private async scoreBehavior(userId: string, behaviorData: any): Promise<number> {
    let score = 0;
    if (!behaviorData) return 50;
    if ((behaviorData.requestsPerMinute || 0) > 60) score += 40;
    if (behaviorData.mouseMovements === false) score += 30;
    if ((behaviorData.averageTypingSpeed || 0) > 150) score += 20;
    return Math.min(100, score);
  }

  private async scoreRequestPatterns(userId: string): Promise<number> {
    try {
      const recentEventsSnap = await getDocs(
        query(
          collection(this.db, 'security_events'),
          where('userId', '==', userId),
          where('type', 'in', [ThreatType.RATE_LIMIT_EXCEEDED, ThreatType.API_ABUSE])
        )
      );
      return Math.min(100, recentEventsSnap.size * 20);
    } catch {
      return 0;
    }
  }

  private async scoreIP(ipAddress: string): Promise<number> {
    const rep = await this.checkIPReputation(ipAddress);
    return rep.threatScore;
  }

  private async scoreAccount(userId: string): Promise<number> {
    try {
      const userSnap = await getDoc(doc(this.db, 'users', userId));
      if (!userSnap.exists()) return 50;
      const user = userSnap.data();
      const now = Math.floor(Date.now() / 1000);
      const accountAgeDays = (now - (user.createdAt?.seconds || now)) / 86400;
      if (accountAgeDays < 1) return 40;
      if (accountAgeDays < 7) return 20;
      return 0;
    } catch {
      return 20;
    }
  }

  private getVerdict(score: number): BotScore['verdict'] {
    if (score >= 85) return 'confirmed_bot';
    if (score >= 70) return 'likely_bot';
    if (score >= 45) return 'suspicious';
    return 'human';
  }

  private getRequiredActions(score: number, verdict: string): string[] {
    if (score >= 90) return ['suspend_immediately', 'flag_for_review', 'block_ip'];
    if (score >= 75) return ['require_captcha', 'require_email_verify', 'rate_limit'];
    if (score >= 60) return ['require_captcha', 'rate_limit'];
    if (score >= 45) return ['monitor', 'require_captcha_on_sensitive'];
    return [];
  }

  private async triggerAutoProtection(userId: string, botScore: BotScore): Promise<void> {
    if (botScore.verdict === 'confirmed_bot') {
      await updateDoc(doc(this.db, 'users', userId), {
        isSuspended: true,
        suspendedBy: 'bot_protection_system',
        suspensionReason: `Automated suspension: bot score ${botScore.overall}/100`,
        suspendedAt: Timestamp.now(),
      });
    } else if (botScore.verdict === 'likely_bot') {
      await updateDoc(doc(this.db, 'users', userId), {
        requiresCaptcha: true,
        isRateLimited: true,
      });
    }
  }

  private async storeFingerprint(
    userId: string,
    ipAddress: string,
    deviceData: any
  ): Promise<void> {
    const fingerprintHash = this.hashFingerprint(deviceData);
    const fpRef = doc(this.db, 'device_fingerprints', fingerprintHash);
    const existing = await getDoc(fpRef);

    if (existing.exists()) {
      const fp = existing.data() as DeviceFingerprint;
      const users = fp.associatedUserIds || [];
      if (!users.includes(userId)) users.push(userId);
      await updateDoc(fpRef, {
        lastSeenAt: Timestamp.now(),
        usageCount: (fp.usageCount || 0) + 1,
        associatedUserIds: users,
      });
    } else {
      await setDoc(fpRef, {
        id: fingerprintHash,
        fingerprint: fingerprintHash,
        userId,
        raw: deviceData,
        ipAddress,
        isVPN: false,
        isProxy: false,
        isDatacenter: false,
        firstSeenAt: Timestamp.now(),
        lastSeenAt: Timestamp.now(),
        usageCount: 1,
        associatedUserIds: [userId],
      } as DeviceFingerprint);
    }
  }

  private hashFingerprint(deviceData: any): string {
    const str = JSON.stringify({
      ua: deviceData.userAgent,
      sr: deviceData.screenResolution,
      tz: deviceData.timezone,
      lang: deviceData.language,
      plat: deviceData.platform,
    });
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(16);
  }
}

// ============================================================================
// SECURITY OPERATIONS CENTER SERVICE
// ============================================================================

class SecurityOperationsService {
  private db = getFirestore();

  /**
   * Record security event
   */
  async recordEvent(
    type: ThreatType,
    severity: SecurityEvent['severity'],
    sourceIP: string,
    details: any,
    userId?: string
  ): Promise<SecurityEvent> {
    const event: Omit<SecurityEvent, 'id'> = {
      type,
      severity,
      status: 'open',
      sourceIP,
      userId,
      details,
      autoMitigated: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Auto-mitigate critical events
    if (severity === 'critical') {
      event.autoMitigated = true;
      event.mitigationAction = await this.autoMitigate(type, sourceIP, userId);
      event.status = 'mitigated';
    }

    const ref = await addDoc(collection(this.db, 'security_events'), event);
    return { ...event, id: ref.id };
  }

  /**
   * Get dashboard summary
   */
  async getDashboardSummary(): Promise<{
    activeThreats: number;
    blockedIPs: number;
    eventsLast24h: number;
    criticalEvents: number;
    threatLevel: 'low' | 'medium' | 'high' | 'critical';
  }> {
    const dayAgo = new Timestamp(Math.floor(Date.now() / 1000) - 86400, 0);

    const [openThreats, blockedIPs, recent] = await Promise.all([
      getDocs(
        query(
          collection(this.db, 'security_events'),
          where('status', '==', 'open')
        )
      ),
      getDocs(
        query(
          collection(this.db, 'ip_blocks'),
          where('isActive', '==', true)
        )
      ),
      getDocs(
        query(
          collection(this.db, 'security_events'),
          where('createdAt', '>=', dayAgo)
        )
      ),
    ]);

    const criticalCount = recent.docs.filter(
      d => d.data().severity === 'critical'
    ).length;

    let threatLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (criticalCount > 5) threatLevel = 'critical';
    else if (criticalCount > 2) threatLevel = 'high';
    else if (openThreats.size > 10) threatLevel = 'medium';

    return {
      activeThreats: openThreats.size,
      blockedIPs: blockedIPs.size,
      eventsLast24h: recent.size,
      criticalEvents: criticalCount,
      threatLevel,
    };
  }

  /**
   * Detect brute force attack
   */
  async detectBruteForce(
    ipAddress: string,
    userId: string,
    windowMinutes: number = 15
  ): Promise<boolean> {
    const windowStart = new Timestamp(
      Math.floor(Date.now() / 1000) - windowMinutes * 60,
      0
    );

    const events = await getDocs(
      query(
        collection(this.db, 'security_events'),
        where('type', '==', ThreatType.FAILED_LOGIN),
        where('sourceIP', '==', ipAddress),
        where('createdAt', '>=', windowStart)
      )
    );

    if (events.size >= 5) {
      await this.recordEvent(
        ThreatType.BRUTE_FORCE,
        'high',
        ipAddress,
        { attempts: events.size, windowMinutes },
        userId
      );
      return true;
    }
    return false;
  }

  /**
   * Handle account takeover
   */
  async handleAccountTakeover(userId: string, sourceIP: string): Promise<void> {
    // Force logout all sessions
    await updateDoc(doc(this.db, 'users', userId), {
      sessionInvalidatedAt: Timestamp.now(),
      requiresReauth: true,
    });

    // Record event
    await this.recordEvent(
      ThreatType.ACCOUNT_TAKEOVER,
      'critical',
      sourceIP,
      { userId },
      userId
    );

    // Notify user
    // (handled by notification service integration)
  }

  private async autoMitigate(
    type: ThreatType,
    sourceIP: string,
    userId?: string
  ): Promise<string> {
    const botProtection = new BotProtectionService();

    if (
      type === ThreatType.BRUTE_FORCE ||
      type === ThreatType.CREDENTIAL_STUFFING
    ) {
      await botProtection.blockIP(sourceIP, type, 'ip', 'system', 24);
      return `IP ${sourceIP} blocked for 24 hours`;
    }

    if (type === ThreatType.ACCOUNT_TAKEOVER && userId) {
      await this.handleAccountTakeover(userId, sourceIP);
      return `Account ${userId} sessions terminated`;
    }

    return 'Monitored';
  }
}

export const botProtectionService = new BotProtectionService();
export const securityOpsService = new SecurityOperationsService();
