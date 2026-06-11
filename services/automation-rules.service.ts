// File: services/automation-rules.service.ts
// No-Code Automation Rule Engine
// Visual rule builder with real-time trigger/action execution

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import auditLogService, { AuditAction } from './audit-log.service';
import notificationService from './notification.service';

// ============================================================================
// TYPES
// ============================================================================

export enum RuleTrigger {
  // Account triggers
  ACCOUNT_CREATED       = 'account_created',
  ACCOUNT_AGE_REACHED   = 'account_age_reached',
  LOGIN_FAILED          = 'login_failed',
  LOGIN_SUCCESS         = 'login_success',

  // Content triggers
  POST_CREATED          = 'post_created',
  POST_REPORTED         = 'post_reported',
  REPORT_THRESHOLD      = 'report_threshold',
  CONTENT_UPLOADED      = 'content_uploaded',

  // User behaviour triggers
  POSTING_RATE_HIGH     = 'posting_rate_high',
  MESSAGE_RATE_HIGH     = 'message_rate_high',
  FOLLOW_RATE_HIGH      = 'follow_rate_high',

  // Score triggers
  TRUST_SCORE_BELOW     = 'trust_score_below',
  RISK_SCORE_ABOVE      = 'risk_score_above',
  BOT_SCORE_ABOVE       = 'bot_score_above',

  // Strike triggers
  STRIKE_APPLIED        = 'strike_applied',
  STRIKE_COUNT_REACHED  = 'strike_count_reached',

  // Verification triggers
  VERIFICATION_SUBMITTED = 'verification_submitted',
  VERIFICATION_EXPIRED   = 'verification_expired',

  // Financial triggers
  PAYOUT_REQUESTED      = 'payout_requested',
  CHARGEBACK_DETECTED   = 'chargeback_detected',
}

export enum RuleAction {
  // User restrictions
  REQUIRE_CAPTCHA       = 'require_captcha',
  REQUIRE_EMAIL_VERIFY  = 'require_email_verify',
  REQUIRE_PHONE_VERIFY  = 'require_phone_verify',
  RESTRICT_POSTING      = 'restrict_posting',
  RESTRICT_MESSAGING    = 'restrict_messaging',
  RESTRICT_UPLOADS      = 'restrict_uploads',
  RESTRICT_COMMENTS     = 'restrict_comments',
  SHADOW_BAN            = 'shadow_ban',
  SUSPEND_ACCOUNT       = 'suspend_account',
  BAN_ACCOUNT           = 'ban_account',
  LOCK_ACCOUNT          = 'lock_account',

  // Content actions
  HIDE_CONTENT          = 'hide_content',
  REMOVE_CONTENT        = 'remove_content',
  QUARANTINE_CONTENT    = 'quarantine_content',
  FLAG_FOR_REVIEW       = 'flag_for_review',
  REQUIRE_MODERATION    = 'require_moderation',

  // System actions
  NOTIFY_ADMIN          = 'notify_admin',
  CREATE_INVESTIGATION  = 'create_investigation',
  BLOCK_IP              = 'block_ip',
  RATE_LIMIT            = 'rate_limit',
  LOG_EVENT             = 'log_event',

  // User notifications
  WARN_USER             = 'warn_user',
  NOTIFY_USER           = 'notify_user',
  SEND_EMAIL            = 'send_email',
}

export type ConditionOperator = '>' | '<' | '>=' | '<=' | '==' | '!=' | 'in' | 'not_in' | 'contains' | 'not_contains';

export interface RuleCondition {
  field: string;
  operator: ConditionOperator;
  value: any;
  unit?: 'hours' | 'days' | 'minutes' | 'count' | 'score';
}

export interface RuleConditionGroup {
  logic: 'AND' | 'OR';
  conditions: RuleCondition[];
  groups?: RuleConditionGroup[];
}

export interface RuleActionConfig {
  action: RuleAction;
  parameters: {
    duration?: number;          // ms for time-based restrictions
    message?: string;           // for notifications/warnings
    adminEmail?: string;        // for admin notifications
    investigationType?: string; // for investigations
    maxCount?: number;          // for rate limits
    windowMs?: number;          // for rate limit window
    delayMs?: number;           // delay before executing
    reason?: string;
  };
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  priority: number;             // 1-100 (higher runs first)

  trigger: RuleTrigger;
  conditionGroup: RuleConditionGroup;
  actions: RuleActionConfig[];

  // Limits
  maxExecutionsPerUser?: number;
  maxExecutionsPerDay?: number;
  cooldownMs?: number;          // min time between executions per user

  // Metadata
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;

