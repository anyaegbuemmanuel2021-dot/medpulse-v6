// File: services/rbac.service.ts
// Role-Based Access Control Service
// Integrates with existing auth.service.ts and firestore schema

import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, Timestamp, writeBatch } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// ============================================================================
// TYPES & ENUMS
// ============================================================================

export enum PredefinedRole {
  SUPER_ADMIN = 'super_admin',
  PLATFORM_ADMIN = 'platform_admin',
  TRUST_SAFETY_SPECIALIST = 'trust_safety_specialist',
  CONTENT_MODERATOR = 'content_moderator',
  COMMUNITY_ADMIN = 'community_admin',
  COMMUNITY_MODERATOR = 'community_moderator',
  SUPPORT_AGENT = 'support_agent',
  CREATOR = 'creator',
  VERIFIED_PROFESSIONAL = 'verified_professional',
  STANDARD_USER = 'standard_user',
}

export interface Permission {
  id: string;
  name: string;
  description: string;
  category: 'users' | 'content' | 'communities' | 'security' | 'admin' | 'financial' | 'legal' | 'system';
  action: 'read' | 'write' | 'delete' | 'moderate' | 'verify' | 'block' | 'execute';
}

export interface Role {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  isActive: boolean;
  permissions: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  usageCount: number;
}

export interface AdminUser {
  id: string;
  userId: string;
  email: string;
  role: string;
  overridePermissions: string[];
  status: 'active' | 'suspended' | 'inactive';
  assignedAt: Timestamp;
  assignedBy: string;
  lastLogin?: Timestamp;
  sessionCount: number;
}

// ============================================================================
// PERMISSION DEFINITIONS
// ============================================================================

const SYSTEM_PERMISSIONS: Permission[] = [
  // Users
  { id: 'users:read', name: 'Read Users', description: 'View user profiles', category: 'users', action: 'read' },
  { id: 'users:write', name: 'Edit Users', description: 'Modify user data', category: 'users', action: 'write' },
  { id: 'users:delete', name: 'Delete Users', description: 'Delete user accounts', category: 'users', action: 'delete' },
  { id: 'users:suspend', name: 'Suspend Users', description: 'Suspend user accounts', category: 'users', action: 'block' },
  { id: 'users:verify', name: 'Verify Users', description: 'Verify professionals', category: 'users', action: 'verify' },
  { id: 'users:impersonate', name: 'Impersonate Users', description: 'View as user', category: 'users', action: 'execute' },
  
  // Content
  { id: 'content:moderate', name: 'Moderate Content', description: 'Review content', category: 'content', action: 'moderate' },
  { id: 'content:remove', name: 'Remove Content', description: 'Delete content', category: 'content', action: 'delete' },
  { id: 'content:restore', name: 'Restore Content', description: 'Restore deleted content', category: 'content', action: 'write' },
  { id: 'content:flag', name: 'Flag Content', description: 'Flag for review', category: 'content', action: 'moderate' },
  
  // Communities
  { id: 'communities:read', name: 'Read Communities', description: 'View communities', category: 'communities', action: 'read' },
  { id: 'communities:moderate', name: 'Moderate Communities', description: 'Manage community content', category: 'communities', action: 'moderate' },
  { id: 'communities:delete', name: 'Delete Communities', description: 'Delete communities', category: 'communities', action: 'delete' },
  
  // Security
  { id: 'security:view_logs', name: 'View Security Logs', description: 'Access security events', category: 'security', action: 'read' },
  { id: 'security:manage_blocks', name: 'Manage IP Blocks', description: 'Block/unblock IPs', category: 'security', action: 'execute' },
  { id: 'security:manage_rules', name: 'Manage Rules', description: 'Create automation rules', category: 'security', action: 'execute' },
  
  // Admin
  { id: 'admin:manage_admins', name: 'Manage Admins', description: 'Create/modify admins', category: 'admin', action: 'execute' },
  { id: 'admin:manage_roles', name: 'Manage Roles', description: 'Create/edit roles', category: 'admin', action: 'execute' },
  { id: 'admin:view_audit', name: 'View Audit Logs', description: 'Access audit logs', category: 'admin', action: 'read' },
  { id: 'admin:emergency', name: 'Emergency Controls', description: 'Activate kill switches', category: 'admin', action: 'execute' },
  
  // Financial
  { id: 'financial:read', name: 'View Financial', description: 'View revenue data', category: 'financial', action: 'read' },
  { id: 'financial:payouts', name: 'Process Payouts', description: 'Handle creator payouts', category: 'financial', action: 'execute' },
  
  // Legal
  { id: 'legal:manage_policies', name: 'Manage Policies', description: 'Edit legal docs', category: 'legal', action: 'execute' },
  { id: 'legal:copyright', name: 'Handle Copyright', description: 'Process DMCA claims', category: 'legal', action: 'execute' },
];

