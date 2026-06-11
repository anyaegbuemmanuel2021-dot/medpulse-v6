"use client";
import React, { useEffect, useState } from "react";
import {
  getHighRiskUsers, getSuspectedBanEvasion,
  getCoordinatedAbuseGroups,
} from "@/services/trust-safety.service";
import type { UserRiskScore, BanEvasionRecord, CoordinatedAbuseGroup } from "@/types";

export default function TrustSafetyPage() {
  const [riskUsers, setRiskUsers] = useState<UserRiskScore[]>([]);
  const [evasion, setEvasion]     = useState<BanEvasionRecord[]>([]);
  const [groups, setGroups]       = useState<CoordinatedAbuseGroup[]>([]);

  useEffect(() => {
    getHighRiskUsers(20).then(setRiskUsers);
    getSuspectedBanEvasion(20).then(setEvasion);
    getCoordinatedAbuseGroups(10).then(setGroups);
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Trust & Safety Operations</h1>

      {/* High-risk users */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">⚠️ High-Risk Users</h2>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>{["User ID","Risk Score","Level","Offenses","Reports","Bans"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-slate-500 font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {riskUsers.map((u) => (
                <tr key={u.userId}>
                  <td className="px-4 py-3 font-mono text-xs">{u.userId.slice(0, 12)}…</td>
                  <td className="px-4 py-3 font-bold text-red-600">{u.riskScore}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                      ${u.riskLevel === "critical" ? "bg-red-100 text-red-700" :
                        u.riskLevel === "high"     ? "bg-orange-100 text-orange-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {u.riskLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3">{u.offenseCount}</td>
                  <td className="px-4 py-3">{u.reportCount}</td>
                  <td className="px-4 py-3">{u.banCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ban evasion */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">🚫 Suspected Ban Evasion</h2>
        <div className="space-y-3">
          {evasion.map((r) => (
            <div key={r.id} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-orange-200 dark:border-orange-800">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-mono text-xs text-slate-500">Original: {r.originalUserId.slice(0, 10)}… → Suspected: {r.suspectedUserId.slice(0, 10)}…</p>
                  <p className="text-sm mt-1">Confidence: <strong>{Math.round(r.confidence * 100)}%</strong></p>
                </div>
                <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">{r.status}</span>
              </div>
            </div>
          ))}
          {evasion.length === 0 && <p className="text-slate-500 text-sm">No suspected ban evasion detected.</p>}
        </div>
      </section>

      {/* Coordinated abuse */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">🕸 Coordinated Abuse Networks</h2>
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-red-200 dark:border-red-800">
              <p className="font-semibold">{g.evidenceType.replace(/_/g, " ").toUpperCase()}</p>
              <p className="text-sm text-slate-500">{g.userIds.length} users · Confidence {Math.round(g.confidence * 100)}%</p>
            </div>
          ))}
          {groups.length === 0 && <p className="text-slate-500 text-sm">No coordinated abuse groups detected.</p>}
        </div>
      </section>
    </div>
  );
}
