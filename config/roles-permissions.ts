/**
 * MedPulse Enterprise – Role & Permission Matrix  v5.0
 */
import { UserRole, Permission, RoleDefinition } from "@/types";

// Extend roles with V5 additions (values not in the enum yet — kept as strings)
export const ALL_ROLES = {
  ...UserRole,
  COMMUNITY_ADMIN:  "community_admin"  as const,
  MODERATION_ADMIN: "moderation_admin" as const,
};

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: [
    "users.view","users.edit","users.ban","users.delete",
    "admins.create","admins.delete","admins.view","roles.assign",
    "posts.view","posts.moderate","posts.delete",
    "verification.view","verification.manage",
    "advertisements.view","advertisements.manage",
    "security.view","security.manage",
    "maintenance.manage","email.send","email.manage",
    "analytics.view","audit_logs.view",
    "reports.view","reports.manage",
    "recycle_bin.view","recycle_bin.restore",
    "backups.view","backups.restore","system.settings","system.lockdown",
  ],
  super_admin: [
    "users.view","users.edit","users.ban","users.delete",
    "admins.view","roles.assign",
    "posts.view","posts.moderate","posts.delete",
    "verification.view","verification.manage",
    "advertisements.view","advertisements.manage",
    "security.view","security.manage",
    "maintenance.manage","email.send","email.manage",
    "analytics.view","audit_logs.view",
    "reports.view","reports.manage",
    "recycle_bin.view","recycle_bin.restore","backups.view","system.settings",
  ],
  security_admin: [
    "users.view","users.ban","security.view","security.manage",
    "audit_logs.view","reports.view",
  ],
  verification_admin: [
    "users.view","verification.view","verification.manage","audit_logs.view",
  ],
  advertisement_admin: [
    "advertisements.view","advertisements.manage","analytics.view",
  ],
  support_admin: [
    "users.view","reports.view","reports.manage","posts.view",
  ],
  moderator: [
    "posts.view","posts.moderate","reports.view","users.view",
  ],
  moderation_admin: [
    "posts.view","posts.moderate","posts.delete",
    "reports.view","reports.manage","users.view","users.ban",
  ],
  community_admin: [
    "posts.view","posts.moderate",
    "reports.view","users.view",
  ],
  analytics_admin: [
    "analytics.view","users.view","posts.view",
  ],
  user:  [],
  guest: [],
};

export const ADMIN_ROLES: string[] = [
  "owner","super_admin","security_admin","verification_admin",
  "advertisement_admin","support_admin","moderator","moderation_admin",
  "community_admin","analytics_admin",
];

export const PROTECTED_ROLES: string[] = ["owner"];

export function hasPermission(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