const SYSTEM_ROLES: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Super Admin',
    description: 'Full platform access',
    isSystem: true,
    isActive: true,
    permissions: SYSTEM_PERMISSIONS.map(p => p.id),
    usageCount: 0,
  },
  {
    name: 'Platform Admin',
    description: 'Manage users and content',
    isSystem: true,
    isActive: true,
    permissions: [
      'users:read', 'users:write', 'users:suspend', 'users:verify',
      'content:moderate', 'content:remove', 'content:flag',
      'communities:read', 'communities:moderate',
      'security:view_logs',
      'admin:view_audit',
    ],
    usageCount: 0,
  },
  {
    name: 'Moderator',
    description: 'Content moderation only',
    isSystem: true,
    isActive: true,
    permissions: [
      'users:read',
      'content:moderate', 'content:remove', 'content:flag',
      'communities:read', 'communities:moderate',
    ],
    usageCount: 0,
  },
  {
    name: 'Trust & Safety',
    description: 'Conduct investigations',
    isSystem: true,
    isActive: true,
    permissions: [
      'users:read', 'users:suspend',
      'content:moderate', 'content:flag',
      'security:view_logs',
      'admin:view_audit',
    ],
    usageCount: 0,
  },
];

// ============================================================================
// RBAC SERVICE CLASS
// ============================================================================

class RBACService {
  private db = getFirestore();
  private auth = getAuth();

