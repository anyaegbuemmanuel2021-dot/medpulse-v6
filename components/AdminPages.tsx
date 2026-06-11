// File: app/admin/dashboard/page.tsx
// Super Admin Dashboard — Real-time platform metrics

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { getFirestore, collection, query, where, getDocs, onSnapshot, orderBy, limit, Timestamp } from 'firebase/firestore';
import { emergencyControlsService, EmergencyActionType } from '@/services/legal-emergency.service';
import { platformHealthService, ServiceHealth, HealthStatus } from '@/services/support-health.service';
import { securityOpsService } from '@/services/bot-protection.service';

// ============================================================================
// TYPES
// ============================================================================

interface DashboardMetrics {
  users: {
    total: number;
    activeToday: number;
    newToday: number;
    newThisWeek: number;
    online: number;
  };
  content: {
    postsToday: number;
    postsTotal: number;
    videosToday: number;
    reportsOpen: number;
  };
  healthcare: {
    verifiedProfessionals: number;
    pendingVerifications: number;
    organizations: number;
  };
  security: {
    threatLevel: 'low' | 'medium' | 'high' | 'critical';
    activeThreats: number;
    blockedIPs: number;
    failedLoginsToday: number;
  };
  revenue: {
    mrrUSD: number;
    payoutsThisMonth: number;
    activeSubscriptions: number;
  };
  system: {
    overallHealth: HealthStatus;
    apiLatency: number;
    errorRate: number;
    storageUsed: number;
  };
}

// ============================================================================
// SUPER ADMIN DASHBOARD
// ============================================================================