  stats: {
    totalExecutions: number;
    successCount: number;
    errorCount: number;
    lastExecutedAt?: Timestamp;
  };

  tags: string[];
}

export interface RuleExecution {
  id: string;
  ruleId: string;
  ruleName: string;
  trigger: RuleTrigger;
  context: any;
  conditionsMet: boolean;
  actionsExecuted: { action: RuleAction; success: boolean; error?: string }[];
  executedAt: Timestamp;
  duration: number;             // ms
}

// ============================================================================
// AUTOMATION RULE ENGINE
// ============================================================================

class AutomationRulesService {
  private db = getFirestore();

  // ========================================================================
  // RULE MANAGEMENT
  // ========================================================================

  /**
   * Create automation rule
   */
  async createRule(
    name: string,
    description: string,
    trigger: RuleTrigger,
    conditionGroup: RuleConditionGroup,
    actions: RuleActionConfig[],
    createdBy: string,
    options?: {
      priority?: number;
      maxExecutionsPerUser?: number;
      maxExecutionsPerDay?: number;
      cooldownMs?: number;
      tags?: string[];
    }
  ): Promise<AutomationRule> {
    const rule: Omit<AutomationRule, 'id'> = {
      name,
      description,
      isActive: true,
      priority: options?.priority ?? 50,
      trigger,
      conditionGroup,
      actions,
      maxExecutionsPerUser: options?.maxExecutionsPerUser,
      maxExecutionsPerDay: options?.maxExecutionsPerDay,
      cooldownMs: options?.cooldownMs,
      createdBy,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      stats: {
        totalExecutions: 0,
        successCount: 0,
        errorCount: 0,
      },
      tags: options?.tags ?? [],
    };

    const ref = await addDoc(collection(this.db, 'automation_rules'), rule);

    await auditLogService.log(
      AuditAction.INVESTIGATION_CREATED, // reuse closest action
      { userId: createdBy, email: '', ipAddress: '' },
      { type: 'automation_rule', id: ref.id },
      { metadata: { name, trigger } }
    );

    return { ...rule, id: ref.id } as AutomationRule;
  }