  /**
   * Initialize system permissions and roles on first run
   */
  async initialize(): Promise<void> {
    const permissionsRef = collection(this.db, 'system_permissions');
    const existing = await getDocs(query(permissionsRef, where('isSystem', '==', true)));
    
    if (existing.size > 0) return; // Already initialized

    const batch = writeBatch(this.db);

    // Create system permissions
    for (const perm of SYSTEM_PERMISSIONS) {
      batch.set(doc(this.db, 'system_permissions', perm.id), {
        ...perm,
        isSystem: true,
        createdAt: Timestamp.now(),
      });
    }

    // Create system roles
    for (let i = 0; i < SYSTEM_ROLES.length; i++) {
      const roleId = Object.values(PredefinedRole)[i];
      batch.set(doc(this.db, 'system_roles', roleId), {
        id: roleId,
        ...SYSTEM_ROLES[i],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }

    await batch.commit();
  }

  /**
   * Check if user has permission
   */
  async hasPermission(userId: string, permissionId: string): Promise<boolean> {
    try {
      const adminDoc = await getDoc(doc(this.db, 'admins', userId));
      if (!adminDoc.exists()) return false;

      const admin = adminDoc.data() as AdminUser;
      if (admin.status !== 'active') return false;

      // Check override permissions
      if (admin.overridePermissions?.includes(permissionId)) return true;

      // Get role permissions
      const roleDoc = await getDoc(doc(this.db, 'system_roles', admin.role));
      if (!roleDoc.exists()) return false;

      const role = roleDoc.data() as Role;
      return role.permissions.includes(permissionId);
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }

  /**
   * Check multiple permissions (AND)
   */
  async hasAllPermissions(userId: string, permissions: string[]): Promise<boolean> {
    const results = await Promise.all(
      permissions.map(p => this.hasPermission(userId, p))
    );
    return results.every(r => r);
  }

  /**
   * Check multiple permissions (OR)
   */
  async hasAnyPermission(userId: string, permissions: string[]): Promise<boolean> {
    const results = await Promise.all(
      permissions.map(p => this.hasPermission(userId, p))
    );
    return results.some(r => r);
  }

  /**
   * Assign role to admin
   */
  async assignRole(adminId: string, roleId: string, assignedBy: string): Promise<void> {
    const batch = writeBatch(this.db);

    // Update admin
    batch.update(doc(this.db, 'admins', adminId), {
      role: roleId,
      assignedAt: Timestamp.now(),
      assignedBy,
    });

    // Update role usage
    const roleDoc = await getDoc(doc(this.db, 'system_roles', roleId));
    if (roleDoc.exists()) {
      const role = roleDoc.data() as Role;
      batch.update(doc(this.db, 'system_roles', roleId), {
        usageCount: (role.usageCount || 0) + 1,
      });
    }

    // Audit log
    batch.set(doc(collection(this.db, 'audit_logs')), {
      action: 'ROLE_ASSIGNED',
      actor: assignedBy,
      target: adminId,
      timestamp: Timestamp.now(),
      details: { roleId },
    });

    await batch.commit();
  }

  /**
   * Grant override permission
   */
  async grantPermission(adminId: string, permissionId: string, grantedBy: string): Promise<void> {
    const adminDoc = await getDoc(doc(this.db, 'admins', adminId));
    if (!adminDoc.exists()) throw new Error('Admin not found');

    const admin = adminDoc.data() as AdminUser;
    const permissions = admin.overridePermissions || [];

    if (!permissions.includes(permissionId)) {
      permissions.push(permissionId);
      await updateDoc(doc(this.db, 'admins', adminId), {
        overridePermissions: permissions,
      });
    }
  }

  /**
   * Revoke override permission
   */
  async revokePermission(adminId: string, permissionId: string, revokedBy: string): Promise<void> {
    const adminDoc = await getDoc(doc(this.db, 'admins', adminId));
    if (!adminDoc.exists()) throw new Error('Admin not found');

    const admin = adminDoc.data() as AdminUser;
    const permissions = (admin.overridePermissions || []).filter(p => p !== permissionId);
    
    await updateDoc(doc(this.db, 'admins', adminId), {
      overridePermissions: permissions,
    });
  }

  /**
   * Create custom role
   */
  async createRole(name: string, permissions: string[], createdBy: string): Promise<Role> {
    const roleId = `custom_${Date.now()}`;
    const role: Role = {
      id: roleId,
      name,
      description: '',
      isSystem: false,
      isActive: true,
      permissions,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      usageCount: 0,
    };

    await setDoc(doc(this.db, 'system_roles', roleId), role);
    return role;
  }

  /**
   * Get admin's role and permissions
   */
  async getAdminPermissions(adminId: string): Promise<{
    role: Role;
    permissions: Permission[];
  } | null> {
    try {
      const adminDoc = await getDoc(doc(this.db, 'admins', adminId));
      if (!adminDoc.exists()) return null;

      const admin = adminDoc.data() as AdminUser;
      const roleDoc = await getDoc(doc(this.db, 'system_roles', admin.role));
      if (!roleDoc.exists()) return null;

      const role = roleDoc.data() as Role;
      const allPermIds = new Set([...role.permissions, ...(admin.overridePermissions || [])]);

      const permissions = await Promise.all(
        Array.from(allPermIds).map(async (permId) => {
          const permDoc = await getDoc(doc(this.db, 'system_permissions', permId));
          return permDoc.exists() ? (permDoc.data() as Permission) : null;
        })
      );

      return {
        role,
        permissions: permissions.filter(p => p !== null) as Permission[],
      };
    } catch (error) {
      console.error('Error getting admin permissions:', error);
      return null;
    }
  }
}

export default new RBACService();