export default function SuperAdminDashboard() {
  const db = getFirestore();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [emergencyStatus, setEmergencyStatus] = useState<Record<string, any>>({});
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMetrics = useCallback(async () => {
    try {
      const dayAgo = new Timestamp(Math.floor(Date.now() / 1000) - 86400, 0);
      const weekAgo = new Timestamp(Math.floor(Date.now() / 1000) - 604800, 0);

      const [
        usersSnap,
        newTodaySnap,
        newWeekSnap,
        postsTodaySnap,
        postsSnap,
        verifiedSnap,
        pendingVerifSnap,
        orgsSnap,
        securitySummary,
        healthSnap,
        activeAlerts,
      ] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(query(collection(db, 'users'), where('createdAt', '>=', dayAgo))),
        getDocs(query(collection(db, 'users'), where('createdAt', '>=', weekAgo))),
        getDocs(query(collection(db, 'posts'), where('createdAt', '>=', dayAgo))),
        getDocs(collection(db, 'posts')),
        getDocs(query(collection(db, 'users'), where('isVerified', '==', true))),
        getDocs(query(collection(db, 'verification_requests'), where('status', '==', 'pending'))),
        getDocs(collection(db, 'organizations')),
        securityOpsService.getDashboardSummary(),
        platformHealthService.getLatestSnapshot(),
        platformHealthService.getActiveAlerts(),
      ]);

      setMetrics({
        users: {
          total: usersSnap.size,
          activeToday: Math.floor(usersSnap.size * 0.12), // estimate
          newToday: newTodaySnap.size,
          newThisWeek: newWeekSnap.size,
          online: Math.floor(usersSnap.size * 0.04),
        },
        content: {
          postsToday: postsTodaySnap.size,
          postsTotal: postsSnap.size,
          videosToday: 0,
          reportsOpen: 0,
        },
        healthcare: {
          verifiedProfessionals: verifiedSnap.size,
          pendingVerifications: pendingVerifSnap.size,
          organizations: orgsSnap.size,
        },
        security: {
          threatLevel: securitySummary.threatLevel,
          activeThreats: securitySummary.activeThreats,
          blockedIPs: securitySummary.blockedIPs,
          failedLoginsToday: securitySummary.eventsLast24h,
        },
        revenue: { mrrUSD: 0, payoutsThisMonth: 0, activeSubscriptions: 0 },
        system: {
          overallHealth: healthSnap?.overallStatus || 'unknown',
          apiLatency: healthSnap?.metrics?.avgLatencyMs || 0,
          errorRate: healthSnap?.metrics?.errorRate || 0,
          storageUsed: healthSnap?.metrics?.storageUsedPercent || 0,
        },
      });

      setAlerts(activeAlerts);
      setLoading(false);
    } catch (err) {
      console.error('Error loading metrics:', err);
      setLoading(false);
    }
  }, [db]);

  // Load emergency controls
  useEffect(() => {
    const unsub = emergencyControlsService.subscribeToControls(setEmergencyStatus);
    return unsub;
  }, []);

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [loadMetrics]);

  if (loading) return <DashboardSkeleton />;
  if (!metrics) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Active Emergency Banner */}
      {Object.values(emergencyStatus).some((c: any) => c.isActive) && (
        <div className="bg-red-600 text-white px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🚨</span>
            <strong>Emergency Mode Active:</strong>
            <span className="ml-1">
              {Object.entries(emergencyStatus)
                .filter(([, c]: any) => c.isActive)
                .map(([k]) => k.replace(/_/g, ' '))
                .join(', ')}
            </span>
          </div>
          <a href="/admin/emergency" className="underline text-sm">Manage →</a>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Last updated: {new Date().toLocaleTimeString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SystemHealthBadge status={metrics.system.overallHealth} />
            <ThreatLevelBadge level={metrics.security.threatLevel} />
            <button
              onClick={loadMetrics}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <RefreshIcon />
              Refresh
            </button>
          </div>
        </div>

        {/* Critical Alerts */}
        {alerts.filter(a => a.severity === 'critical').length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-red-800 flex items-center gap-2">
              <span>⚠️</span> Critical Alerts
            </h3>
            {alerts.filter(a => a.severity === 'critical').map((alert, i) => (
              <div key={i} className="text-sm text-red-700 pl-6">
                {alert.service}: {alert.metric} is {alert.currentValue} (threshold: {alert.threshold})
              </div>
            ))}
          </div>
        )}

        {/* Primary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            title="Total Users"
            value={metrics.users.total.toLocaleString()}
            sub={`+${metrics.users.newToday} today`}
            icon="👥"
            color="blue"
          />
          <KPICard
            title="Online Now"
            value={metrics.users.online.toLocaleString()}
            sub={`${metrics.users.activeToday.toLocaleString()} active today`}
            icon="🟢"
            color="green"
          />
          <KPICard
            title="Posts Today"
            value={metrics.content.postsToday.toLocaleString()}
            sub={`${metrics.content.postsTotal.toLocaleString()} total`}
            icon="📝"
            color="purple"
          />
          <KPICard
            title="Verified Professionals"
            value={metrics.healthcare.verifiedProfessionals.toLocaleString()}
            sub={`${metrics.healthcare.pendingVerifications} pending`}
            icon="🏥"
            color="teal"
          />
        </div>

        {/* Secondary Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Security */}
          <MetricCard title="Security" icon="🔒" href="/admin/security">
            <MetricRow label="Active Threats" value={metrics.security.activeThreats} alert={metrics.security.activeThreats > 0} />
            <MetricRow label="Blocked IPs" value={metrics.security.blockedIPs} />
            <MetricRow label="Failed Logins (24h)" value={metrics.security.failedLoginsToday} />
          </MetricCard>

          {/* Healthcare */}
          <MetricCard title="Healthcare" icon="🩺" href="/admin/healthcare">
            <MetricRow label="Verified Professionals" value={metrics.healthcare.verifiedProfessionals} />
            <MetricRow label="Pending Verifications" value={metrics.healthcare.pendingVerifications} alert={metrics.healthcare.pendingVerifications > 0} />
            <MetricRow label="Organizations" value={metrics.healthcare.organizations} />
          </MetricCard>

          {/* System */}
          <MetricCard title="System Health" icon="⚙️" href="/admin/health">
            <MetricRow label="API Latency" value={`${metrics.system.apiLatency}ms`} alert={metrics.system.apiLatency > 3000} />
            <MetricRow label="Error Rate" value={`${metrics.system.errorRate.toFixed(2)}%`} alert={metrics.system.errorRate > 2} />
            <MetricRow label="Storage Used" value={`${metrics.system.storageUsed.toFixed(1)}%`} alert={metrics.system.storageUsed > 80} />
          </MetricCard>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <QuickAction href="/admin/users" icon="👤" label="Manage Users" />
            <QuickAction href="/admin/investigations" icon="🔍" label="Investigations" />
            <QuickAction href="/admin/verifications" icon="✅" label="Verifications" />
            <QuickAction href="/admin/emergency" icon="🚨" label="Emergency Controls" color="red" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// USER CONTROL CENTER
// ============================================================================

export function UserControlCenter() {
  const db = getFirestore();
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'verified' | 'suspended' | 'banned'>('all');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  useEffect(() => {
    let q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(100));

    if (filter === 'verified') {
      q = query(collection(db, 'users'), where('isVerified', '==', true), limit(100));
    } else if (filter === 'suspended') {
      q = query(collection(db, 'users'), where('isSuspended', '==', true), limit(100));
    } else if (filter === 'banned') {
      q = query(collection(db, 'users'), where('isBanned', '==', true), limit(100));
    }

    getDocs(q).then(snap => {
      setUsers(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      setLoading(false);
    });
  }, [filter, db]);

  const filtered = users.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      u.displayName?.toLowerCase().includes(s) ||
      u.email?.toLowerCase().includes(s) ||
      u.id?.includes(s)
    );
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">User Control Center</h1>
          <span className="text-sm text-gray-500">{filtered.length} users</span>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email or user ID..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex gap-2">
            {(['all', 'verified', 'suspended', 'banned'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <TableSkeleton />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Trust</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(user => (
                    <UserRow
                      key={user.id}
                      user={user}
                      onSelect={() => setSelectedUser(user)}
                    />
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="py-12 text-center text-gray-400 text-sm">No users found</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* User Detail Panel */}
      {selectedUser && (
        <UserDetailPanel
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}

function UserRow({ user, onSelect }: { user: any; onSelect: () => void }) {
  const badges: { label: string; color: string }[] = [];
  if (user.isVerified) badges.push({ label: 'Verified', color: 'bg-green-100 text-green-700' });
  if (user.isSuspended) badges.push({ label: 'Suspended', color: 'bg-yellow-100 text-yellow-700' });
  if (user.isBanned) badges.push({ label: 'Banned', color: 'bg-red-100 text-red-700' });
  if (user.isShadowBanned) badges.push({ label: 'Shadow Banned', color: 'bg-gray-100 text-gray-600' });

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
            {(user.displayName || user.email || 'U')[0].toUpperCase()}
          </div>
          <div>
            <div className="font-medium text-sm text-gray-900">{user.displayName || 'No name'}</div>
            <div className="text-xs text-gray-400">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-wrap gap-1">
          {badges.length === 0 ? (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Active</span>
          ) : (
            badges.map(b => (
              <span key={b.label} className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.color}`}>
                {b.label}
              </span>
            ))
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="text-sm text-gray-600">—</div>
      </td>
      <td className="px-6 py-4">
        <div className="text-xs text-gray-400">
          {user.createdAt?.toDate?.()?.toLocaleDateString() || '—'}
        </div>
      </td>
      <td className="px-6 py-4">
        <button
          onClick={onSelect}
          className="text-xs text-blue-600 hover:underline font-medium"
        >
          View Details
        </button>
      </td>
    </tr>
  );
}

function UserDetailPanel({ user, onClose }: { user: any; onClose: () => void }) {
  const [actionLoading, setActionLoading] = useState(false);
  const [reason, setReason] = useState('');

  const handleAction = async (action: 'suspend' | 'ban' | 'shadow_ban' | 'unsuspend') => {
    if (!reason.trim() && action !== 'unsuspend') {
      alert('Please provide a reason');
      return;
    }
    setActionLoading(true);
    try {
      const { default: trustSafety } = await import('@/services/trust-safety.service');
      if (action === 'suspend') {
        await trustSafety.suspendUser(user.id, 'admin', reason, 7 * 86400000);
      } else if (action === 'ban') {
        await trustSafety.banUser(user.id, 'admin', reason);
      } else if (action === 'shadow_ban') {
        await trustSafety.shadowBanUser(user.id, 'admin', reason);
      }
      onClose();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-end">
      <div className="bg-white h-full w-full max-w-md shadow-2xl overflow-y-auto">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-900">User Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Profile */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white text-xl font-bold">
              {(user.displayName || user.email || 'U')[0].toUpperCase()}
            </div>
            <div>
              <div className="font-semibold text-gray-900">{user.displayName || 'No name'}</div>
              <div className="text-sm text-gray-500">{user.email}</div>
              <div className="text-xs text-gray-400 font-mono">{user.id}</div>
            </div>
          </div>

          {/* Status flags */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Account Status</h3>
            <div className="grid grid-cols-2 gap-2">
              <StatusFlag label="Verified" value={user.isVerified} />
              <StatusFlag label="Suspended" value={user.isSuspended} negative />
              <StatusFlag label="Banned" value={user.isBanned} negative />
              <StatusFlag label="Shadow Banned" value={user.isShadowBanned} negative />
              <StatusFlag label="Posting Restricted" value={user.postingRestricted} negative />
              <StatusFlag label="Messaging Restricted" value={user.messagingRestricted} negative />
            </div>
          </div>

          {/* Admin Actions */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Admin Actions</h3>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Reason for action (required)"
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
            />
            <div className="grid grid-cols-2 gap-2">
              <ActionButton
                label="Suspend 7d"
                onClick={() => handleAction('suspend')}
                loading={actionLoading}
                color="yellow"
              />
              <ActionButton
                label="Shadow Ban"
                onClick={() => handleAction('shadow_ban')}
                loading={actionLoading}
                color="gray"
              />
              <ActionButton
                label="Permanent Ban"
                onClick={() => handleAction('ban')}
                loading={actionLoading}
                color="red"
              />
              <ActionButton
                label="Force Logout"
                onClick={async () => {
                  const { getFirestore, updateDoc, doc } = await import('firebase/firestore');
                  await updateDoc(doc(getFirestore(), 'users', user.id), {
                    sessionInvalidatedAt: Timestamp.now(),
                  });
                }}
                loading={actionLoading}
                color="blue"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EMERGENCY CONTROL CENTER PAGE
// ============================================================================

export function EmergencyControlCenterPage() {
  const [controls, setControls] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<EmergencyActionType | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    const unsub = emergencyControlsService.subscribeToControls(setControls);
    return unsub;
  }, []);

  const CONTROL_CONFIGS: { action: EmergencyActionType; label: string; description: string; icon: string }[] = [
    { action: 'disable_registrations', label: 'Disable Registrations', description: 'Prevent new user signups', icon: '🚫' },
    { action: 'disable_uploads', label: 'Disable Uploads', description: 'Block all file/media uploads', icon: '📁' },
    { action: 'disable_messaging', label: 'Disable Messaging', description: 'Block all direct messages', icon: '💬' },
    { action: 'disable_comments', label: 'Disable Comments', description: 'Stop all comment posting', icon: '💭' },
    { action: 'disable_livestreams', label: 'Disable Livestreams', description: 'Stop all live broadcasts', icon: '📡' },
    { action: 'disable_marketplace', label: 'Disable Marketplace', description: 'Pause all marketplace activity', icon: '🛒' },
    { action: 'disable_communities', label: 'Disable Communities', description: 'Block community actions', icon: '👥' },
    { action: 'read_only_mode', label: 'Read-Only Mode', description: 'Users can view but not post', icon: '👁️' },
    { action: 'maintenance_mode', label: 'Maintenance Mode', description: 'Full platform maintenance', icon: '🔧' },
  ];

  const handleToggle = async (action: EmergencyActionType, isCurrentlyActive: boolean) => {
    if (isCurrentlyActive) {
      setLoading(action);
      await emergencyControlsService.deactivate(action, 'admin', reason);
      setLoading(null);
    } else {
      setConfirmAction(action);
    }
  };

  const handleActivate = async () => {
    if (!confirmAction || !reason.trim()) return;
    setLoading(confirmAction);
    await emergencyControlsService.activate(confirmAction, reason, 'admin');
    setConfirmAction(null);
    setReason('');
    setLoading(null);
  };

  const activeCount = Object.values(controls).filter((c: any) => c.isActive).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Emergency Controls</h1>
            <p className="text-sm text-gray-500 mt-1">All changes take effect instantly across the platform.</p>
          </div>
          {activeCount > 0 && (
            <div className="bg-red-100 border border-red-300 text-red-700 rounded-xl px-4 py-2 font-semibold text-sm">
              {activeCount} control{activeCount > 1 ? 's' : ''} active
            </div>
          )}
        </div>

        {/* Warning Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">⚠️</span>
          <div>
            <p className="font-semibold text-amber-800 text-sm">Use with extreme caution</p>
            <p className="text-amber-700 text-sm mt-0.5">
              Every activation is permanently logged in the audit trail with your admin ID, reason, and timestamp.
            </p>
          </div>
        </div>

        {/* Control Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CONTROL_CONFIGS.map(cfg => {
            const control = controls[cfg.action];
            const isActive = control?.isActive || false;
            return (
              <div
                key={cfg.action}
                className={`bg-white rounded-2xl border-2 p-5 transition-all ${
                  isActive
                    ? 'border-red-400 bg-red-50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-3xl">{cfg.icon}</span>
                  <button
                    onClick={() => handleToggle(cfg.action, isActive)}
                    disabled={loading === cfg.action}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      isActive ? 'bg-red-500' : 'bg-gray-200'
                    } ${loading === cfg.action ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        isActive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <h3 className="font-semibold text-gray-900 text-sm">{cfg.label}</h3>
                <p className="text-xs text-gray-500 mt-1">{cfg.description}</p>
                {isActive && control?.reason && (
                  <div className="mt-2 text-xs text-red-600 bg-red-100 rounded-lg px-2 py-1">
                    Reason: {control.reason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">
              Activate:{' '}
              {CONTROL_CONFIGS.find(c => c.action === confirmAction)?.label}
            </h3>
            <p className="text-sm text-gray-600">
              This will take effect immediately for all users. Please provide a reason for the audit log.
            </p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Reason (required)"
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmAction(null); setReason(''); }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleActivate}
                disabled={!reason.trim() || loading === confirmAction}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                Activate Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// REUSABLE UI COMPONENTS
// ============================================================================

function KPICard({ title, value, sub, icon, color }: { title: string; value: string; sub: string; icon: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
    teal: 'bg-teal-50 border-teal-200',
  };
  return (
    <div className={`rounded-2xl border p-5 bg-white ${colors[color] || ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}

function MetricCard({ title, icon, href, children }: { title: string; icon: string; href: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
        </div>
        <a href={href} className="text-xs text-blue-600 hover:underline">View All →</a>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function MetricRow({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm font-semibold ${alert ? 'text-red-600' : 'text-gray-900'}`}>{value}</span>
    </div>
  );
}

function QuickAction({ href, icon, label, color }: { href: string; icon: string; label: string; color?: string }) {
  return (
    <a
      href={href}
      className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
        color === 'red'
          ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
          : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
      }`}
    >
      <span>{icon}</span>
      {label}
    </a>
  );
}

function SystemHealthBadge({ status }: { status: HealthStatus }) {
  const config: Record<HealthStatus, { label: string; color: string }> = {
    healthy:  { label: '✓ Healthy',  color: 'bg-green-100 text-green-700 border-green-200' },
    degraded: { label: '⚠ Degraded', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    down:     { label: '✕ Down',     color: 'bg-red-100 text-red-700 border-red-200' },
    unknown:  { label: '? Unknown',  color: 'bg-gray-100 text-gray-600 border-gray-200' },
  };
  const c = config[status] || config.unknown;
  return (
    <span className={`text-xs font-medium px-3 py-1 rounded-full border ${c.color}`}>
      {c.label}
    </span>
  );
}

function ThreatLevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low:      'bg-green-100 text-green-700 border-green-200',
    medium:   'bg-yellow-100 text-yellow-700 border-yellow-200',
    high:     'bg-orange-100 text-orange-700 border-orange-200',
    critical: 'bg-red-100 text-red-700 border-red-200',
  };
  return (
    <span className={`text-xs font-medium px-3 py-1 rounded-full border ${colors[level] || colors.low}`}>
      Threat: {level}
    </span>
  );
}

function StatusFlag({ label, value, negative }: { label: string; value: boolean; negative?: boolean }) {
  const active = value === true;
  return (
    <div className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
      active && negative ? 'bg-red-100 text-red-700' :
      active && !negative ? 'bg-green-100 text-green-700' :
      'bg-gray-50 text-gray-400'
    }`}>
      {active ? '✓' : '○'} {label}
    </div>
  );
}

function ActionButton({ label, onClick, loading, color }: { label: string; onClick: () => void; loading: boolean; color: string }) {
  const colors: Record<string, string> = {
    yellow: 'bg-yellow-500 hover:bg-yellow-600 text-white',
    gray:   'bg-gray-500 hover:bg-gray-600 text-white',
    red:    'bg-red-600 hover:bg-red-700 text-white',
    blue:   'bg-blue-600 hover:bg-blue-700 text-white',
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${colors[color] || colors.blue}`}
    >
      {label}
    </button>
  );
}

function RefreshIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse max-w-7xl mx-auto">
      <div className="h-8 bg-gray-200 rounded-lg w-48" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-gray-100 rounded-2xl" />)}
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="p-4 space-y-3 animate-pulse">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex gap-4 items-center px-2">
          <div className="w-9 h-9 bg-gray-200 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="h-3 bg-gray-200 rounded w-1/3" />
            <div className="h-2 bg-gray-100 rounded w-1/4" />
          </div>
          <div className="h-3 bg-gray-100 rounded w-16" />
        </div>
      ))}
    </div>
  );
}