  /**
   * Update existing rule
   */
  async updateRule(
    ruleId: string,
    updates: Partial<Omit<AutomationRule, 'id' | 'createdBy' | 'createdAt' | 'stats'>>,
    updatedBy: string
  ): Promise<void> {
    await updateDoc(doc(this.db, 'automation_rules', ruleId), {
      ...updates,
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Enable or disable rule
   */
  async setRuleActive(ruleId: string, isActive: boolean, updatedBy: string): Promise<void> {
    await updateDoc(doc(this.db, 'automation_rules', ruleId), {
      isActive,
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Delete rule
   */
  async deleteRule(ruleId: string, deletedBy: string): Promise<void> {
    await deleteDoc(doc(this.db, 'automation_rules', ruleId));
  }

  /**
   * List all rules
   */
  async listRules(onlyActive = false): Promise<AutomationRule[]> {
    let q = query(
      collection(this.db, 'automation_rules'),
      orderBy('priority', 'desc')
    );

    if (onlyActive) {
      q = query(
        collection(this.db, 'automation_rules'),
        where('isActive', '==', true),
        orderBy('priority', 'desc')
      );
    }

    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as AutomationRule));
  }

  /**
   * Get rules for a specific trigger
   */
  async getRulesForTrigger(trigger: RuleTrigger): Promise<AutomationRule[]> {
    const q = query(
      collection(this.db, 'automation_rules'),
      where('trigger', '==', trigger),
      where('isActive', '==', true),
      orderBy('priority', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as AutomationRule));
  }

  // ========================================================================
  // RULE EXECUTION ENGINE
  // ========================================================================

  /**
   * Main entry point: evaluate all rules for a trigger event
   */
  async evaluate(
    trigger: RuleTrigger,
    context: Record<string, any>
  ): Promise<RuleExecution[]> {
    try {
      const rules = await this.getRulesForTrigger(trigger);
      const executions: RuleExecution[] = [];

      for (const rule of rules) {
        // Cooldown check
        if (rule.cooldownMs && context.userId) {
          const inCooldown = await this.isInCooldown(
            rule.id,
            context.userId,
            rule.cooldownMs
          );
          if (inCooldown) continue;
        }

        // Execution cap check
        if (rule.maxExecutionsPerUser && context.userId) {
          const count = await this.getExecutionCount(rule.id, context.userId);
          if (count >= rule.maxExecutionsPerUser) continue;
        }

        const start = Date.now();
        const conditionsMet = this.evaluateConditionGroup(
          rule.conditionGroup,
          context
        );

        if (!conditionsMet) {
          continue;
        }

        const actionsExecuted: RuleExecution['actionsExecuted'] = [];

        // Execute actions
        for (const actionConfig of rule.actions) {
          // Handle delay
          if (actionConfig.parameters.delayMs) {
            setTimeout(
              () => this.executeAction(actionConfig, context),
              actionConfig.parameters.delayMs
            );
            actionsExecuted.push({ action: actionConfig.action, success: true });
            continue;
          }

          const result = await this.executeAction(actionConfig, context);
          actionsExecuted.push(result);
        }

        const execution: Omit<RuleExecution, 'id'> = {
          ruleId: rule.id,
          ruleName: rule.name,
          trigger,
          context,
          conditionsMet: true,
          actionsExecuted,
          executedAt: Timestamp.now(),
          duration: Date.now() - start,
        };

        const ref = await addDoc(
          collection(this.db, 'rule_executions'),
          execution
        );

        executions.push({ ...execution, id: ref.id } as RuleExecution);

        // Update rule stats
        const allSuccess = actionsExecuted.every(a => a.success);
        await updateDoc(doc(this.db, 'automation_rules', rule.id), {
          'stats.totalExecutions': (rule.stats.totalExecutions || 0) + 1,
          [`stats.${allSuccess ? 'successCount' : 'errorCount'}`]:
            (allSuccess ? rule.stats.successCount : rule.stats.errorCount || 0) + 1,
          'stats.lastExecutedAt': Timestamp.now(),
        });
      }

      return executions;
    } catch (error) {
      console.error('Error evaluating rules:', error);
      return [];
    }
  }

  // ========================================================================
  // CONDITION EVALUATION
  // ========================================================================

  private evaluateConditionGroup(
    group: RuleConditionGroup,
    context: Record<string, any>
  ): boolean {
    const results = group.conditions.map(c =>
      this.evaluateCondition(c, context)
    );

    const subGroupResults = (group.groups || []).map(g =>
      this.evaluateConditionGroup(g, context)
    );

    const all = [...results, ...subGroupResults];

    return group.logic === 'AND' ? all.every(r => r) : all.some(r => r);
  }

  private evaluateCondition(
    condition: RuleCondition,
    context: Record<string, any>
  ): boolean {
    const value = this.getNestedValue(context, condition.field);
    const target = condition.value;

    switch (condition.operator) {
      case '>':  return Number(value) > Number(target);
      case '<':  return Number(value) < Number(target);
      case '>=': return Number(value) >= Number(target);
      case '<=': return Number(value) <= Number(target);
      case '==': return value == target;
      case '!=': return value != target;
      case 'in':
        return Array.isArray(target) && target.includes(value);
      case 'not_in':
        return Array.isArray(target) && !target.includes(value);
      case 'contains':
        return String(value).includes(String(target));
      case 'not_contains':
        return !String(value).includes(String(target));
      default:
        return false;
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // ========================================================================
  // ACTION EXECUTION
  // ========================================================================

  private async executeAction(
    config: RuleActionConfig,
    context: Record<string, any>
  ): Promise<{ action: RuleAction; success: boolean; error?: string }> {
    const { action, parameters } = config;
    const userId = context.userId as string;

    try {
      switch (action) {
        case RuleAction.REQUIRE_CAPTCHA:
          await updateDoc(doc(this.db, 'users', userId), {
            requiresCaptcha: true,
            captchaRequiredAt: Timestamp.now(),
          });
          break;

        case RuleAction.RESTRICT_POSTING:
          await updateDoc(doc(this.db, 'users', userId), {
            postingRestricted: true,
            postingRestrictedUntil: parameters.duration
              ? new Timestamp(
                  Math.floor(Date.now() / 1000) + parameters.duration / 1000,
                  0
                )
              : null,
            postingRestrictedReason: parameters.reason || 'Automated restriction',
          });
          break;

        case RuleAction.RESTRICT_MESSAGING:
          await updateDoc(doc(this.db, 'users', userId), {
            messagingRestricted: true,
            messagingRestrictedUntil: parameters.duration
              ? new Timestamp(
                  Math.floor(Date.now() / 1000) + parameters.duration / 1000,
                  0
                )
              : null,
          });
          break;

        case RuleAction.RESTRICT_UPLOADS:
          await updateDoc(doc(this.db, 'users', userId), {
            uploadsRestricted: true,
            uploadsRestrictedUntil: parameters.duration
              ? new Timestamp(
                  Math.floor(Date.now() / 1000) + parameters.duration / 1000,
                  0
                )
              : null,
          });
          break;

        case RuleAction.SHADOW_BAN:
          await updateDoc(doc(this.db, 'users', userId), {
            isShadowBanned: true,
            shadowBannedAt: Timestamp.now(),
            shadowBannedReason: parameters.reason || 'Automated shadow ban',
          });
          break;

        case RuleAction.SUSPEND_ACCOUNT:
          await updateDoc(doc(this.db, 'users', userId), {
            isSuspended: true,
            suspendedAt: Timestamp.now(),
            suspendedBy: 'automation',
            suspensionReason: parameters.reason || 'Automated suspension',
            suspensionExpiresAt: parameters.duration
              ? new Timestamp(
                  Math.floor(Date.now() / 1000) + parameters.duration / 1000,
                  0
                )
              : null,
          });
          break;

        case RuleAction.BAN_ACCOUNT:
          await updateDoc(doc(this.db, 'users', userId), {
            isBanned: true,
            bannedAt: Timestamp.now(),
            bannedBy: 'automation',
            banReason: parameters.reason || 'Automated ban',
          });
          break;

        case RuleAction.LOCK_ACCOUNT:
          await updateDoc(doc(this.db, 'users', userId), {
            isLocked: true,
            lockedAt: Timestamp.now(),
            lockedReason: parameters.reason || 'Automated lock',
          });
          break;

        case RuleAction.HIDE_CONTENT:
          if (context.contentId) {
            await updateDoc(
              doc(this.db, 'posts', context.contentId as string),
              { isHidden: true, hiddenAt: Timestamp.now() }
            );
          }
          break;

        case RuleAction.REMOVE_CONTENT:
          if (context.contentId) {
            await updateDoc(
              doc(this.db, 'posts', context.contentId as string),
              { isRemoved: true, removedAt: Timestamp.now(), removedBy: 'automation' }
            );
          }
          break;

        case RuleAction.FLAG_FOR_REVIEW:
          await addDoc(collection(this.db, 'moderation_queue'), {
            userId,
            contentId: context.contentId,
            reason: parameters.reason || 'Flagged by automation rule',
            priority: 'high',
            createdAt: Timestamp.now(),
            source: 'automation',
          });
          break;

        case RuleAction.CREATE_INVESTIGATION:
          await addDoc(collection(this.db, 'investigations'), {
            type: parameters.investigationType || 'automated_detection',
            reportedUserId: userId,
            status: 'submitted',
            description: parameters.reason || 'Auto-detected by rule engine',
            timeline: { submittedAt: Timestamp.now() },
            isConfidential: false,
            createdBy: 'automation',
          });
          break;

        case RuleAction.NOTIFY_ADMIN:
          await addDoc(collection(this.db, 'admin_notifications'), {
            title: 'Automation Rule Triggered',
            message: parameters.message || `Rule triggered for user ${userId}`,
            userId,
            context,
            createdAt: Timestamp.now(),
            isRead: false,
          });
          break;

        case RuleAction.WARN_USER:
          await notificationService.sendNotification({
            userId,
            type: 'account_warning',
            title: 'Account Warning',
            message:
              parameters.message ||
              'Your account has received a warning for violating our guidelines.',
            data: { reason: parameters.reason },
          });
          break;

        case RuleAction.LOG_EVENT:
          await addDoc(collection(this.db, 'security_events'), {
            type: 'automation_trigger',
            userId,
            context,
            message: parameters.message,
            createdAt: Timestamp.now(),
          });
          break;

        case RuleAction.RATE_LIMIT:
          await updateDoc(doc(this.db, 'users', userId), {
            isRateLimited: true,
            rateLimitedUntil: parameters.duration
              ? new Timestamp(
                  Math.floor(Date.now() / 1000) + parameters.duration / 1000,
                  0
                )
              : null,
            rateLimitMaxRequests: parameters.maxCount || 10,
            rateLimitWindowMs: parameters.windowMs || 60000,
          });
          break;

        default:
          console.warn(`Unknown action: ${action}`);
      }

      return { action, success: true };
    } catch (error: any) {
      console.error(`Error executing action ${action}:`, error);
      return { action, success: false, error: error?.message };
    }
  }

  // ========================================================================
  // COOLDOWN & LIMITS
  // ========================================================================

  private async isInCooldown(
    ruleId: string,
    userId: string,
    cooldownMs: number
  ): Promise<boolean> {
    const q = query(
      collection(this.db, 'rule_executions'),
      where('ruleId', '==', ruleId),
      where('context.userId', '==', userId),
      orderBy('executedAt', 'desc'),
      where('executedAt', '>=', new Timestamp(
        Math.floor((Date.now() - cooldownMs) / 1000), 0
      ))
    );
    const snap = await getDocs(q);
    return !snap.empty;
  }

  private async getExecutionCount(
    ruleId: string,
    userId: string
  ): Promise<number> {
    const q = query(
      collection(this.db, 'rule_executions'),
      where('ruleId', '==', ruleId),
      where('context.userId', '==', userId)
    );
    const snap = await getDocs(q);
    return snap.size;
  }

  // ========================================================================
  // SEED PRESET RULES (call on first admin setup)
  // ========================================================================

  async seedPresetRules(createdBy: string): Promise<void> {
    const presets: Parameters<AutomationRulesService['createRule']>[] = [
      [
        'Restrict new accounts from mass posting',
        'Limits new accounts (<24h) to 5 posts per hour',
        RuleTrigger.POST_CREATED,
        {
          logic: 'AND',
          conditions: [{ field: 'accountAgeHours', operator: '<', value: 24 }],
        },
        [
          {
            action: RuleAction.RESTRICT_POSTING,
            parameters: { duration: 3600000, reason: 'New account rate limit' },
          },
        ],
        createdBy,
        { priority: 80, tags: ['new_accounts', 'rate_limit'] },
      ],
      [
        'Auto-restrict on high report count',
        'Restricts posting when content gets 10+ reports',
        RuleTrigger.REPORT_THRESHOLD,
        {
          logic: 'AND',
          conditions: [{ field: 'reportCount', operator: '>=', value: 10 }],
        },
        [
          {
            action: RuleAction.RESTRICT_POSTING,
            parameters: { reason: 'High report volume', duration: 86400000 },
          },
          {
            action: RuleAction.FLAG_FOR_REVIEW,
            parameters: { reason: 'Content exceeded report threshold' },
          },
        ],
        createdBy,
        { priority: 90, tags: ['reports', 'auto_moderation'] },
      ],
      [
        'Auto-suspend confirmed bots',
        'Suspends accounts with bot score above 90',
        RuleTrigger.RISK_SCORE_ABOVE,
        {
          logic: 'AND',
          conditions: [{ field: 'botScore', operator: '>', value: 90 }],
        },
        [
          {
            action: RuleAction.SUSPEND_ACCOUNT,
            parameters: {
              duration: 604800000,
              reason: 'Automated suspension: confirmed bot activity',
            },
          },
          {
            action: RuleAction.NOTIFY_ADMIN,
            parameters: { message: 'Bot account auto-suspended' },
          },
        ],
        createdBy,
        { priority: 100, tags: ['bots', 'security'] },
      ],
      [
        'Lock account after 5 failed logins',
        'Locks account temporarily on repeated failed login attempts',
        RuleTrigger.LOGIN_FAILED,
        {
          logic: 'AND',
          conditions: [
            { field: 'failedLoginCount', operator: '>=', value: 5 },
            { field: 'windowMinutes', operator: '<=', value: 15 },
          ],
        },
        [
          {
            action: RuleAction.LOCK_ACCOUNT,
            parameters: {
              duration: 1800000,
              reason: 'Too many failed login attempts',
            },
          },
          {
            action: RuleAction.WARN_USER,
            parameters: {
              message:
                'Your account has been temporarily locked due to repeated failed login attempts. Please try again in 30 minutes.',
            },
          },
        ],
        createdBy,
        { priority: 95, cooldownMs: 1800000, tags: ['security', 'login'] },
      ],
      [
        'Flag low-trust users for moderation',
        'Sends content to review queue when user trust score is below 20',
        RuleTrigger.POST_CREATED,
        {
          logic: 'AND',
          conditions: [{ field: 'userTrustScore', operator: '<', value: 20 }],
        },
        [
          {
            action: RuleAction.REQUIRE_MODERATION,
            parameters: { reason: 'Low trust score - content requires review' },
          },
        ],
        createdBy,
        { priority: 70, tags: ['trust_score', 'moderation'] },
      ],
      [
        'Restrict messaging for high-risk accounts',
        'Limits DMs when risk score exceeds 60',
        RuleTrigger.RISK_SCORE_ABOVE,
        {
          logic: 'AND',
          conditions: [{ field: 'riskScore', operator: '>', value: 60 }],
        },
        [
          {
            action: RuleAction.RESTRICT_MESSAGING,
            parameters: {
              duration: 86400000,
              reason: 'High risk score - messaging restricted',
            },
          },
        ],
        createdBy,
        { priority: 75, tags: ['risk_score', 'messaging'] },
      ],
    ];

    for (const preset of presets) {
      await this.createRule(...preset);
    }
  }
}

export default new AutomationRulesService();
