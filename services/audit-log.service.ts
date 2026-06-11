// File: services/audit-log.service.ts
// Immutable Audit Logging Service
// Every action is logged for compliance and security

import { getFirestore, collection, addDoc, query, where, orderBy, limit, getDocs, doc, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { getStorage, ref, uploadString } from 'firebase/storage';

// ============================================================================
// TYPES & ENUMS
// ============================================================================

export enum AuditAction {
  // User actions
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_SUSPENDED = 'USER_SUSPENDED',
  USER_BANNED = 'USER_BANNED',
  USER_DELETED = 'USER_DELETED',
  USER_VERIFIED = 'USER_VERIFIED',
  
  // Admin actions
  ADMIN_CREATED = 'ADMIN_CREATED',
  ADMIN_UPDATED = 'ADMIN_UPDATED',
  ADMIN_DELETED = 'ADMIN_DELETED',
  ROLE_ASSIGNED = 'ROLE_ASSIGNED',
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',
  
  // Content actions
  CONTENT_REMOVED = 'CONTENT_REMOVED',
  CONTENT_RESTORED = 'CONTENT_RESTORED',
  CONTENT_FLAGGED = 'CONTENT_FLAGGED',
  
  // Security actions
  THREAT_DETECTED = 'THREAT_DETECTED',
  IP_BLOCKED = 'IP_BLOCKED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  
  // Investigation actions
  INVESTIGATION_CREATED = 'INVESTIGATION_CREATED',
  INVESTIGATION_CLOSED = 'INVESTIGATION_CLOSED',
  STRIKE_APPLIED = 'STRIKE_APPLIED',
  
  // System actions
  EMERGENCY_MODE_ACTIVATED = 'EMERGENCY_MODE_ACTIVATED',
  MAINTENANCE_STARTED = 'MAINTENANCE_STARTED',
  BACKUP_CREATED = 'BACKUP_CREATED',
  
  // Financial actions
  PAYOUT_PROCESSED = 'PAYOUT_PROCESSED',
  DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',
  
  // Legal actions
  POLICY_UPDATED = 'POLICY_UPDATED',
  COPYRIGHT_CLAIM_FILED = 'COPYRIGHT_CLAIM_FILED',
}

export interface AuditLog {
  id: string;
  action: AuditAction;
  
  actor: {
    userId: string;
    email: string;
    ipAddress: string;
    userAgent?: string;
  };
  
  target: {
    type: string;
    id: string;
    name?: string;
  };
  
  details: {
    before?: any;
    after?: any;
    reason?: string;
    metadata?: any;
  };
  
  status: 'success' | 'failed';
  errorMessage?: string;
  
  timestamp: Timestamp;
  signature?: string;
  immutable: boolean;
}

// ============================================================================
// AUDIT LOG SERVICE CLASS
// ============================================================================

class AuditLogService {
  private db = getFirestore();
  private storage = getStorage();

  /**
   * Create an immutable audit log entry
   */
  async log(
    action: AuditAction,
    actor: { userId: string; email: string; ipAddress: string; userAgent?: string },
    target: { type: string; id: string; name?: string },
    details?: { before?: any; after?: any; reason?: string; metadata?: any }
  ): Promise<string> {
    try {
      const timestamp = Timestamp.now();
      const logId = this.generateLogId(timestamp);

      const auditLog: Omit<AuditLog, 'id'> = {
        action,
        actor,
        target,
        details: details || {},
        status: 'success',
        timestamp,
        immutable: true,
      };

      // Create signature for verification
      const signature = this.createSignature(auditLog);

      const finalLog: AuditLog = {
        ...auditLog,
        id: logId,
        signature,
      };

      // Write to Firestore
      await setDoc(doc(this.db, 'audit_logs', logId), finalLog);

      // Backup to Cloud Storage (immutable append-only log)
      await this.backupToStorage(finalLog);

      return logId;
    } catch (error) {
      console.error('Critical: Audit log failed', error);
      // MUST NOT THROW - audit logging is critical
      // Fall back to secondary logging
      return this.emergencyLog(action, actor, target);
    }
  }

  /**
   * Log a failed action
   */
  async logFailure(
    action: AuditAction,
    actor: { userId: string; email: string; ipAddress: string; userAgent?: string },
    target: { type: string; id: string },
    errorMessage: string
  ): Promise<string> {
    const timestamp = Timestamp.now();
    const logId = this.generateLogId(timestamp);

    const auditLog: AuditLog = {
      id: logId,
      action,
      actor,
      target,
      details: {},
      status: 'failed',
      errorMessage,
      timestamp,
      immutable: true,
    };

    try {
      await setDoc(doc(this.db, 'audit_logs', logId), auditLog);
      await this.backupToStorage(auditLog);
    } catch (error) {
      console.error('Error logging failure:', error);
    }

    return logId;
  }

  /**
   * Query audit logs with filters
   */
  async queryLogs(filters: {
    action?: AuditAction;
    actorId?: string;
    targetId?: string;
    targetType?: string;
    dateRange?: { start: Timestamp; end: Timestamp };
    limit?: number;
  }): Promise<AuditLog[]> {
    try {
      let q = query(collection(this.db, 'audit_logs'));

      const conditions = [];
      if (filters.action) conditions.push(where('action', '==', filters.action));
      if (filters.actorId) conditions.push(where('actor.userId', '==', filters.actorId));
      if (filters.targetId) conditions.push(where('target.id', '==', filters.targetId));
      if (filters.targetType) conditions.push(where('target.type', '==', filters.targetType));

      if (conditions.length > 0) {
        q = query(collection(this.db, 'audit_logs'), ...conditions);
      }

      q = query(q, orderBy('timestamp', 'desc'), limit(filters.limit || 100));

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AuditLog));
    } catch (error) {
      console.error('Error querying logs:', error);
      return [];
    }
  }

  /**
   * Get audit trail for specific admin
   */
  async getAdminAuditTrail(adminId: string, days: number = 30): Promise<AuditLog[]> {
    const startDate = new Timestamp(
      Math.floor(Date.now() / 1000) - days * 86400,
      0
    );

    const q = query(
      collection(this.db, 'audit_logs'),
      where('actor.userId', '==', adminId),
      where('timestamp', '>=', startDate),
      orderBy('timestamp', 'desc'),
      limit(500)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AuditLog));
  }

  /**
   * Verify audit log integrity
   */
  async verifyIntegrity(logId: string): Promise<{ valid: boolean; reason?: string }> {
    try {
      const docSnap = await getDocs(query(
        collection(this.db, 'audit_logs'),
        where('id', '==', logId)
      ));

      if (docSnap.empty) {
        return { valid: false, reason: 'Log not found' };
      }

      const auditLog = docSnap.docs[0].data() as AuditLog;
      const expectedSignature = this.createSignature({
        action: auditLog.action,
        actor: auditLog.actor,
        target: auditLog.target,
        details: auditLog.details,
        status: auditLog.status,
        timestamp: auditLog.timestamp,
        immutable: auditLog.immutable,
      });

      if (auditLog.signature !== expectedSignature) {
        return { valid: false, reason: 'Signature mismatch - log may have been tampered with' };
      }

      if (!auditLog.immutable) {
        return { valid: false, reason: 'Log marked as mutable' };
      }

      return { valid: true };
    } catch (error) {
      console.error('Error verifying log:', error);
      return { valid: false, reason: 'Verification failed' };
    }
  }

  /**
   * Export audit logs
   */
  async exportLogs(
    filters: any,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const logs = await this.queryLogs({ ...filters, limit: 10000 });

    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    } else if (format === 'csv') {
      return this.convertToCSV(logs);
    }

    throw new Error('Unsupported export format');
  }

  /**
   * Archive old logs
   */
  async archiveOldLogs(retentionDays: number = 2555): Promise<number> {
    const cutoffDate = new Timestamp(
      Math.floor(Date.now() / 1000) - retentionDays * 86400,
      0
    );

    const q = query(
      collection(this.db, 'audit_logs'),
      where('timestamp', '<', cutoffDate),
      limit(1000)
    );

    const snapshot = await getDocs(q);
    const batch = writeBatch(this.db);

    snapshot.docs.forEach(docSnap => {
      batch.set(doc(this.db, 'audit_logs_archive', docSnap.id), docSnap.data());
    });

    if (snapshot.docs.length > 0) {
      await batch.commit();
    }

    return snapshot.docs.length;
  }

  // ========================================================================
  // PRIVATE HELPER METHODS
  // ========================================================================

  private generateLogId(timestamp: Timestamp): string {
    return `${timestamp.seconds}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private createSignature(log: any): string {
    // Simple HMAC-like signature (in production use crypto library)
    const secret = process.env.AUDIT_LOG_SECRET || 'default-secret-key';
    const data = JSON.stringify({
      action: log.action,
      actor: log.actor,
      target: log.target,
      timestamp: log.timestamp,
    });
    
    // Use crypto library in production
    return this.simpleHash(data + secret);
  }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private async backupToStorage(auditLog: AuditLog): Promise<void> {
    try {
      const date = new Date(auditLog.timestamp.toDate());
      const dateKey = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
      
      const storageRef = ref(
        this.storage,
        `audit-logs/logs/${dateKey}/${auditLog.id}.json`
      );

      await uploadString(
        storageRef,
        JSON.stringify(auditLog),
        'raw',
        { customMetadata: { immutable: 'true' } }
      );
    } catch (error) {
      console.error('Error backing up to storage:', error);
      // Don't throw - backup is secondary
    }
  }

  private convertToCSV(logs: AuditLog[]): string {
    const headers = ['ID', 'Action', 'Actor ID', 'Actor Email', 'Target Type', 'Target ID', 'Status', 'Timestamp'];
    const rows = logs.map(log => [
      log.id,
      log.action,
      log.actor.userId,
      log.actor.email,
      log.target.type,
      log.target.id,
      log.status,
      new Date(log.timestamp.toDate()).toISOString(),
    ]);

    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');
  }

  private emergencyLog(action: AuditAction, actor: any, target: any): string {
    const logId = `emergency_${Date.now()}`;
    console.error(`CRITICAL AUDIT LOG ERROR - Action: ${action}, Actor: ${actor.userId}, Target: ${target.id}`);
    return logId;
  }
}

export default new AuditLogService();
