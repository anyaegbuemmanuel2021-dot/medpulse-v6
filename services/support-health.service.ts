// File: services/support-health.service.ts
// Support Center (ticketing, knowledge base) + Platform Health Monitoring

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
import notificationService from './notification.service';
import auditLogService, { AuditAction } from './audit-log.service';

// ============================================================================
// TYPES — SUPPORT CENTER
// ============================================================================

export type TicketCategory =
  | 'account'
  | 'billing'
  | 'content_appeal'
  | 'verification'
  | 'technical'
  | 'harassment_report'
  | 'copyright'
  | 'data_request'
  | 'feature_request'
  | 'bug_report'
  | 'other';

export type TicketStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'waiting_user'
  | 'escalated'
  | 'resolved'
  | 'closed';

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  userId: string;
  userEmail: string;

  category: TicketCategory;
  subject: string;
  description: string;
  attachments?: string[];

  status: TicketStatus;
  priority: TicketPriority;

  assignedTo?: string;
  escalatedTo?: string;

  tags: string[];

  messages: TicketMessage[];

  ratings?: {
    score: 1 | 2 | 3 | 4 | 5;
    comment?: string;
    ratedAt: Timestamp;
  };

  sla: {
    responseDeadline: Timestamp;
    resolutionDeadline: Timestamp;
    firstResponseAt?: Timestamp;
    resolvedAt?: Timestamp;
    breached: boolean;
  };

  relatedTicketIds?: string[];
  resolution?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TicketMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'user' | 'agent' | 'system';
  content: string;
  attachments?: string[];
  isInternal: boolean;      // Internal agent notes not visible to user
  createdAt: Timestamp;
}

export interface KnowledgeBaseArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  summary: string;
  category: string;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  helpful: number;
  notHelpful: number;
  viewCount: number;
  authorId: string;
  publishedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// SLA target times by priority
const SLA_TARGETS: Record<TicketPriority, { responseHours: number; resolutionHours: number }> = {
  critical: { responseHours: 1,  resolutionHours: 4  },
  high:     { responseHours: 4,  resolutionHours: 24 },
  medium:   { responseHours: 24, resolutionHours: 72 },
  low:      { responseHours: 48, resolutionHours: 168 },
};

// ============================================================================
// SUPPORT SERVICE
// ============================================================================

class SupportService {
  private db = getFirestore();

  // ========================================================================
  // TICKETS
  // ========================================================================

