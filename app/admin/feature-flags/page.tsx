"use client";
import React, { useEffect, useState } from "react";
import { getFeatureFlags, updateFeatureFlag } from "@/services/feature-flags.service";
import type { FeatureFlags } from "@/types";

const FLAG_LABELS: Record<string, { label: string; desc: string; emergency?: boolean }> = {
  userRegistration:   { label: "User Registration",   desc: "Allow new users to register",                emergency: true },
  uploadsEnabled:     { label: "Content Uploads",      desc: "Allow media and content uploads",            emergency: true },
  commentsEnabled:    { label: "Comments",             desc: "Allow users to comment on posts",            emergency: true },
  messagingEnabled:   { label: "Messaging",            desc: "Allow direct and group messaging",           emergency: true },
  livestreamsEnabled: { label: "Live Streams",         desc: "Allow live broadcast sessions",              emergency: true },
  stories:            { label: "Stories",              desc: "24-hour ephemeral stories feature"           },
  liveStreaming:      { label: "Live Streaming",       desc: "Full live streaming module"                  },
  marketplace:        { label: "Marketplace",          desc: "Product listings and buying/selling"         },
  jobBoard:           { label: "Job Board",            desc: "Medical job postings and applications"       },
  voiceNotes:         { label: "Voice Notes",          desc: "Voice messages in chat"                      },
  groupChats:         { label: "Group Chats",          desc: "Multi-user chat rooms"                       },
  communities:        { label: "Communities",          desc: "Community groups and channels"               },
  aiModeration:       { label: "AI Moderation",        desc: "Automated content analysis and flagging"     },
  twoFactorAuth:      { label: "Two-Factor Auth",      desc: "Optional 2FA for all accounts"               },
  marketplaceEnabled: { label: "Marketplace (Global)", desc: "Global marketplace toggle"                   },
  jobsEnabled:        { label: "Jobs (Global)",        desc: "Global jobs module toggle"                   },
};

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { getFeatureFlags().then(setFlags); }, []);

  const toggle = async (key: string, current: boolean) => {
    if (!flags) return;
    setSaving(key);
    try {
      await updateFeatureFlag(key as any, !current);
      setFlags((prev) => prev ? { ...prev, [key]: !current } : prev);
    } finally {
      setSaving(null);
    }
  };

  const emergency = Object.entries(FLAG_LABELS).filter(([, v]) => v.emergency);
  const standard  = Object.entries(FLAG_LABELS).filter(([, v]) => !v.emergency);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Feature Flags</h1>
      <p className="text-slate-500 mb-8">Toggle platform features instantly — no deployment required.</p>

      {/* Emergency Controls */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-red-600 uppercase tracking-wider mb-3">🚨 Emergency Controls</h2>
        <div className="space-y-2">
          {emergency.map(([key, meta]) => {
            const value = flags ? (flags as any)[key] : true;
            return (
              <div key={key} className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{meta.label}</p>
                  <p className="text-sm text-slate-500">{meta.desc}</p>
                </div>
                <button
                  onClick={() => toggle(key, value)}
                  disabled={saving === key || !flags}
                  className={`relative w-12 h-6 rounded-full transition-colors ${value ? "bg-green-500" : "bg-red-500"} ${saving === key ? "opacity-50" : ""}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${value ? "translate-x-6" : "translate-x-0"}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Standard Flags */}
      <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Standard Features</h2>
      <div className="space-y-2">
        {standard.map(([key, meta]) => {
          const value = flags ? (flags as any)[key] : true;
          return (
            <div key={key} className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{meta.label}</p>
                <p className="text-sm text-slate-500">{meta.desc}</p>
              </div>
              <button
                onClick={() => toggle(key, value)}
                disabled={saving === key || !flags}
                className={`relative w-12 h-6 rounded-full transition-colors ${value ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"} ${saving === key ? "opacity-50" : ""}`}
              >
                <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${value ? "translate-x-6" : "translate-x-0"}`} />
              </button>
            </div>
          );
        })}
      </div>
      {flags && (
        <p className="text-xs text-slate-400 mt-4 text-center">Last updated by {flags.updatedBy}</p>
      )}
    </div>
  );
}
