"use client";
import React, { useEffect, useState } from "react";
import { getFeatureFlags, updateFeatureFlag } from "@/services/feature-flags.service";
import { createAnnouncement } from "@/services/announcement.service";
import type { FeatureFlags } from "@/types";

const EMERGENCY_FEATURES = [
  { key: "userRegistration",   label: "New Registrations",  desc: "Disable to stop all new signups" },
  { key: "uploadsEnabled",     label: "Content Uploads",    desc: "Disable all file/media uploads" },
  { key: "commentsEnabled",    label: "Comments",           desc: "Disable commenting platform-wide" },
  { key: "messagingEnabled",   label: "Messaging",          desc: "Disable all DMs and group chats" },
  { key: "livestreamsEnabled", label: "Live Streams",       desc: "Disable all live broadcasts" },
];

export default function EmergencyControlsPage() {
  const [flags, setFlags]           = useState<FeatureFlags | null>(null);
  const [noticeMsg, setNoticeMsg]   = useState("");
  const [noticeSeverity, setNoticeSeverity] = useState<"info" | "warning" | "critical">("warning");
  const [saving, setSaving]         = useState(false);

  useEffect(() => { getFeatureFlags().then(setFlags); }, []);

  const toggleFlag = async (key: string, current: boolean) => {
    setSaving(true);
    try {
      await updateFeatureFlag(key as any, !current);
      setFlags((p) => p ? { ...p, [key]: !current } : p);
    } finally { setSaving(false); }
  };

  const sendNotice = async () => {
    if (!noticeMsg.trim()) return;
    setSaving(true);
    try {
      await createAnnouncement({
        title: "Platform Notice",
        body: noticeMsg,
        type: "emergency",
        isActive: true,
        targetFilter: {},
        createdBy: "admin",
      });
      setNoticeMsg("");
      alert("Emergency notice published.");
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-red-700 mb-1">🚨 Emergency Platform Controls</h1>
        <p className="text-slate-500">Instantly disable platform features without a deployment.</p>
      </div>

      <div className="space-y-3">
        {EMERGENCY_FEATURES.map((f) => {
          const value = flags ? (flags as any)[f.key] : true;
          return (
            <div key={f.key} className={`flex items-center justify-between p-5 rounded-2xl border-2 transition
              ${!value ? "border-red-500 bg-red-50 dark:bg-red-900/20" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"}`}>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">{f.label}</p>
                <p className="text-sm text-slate-500">{f.desc}</p>
                {!value && <p className="text-xs text-red-600 font-bold mt-1">⛔ DISABLED</p>}
              </div>
              <button onClick={() => toggleFlag(f.key, value)} disabled={saving}
                className={`px-4 py-2 rounded-xl font-medium text-sm transition
                  ${value ? "bg-red-600 text-white hover:bg-red-700" : "bg-green-600 text-white hover:bg-green-700"}`}>
                {value ? "Disable Now" : "Re-enable"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Emergency notice */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6">
        <h2 className="font-bold text-slate-900 dark:text-white mb-3">📢 Publish Emergency Notice</h2>
        <select value={noticeSeverity} onChange={(e) => setNoticeSeverity(e.target.value as any)}
          className="w-full mb-3 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900">
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
        <textarea
          value={noticeMsg}
          onChange={(e) => setNoticeMsg(e.target.value)}
          placeholder="Enter emergency message visible to all users…"
          rows={4}
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm resize-none bg-white dark:bg-slate-900 mb-3"
        />
        <button onClick={sendNotice} disabled={saving || !noticeMsg.trim()}
          className="w-full py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition disabled:opacity-50">
          Publish Notice to All Users
        </button>
      </div>
    </div>
  );
}