  /**
   * Create support ticket
   */
  async createTicket(
    userId: string,
    userEmail: string,
    category: TicketCategory,
    subject: string,
    description: string,
    attachments?: string[]
  ): Promise<SupportTicket> {
    const priority = this.autoAssignPriority(category, subject);
    const ticketNumber = this.generateTicketNumber();
    const sla = this.calculateSLA(priority);

    const ticket: Omit<SupportTicket, 'id'> = {
      ticketNumber,
      userId,
      userEmail,
      category,
      subject,
      description,
      attachments,
      status: 'open',
      priority,
      tags: [category],
      messages: [
        {
          id: this.generateId(),
          senderId: userId,
          senderName: userEmail,
          senderRole: 'user',
          content: description,
          attachments,
          isInternal: false,
          createdAt: Timestamp.now(),
        },
      ],
      sla: { ...sla, breached: false },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const ref = await addDoc(collection(this.db, 'support_tickets'), ticket);

    // Auto-assign agent
    await this.autoAssign(ref.id, category, priority);

    // Confirm to user
    await notificationService.sendNotification({
      userId,
      type: 'ticket_created',
      title: 'Support Ticket Created',
      message: `Ticket #${ticketNumber} has been created. We'll respond within ${SLA_TARGETS[priority].responseHours} hours.`,
      data: { ticketId: ref.id, ticketNumber },
    });

    return { ...ticket, id: ref.id } as SupportTicket;
  }

  /**
   * Add message to ticket
   */
  async addMessage(
    ticketId: string,
    senderId: string,
    senderName: string,
    senderRole: 'user' | 'agent' | 'system',
    content: string,
    isInternal: boolean = false,
    attachments?: string[]
  ): Promise<TicketMessage> {
    const ticketSnap = await getDoc(doc(this.db, 'support_tickets', ticketId));
    if (!ticketSnap.exists()) throw new Error('Ticket not found');
    const ticket = ticketSnap.data() as SupportTicket;

    const message: TicketMessage = {
      id: this.generateId(),
      senderId,
      senderName,
      senderRole,
      content,
      attachments,
      isInternal,
      createdAt: Timestamp.now(),
    };

    const messages = [...(ticket.messages || []), message];

    const update: any = {
      messages,
      updatedAt: Timestamp.now(),
    };

    // Record first response time (SLA)
    if (senderRole === 'agent' && !ticket.sla.firstResponseAt) {
      update['sla.firstResponseAt'] = Timestamp.now();
    }

    // Set status
    if (senderRole === 'agent' && ticket.status === 'open') {
      update.status = 'in_progress';
    } else if (senderRole === 'user' && ticket.status === 'waiting_user') {
      update.status = 'in_progress';
    }

    await updateDoc(doc(this.db, 'support_tickets', ticketId), update);

    // Notify the other party (if not internal)
    if (!isInternal) {
      const notifyUserId =
        senderRole === 'agent' ? ticket.userId : ticket.assignedTo;
      if (notifyUserId) {
        await notificationService.sendNotification({
          userId: notifyUserId,
          type: 'ticket_reply',
          title: `Reply on Ticket #${ticket.ticketNumber}`,
          message:
            content.length > 100 ? content.substring(0, 97) + '...' : content,
          data: { ticketId, ticketNumber: ticket.ticketNumber },
        });
      }
    }

    return message;
  }

  /**
   * Update ticket status
   */
  async updateStatus(
    ticketId: string,
    status: TicketStatus,
    agentId: string,
    resolution?: string
  ): Promise<void> {
    const update: any = { status, updatedAt: Timestamp.now() };

    if (status === 'resolved' || status === 'closed') {
      update['sla.resolvedAt'] = Timestamp.now();
      if (resolution) update.resolution = resolution;
    }

    await updateDoc(doc(this.db, 'support_tickets', ticketId), update);

    if (status === 'resolved') {
      const ticket = (
        await getDoc(doc(this.db, 'support_tickets', ticketId))
      ).data() as SupportTicket;

      await notificationService.sendNotification({
        userId: ticket.userId,
        type: 'ticket_resolved',
        title: `Ticket #${ticket.ticketNumber} Resolved`,
        message:
          resolution || 'Your support ticket has been resolved.',
        data: { ticketId, ticketNumber: ticket.ticketNumber },
      });
    }
  }

  /**
   * Assign ticket to agent
   */
  async assignTicket(
    ticketId: string,
    agentId: string,
    assignedBy: string
  ): Promise<void> {
    await updateDoc(doc(this.db, 'support_tickets', ticketId), {
      assignedTo: agentId,
      status: 'assigned',
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Escalate ticket
   */
  async escalateTicket(
    ticketId: string,
    escalatedTo: string,
    reason: string,
    escalatedBy: string
  ): Promise<void> {
    const ticket = (
      await getDoc(doc(this.db, 'support_tickets', ticketId))
    ).data() as SupportTicket;

    await updateDoc(doc(this.db, 'support_tickets', ticketId), {
      status: 'escalated',
      escalatedTo,
      priority: 'high',
      updatedAt: Timestamp.now(),
    });

    await this.addMessage(
      ticketId,
      escalatedBy,
      'System',
      'system',
      `Ticket escalated to ${escalatedTo}. Reason: ${reason}`,
      true
    );
  }

  /**
   * Submit user rating
   */
  async rateTicket(
    ticketId: string,
    userId: string,
    score: 1 | 2 | 3 | 4 | 5,
    comment?: string
  ): Promise<void> {
    const ticket = (
      await getDoc(doc(this.db, 'support_tickets', ticketId))
    ).data() as SupportTicket;

    if (ticket.userId !== userId) throw new Error('Only ticket owner can rate');
    if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
      throw new Error('Can only rate resolved tickets');
    }

    await updateDoc(doc(this.db, 'support_tickets', ticketId), {
      ratings: { score, comment, ratedAt: Timestamp.now() },
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Get tickets for user
   */
  async getUserTickets(userId: string): Promise<SupportTicket[]> {
    const q = query(
      collection(this.db, 'support_tickets'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as SupportTicket));
  }

  /**
   * Get all open tickets (admin view)
   */
  async getOpenTickets(assignedTo?: string): Promise<SupportTicket[]> {
    let q = query(
      collection(this.db, 'support_tickets'),
      where('status', 'in', ['open', 'assigned', 'in_progress', 'escalated']),
      orderBy('createdAt', 'asc')
    );
    if (assignedTo) {
      q = query(
        collection(this.db, 'support_tickets'),
        where('status', 'in', ['open', 'assigned', 'in_progress', 'escalated']),
        where('assignedTo', '==', assignedTo),
        orderBy('createdAt', 'asc')
      );
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as SupportTicket));
  }

  // ========================================================================
  // KNOWLEDGE BASE
  // ========================================================================

  /**
   * Create knowledge base article
   */
  async createArticle(
    title: string,
    content: string,
    summary: string,
    category: string,
    tags: string[],
    authorId: string
  ): Promise<KnowledgeBaseArticle> {
    const article: Omit<KnowledgeBaseArticle, 'id'> = {
      title,
      slug: this.slugify(title),
      content,
      summary,
      category,
      tags,
      status: 'draft',
      helpful: 0,
      notHelpful: 0,
      viewCount: 0,
      authorId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    const ref = await addDoc(collection(this.db, 'knowledge_base'), article);
    return { ...article, id: ref.id } as KnowledgeBaseArticle;
  }

  /**
   * Publish article
   */
  async publishArticle(articleId: string, publishedBy: string): Promise<void> {
    await updateDoc(doc(this.db, 'knowledge_base', articleId), {
      status: 'published',
      publishedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Search knowledge base
   */
  async searchArticles(searchTerm: string): Promise<KnowledgeBaseArticle[]> {
    const q = query(
      collection(this.db, 'knowledge_base'),
      where('status', '==', 'published'),
      orderBy('viewCount', 'desc')
    );
    const snap = await getDocs(q);
    const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as KnowledgeBaseArticle));
    const term = searchTerm.toLowerCase();
    return all.filter(
      a =>
        a.title.toLowerCase().includes(term) ||
        a.summary.toLowerCase().includes(term) ||
        a.tags.some(t => t.toLowerCase().includes(term))
    );
  }

  /**
   * Rate article helpfulness
   */
  async rateArticle(
    articleId: string,
    helpful: boolean
  ): Promise<void> {
    const snap = await getDoc(doc(this.db, 'knowledge_base', articleId));
    const data = snap.data() as KnowledgeBaseArticle;
    await updateDoc(doc(this.db, 'knowledge_base', articleId), {
      helpful: helpful ? (data.helpful || 0) + 1 : data.helpful,
      notHelpful: !helpful ? (data.notHelpful || 0) + 1 : data.notHelpful,
    });
  }

  // ========================================================================
  // PRIVATE HELPERS
  // ========================================================================

  private autoAssignPriority(
    category: TicketCategory,
    subject: string
  ): TicketPriority {
    if (category === 'harassment_report') return 'high';
    if (category === 'billing') return 'high';
    if (category === 'bug_report' && subject.toLowerCase().includes('critical')) return 'critical';
    if (category === 'content_appeal') return 'medium';
    return 'low';
  }

  private calculateSLA(priority: TicketPriority): Omit<SupportTicket['sla'], 'breached'> {
    const targets = SLA_TARGETS[priority];
    const now = Math.floor(Date.now() / 1000);
    return {
      responseDeadline: new Timestamp(now + targets.responseHours * 3600, 0),
      resolutionDeadline: new Timestamp(now + targets.resolutionHours * 3600, 0),
    };
  }

  private generateTicketNumber(): string {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `TKT-${timestamp}-${random}`;
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 16);
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w ]+/g, '')
      .replace(/ +/g, '-');
  }

  private async autoAssign(
    ticketId: string,
    category: TicketCategory,
    priority: TicketPriority
  ): Promise<void> {
    // In production, query available agents by workload
    // For now, notify admin
    await addDoc(collection(this.db, 'admin_notifications'), {
      type: 'ticket_needs_assignment',
      ticketId,
      category,
      priority,
      createdAt: Timestamp.now(),
      isRead: false,
    });
  }
}

// ============================================================================
// TYPES — PLATFORM HEALTH
// ============================================================================

export type ServiceName =
  | 'api'
  | 'database'
  | 'queue'
  | 'search'
  | 'storage'
  | 'cache'
  | 'cdn'
  | 'auth'
  | 'messaging';

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface ServiceHealth {
  service: ServiceName;
  status: HealthStatus;
  latency?: number;          // ms
  errorRate?: number;        // %
  message?: string;
  checkedAt: Timestamp;
}

export interface PlatformHealthSnapshot {
  id: string;
  overallStatus: HealthStatus;
  services: Record<ServiceName, ServiceHealth>;
  activeIncidents: HealthIncident[];
  metrics: {
    requestsPerMinute: number;
    avgLatencyMs: number;
    errorRate: number;
    activeUsers: number;
    dbReads: number;
    dbWrites: number;
    storageUsedPercent: number;
  };
  recordedAt: Timestamp;
}

export interface HealthIncident {
  id: string;
  title: string;
  description: string;
  affectedServices: ServiceName[];
  severity: 'minor' | 'major' | 'critical';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  startedAt: Timestamp;
  resolvedAt?: Timestamp;
  updates: { message: string; timestamp: Timestamp }[];
}

export interface HealthAlert {
  id: string;
  service: ServiceName;
  metric: string;
  threshold: number;
  currentValue: number;
  severity: 'warning' | 'critical';
  isActive: boolean;
  triggeredAt: Timestamp;
  resolvedAt?: Timestamp;
}

// ============================================================================
// PLATFORM HEALTH SERVICE
// ============================================================================

class PlatformHealthService {
  private db = getFirestore();

  /**
   * Record a health snapshot
   */
  async recordHealthSnapshot(
    services: Record<ServiceName, ServiceHealth>,
    metrics: PlatformHealthSnapshot['metrics']
  ): Promise<PlatformHealthSnapshot> {
    const overallStatus = this.calculateOverallStatus(services);

    const snapshot: Omit<PlatformHealthSnapshot, 'id'> = {
      overallStatus,
      services,
      activeIncidents: await this.getActiveIncidents(),
      metrics,
      recordedAt: Timestamp.now(),
    };

    const ref = await addDoc(
      collection(this.db, 'platform_health'),
      snapshot
    );

    // Check thresholds and fire alerts
    await this.checkThresholds(services, metrics);

    return { ...snapshot, id: ref.id } as PlatformHealthSnapshot;
  }

  /**
   * Get latest health snapshot
   */
  async getLatestSnapshot(): Promise<PlatformHealthSnapshot | null> {
    const q = query(
      collection(this.db, 'platform_health'),
      orderBy('recordedAt', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { ...snap.docs[0].data(), id: snap.docs[0].id } as PlatformHealthSnapshot;
  }

  /**
   * Get health history
   */
  async getHealthHistory(hours: number = 24): Promise<PlatformHealthSnapshot[]> {
    const since = new Timestamp(
      Math.floor(Date.now() / 1000) - hours * 3600,
      0
    );
    const q = query(
      collection(this.db, 'platform_health'),
      where('recordedAt', '>=', since),
      orderBy('recordedAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as PlatformHealthSnapshot));
  }

  /**
   * Create health incident
   */
  async createIncident(
    title: string,
    description: string,
    affectedServices: ServiceName[],
    severity: HealthIncident['severity']
  ): Promise<HealthIncident> {
    const incident: Omit<HealthIncident, 'id'> = {
      title,
      description,
      affectedServices,
      severity,
      status: 'investigating',
      startedAt: Timestamp.now(),
      updates: [{ message: description, timestamp: Timestamp.now() }],
    };
    const ref = await addDoc(collection(this.db, 'health_incidents'), incident);
    return { ...incident, id: ref.id } as HealthIncident;
  }

  /**
   * Update health incident
   */
  async updateIncident(
    incidentId: string,
    status: HealthIncident['status'],
    update: string
  ): Promise<void> {
    const snap = await getDoc(doc(this.db, 'health_incidents', incidentId));
    const incident = snap.data() as HealthIncident;

    const updateEntry = { message: update, timestamp: Timestamp.now() };

    await updateDoc(doc(this.db, 'health_incidents', incidentId), {
      status,
      updates: [...(incident.updates || []), updateEntry],
      resolvedAt: status === 'resolved' ? Timestamp.now() : null,
    });
  }

  /**
   * Get active incidents
   */
  async getActiveIncidents(): Promise<HealthIncident[]> {
    const q = query(
      collection(this.db, 'health_incidents'),
      where('status', 'in', ['investigating', 'identified', 'monitoring'])
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as HealthIncident));
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(): Promise<HealthAlert[]> {
    const q = query(
      collection(this.db, 'health_alerts'),
      where('isActive', '==', true)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as HealthAlert));
  }

  /**
   * Subscribe to health status (for live dashboard)
   */
  subscribeToHealth(
    callback: (snapshot: PlatformHealthSnapshot | null) => void
  ): () => void {
    const q = query(
      collection(this.db, 'platform_health'),
      orderBy('recordedAt', 'desc'),
      limit(1)
    );
    return onSnapshot(q, snap => {
      if (snap.empty) { callback(null); return; }
      callback({ ...snap.docs[0].data(), id: snap.docs[0].id } as PlatformHealthSnapshot);
    });
  }

  // ========================================================================
  // PRIVATE
  // ========================================================================

  private calculateOverallStatus(
    services: Record<ServiceName, ServiceHealth>
  ): HealthStatus {
    const statuses = Object.values(services).map(s => s.status);
    if (statuses.includes('down')) return 'down';
    if (statuses.includes('degraded')) return 'degraded';
    if (statuses.every(s => s === 'healthy')) return 'healthy';
    return 'unknown';
  }

  private async checkThresholds(
    services: Record<ServiceName, ServiceHealth>,
    metrics: PlatformHealthSnapshot['metrics']
  ): Promise<void> {
    const alerts: Omit<HealthAlert, 'id'>[] = [];

    // Check service health
    for (const [name, health] of Object.entries(services)) {
      if (health.status === 'down') {
        alerts.push({
          service: name as ServiceName,
          metric: 'status',
          threshold: 0,
          currentValue: 0,
          severity: 'critical',
          isActive: true,
          triggeredAt: Timestamp.now(),
        });
      }
      if ((health.latency || 0) > 5000) {
        alerts.push({
          service: name as ServiceName,
          metric: 'latency_ms',
          threshold: 5000,
          currentValue: health.latency || 0,
          severity: 'critical',
          isActive: true,
          triggeredAt: Timestamp.now(),
        });
      }
    }

    // Check system metrics
    if (metrics.errorRate > 5) {
      alerts.push({
        service: 'api',
        metric: 'error_rate_percent',
        threshold: 5,
        currentValue: metrics.errorRate,
        severity: metrics.errorRate > 10 ? 'critical' : 'warning',
        isActive: true,
        triggeredAt: Timestamp.now(),
      });
    }

    if (metrics.storageUsedPercent > 85) {
      alerts.push({
        service: 'storage',
        metric: 'storage_used_percent',
        threshold: 85,
        currentValue: metrics.storageUsedPercent,
        severity: metrics.storageUsedPercent > 95 ? 'critical' : 'warning',
        isActive: true,
        triggeredAt: Timestamp.now(),
      });
    }

    // Persist alerts
    for (const alert of alerts) {
      await addDoc(collection(this.db, 'health_alerts'), alert);
    }

    // Notify admins if critical
    if (alerts.some(a => a.severity === 'critical')) {
      await addDoc(collection(this.db, 'admin_notifications'), {
        type: 'health_critical',
        title: 'Critical Platform Health Alert',
        message: `${alerts.filter(a => a.severity === 'critical').length} critical health alert(s) detected`,
        alerts,
        createdAt: Timestamp.now(),
        priority: 'critical',
        isRead: false,
      });
    }
  }
}

export const supportService = new SupportService();
export const platformHealthService = new PlatformHealthService();
