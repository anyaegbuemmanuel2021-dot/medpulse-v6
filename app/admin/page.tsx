"use client";
import React from "react";

const ADMIN_MODULES = [
  { href: "/admin/users",         icon: "👥", label: "Users",             desc: "Manage accounts, roles, bans" },
  { href: "/admin/content",       icon: "📋", label: "Content",           desc: "Review posts, comments, reports" },
  { href: "/admin/verifications", icon: "✅", label: "Verifications",     desc: "Approve/reject verification requests" },
  { href: "/admin/communities",   icon: "🏘", label: "Communities",       desc: "Manage groups and channels" },
  { href: "/admin/ads",           icon: "📢", label: "Advertisements",    desc: "Review and manage ad campaigns" },
  { href: "/admin/security",      icon: "🛡", label: "Security Center",   desc: "Bans, IPs, devices, threat logs" },
  { href: "/admin/analytics",     icon: "📊", label: "Analytics",         desc: "DAU, MAU, engagement, revenue" },
  { href: "/admin/email",         icon: "📧", label: "Email Center",      desc: "Campaigns, templates, bulk send" },
  { href: "/admin/reports",       icon: "🚨", label: "Reports",           desc: "User-submitted content reports" },
  { href: "/admin/maintenance",   icon: "⚙️", label: "Maintenance",       desc: "Enable/disable maintenance mode" },
  { href: "/admin/recycle-bin",   icon: "🗑", label: "Recycle Bin",       desc: "Restore soft-deleted items" },
  { href: "/admin/backups",       icon: "💾", label: "Backups",           desc: "Create and restore system backups" },
  { href: "/admin/audit-logs",    icon: "📜", label: "Audit Logs",        desc: "Immutable admin action history" },
  { href: "/admin/settings",      icon: "🔧", label: "Settings",          desc: "System configuration" },
];

export default function AdminDashboard() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Admin Dashboard</h1>
      <p className="text-slate-500 mb-8">MedPulse Enterprise Control Panel</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ADMIN_MODULES.map((m) => (
          <a key={m.href} href={m.href}
            className="flex gap-4 p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-blue-400 hover:shadow-md transition">
            <span className="text-3xl">{m.icon}</span>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{m.label}</p>
              <p className="text-sm text-slate-500">{m.desc}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
