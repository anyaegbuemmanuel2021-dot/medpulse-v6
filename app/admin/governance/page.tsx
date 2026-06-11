"use client";
import React, { useEffect, useState } from "react";
import { getTransparencyReports } from "@/services/governance.service";
import type { TransparencyReport } from "@/types";

export default function GovernancePage() {
  const [reports, setReports] = useState<TransparencyReport[]>([]);
  useEffect(() => { getTransparencyReports().then(setReports); }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Platform Governance</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: "⚖️", label: "Appeals System",        href: "/appeals" },
          { icon: "📜", label: "Policy Management",     href: "/admin/settings/policies" },
          { icon: "📊", label: "Transparency Reports",  href: "#reports" },
        ].map((m) => (
          <a key={m.label} href={m.href}
            className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-blue-400 transition text-center">
            <p className="text-3xl mb-2">{m.icon}</p>
            <p className="font-semibold text-slate-900 dark:text-white">{m.label}</p>
          </a>
        ))}
      </div>

      <div id="reports">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-3">Transparency Reports</h2>
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <div>
                <p className="font-semibold">{r.period}</p>
                <p className="text-sm text-slate-500">
                  {r.totalReports.toLocaleString()} reports · {r.accountsBanned.toLocaleString()} bans
                </p>
              </div>
              {r.reportURL && (
                <a href={r.reportURL} target="_blank"
                  className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                  View PDF
                </a>
              )}
            </div>
          ))}
          {reports.length === 0 && <p className="text-slate-500 text-sm">No transparency reports published yet.</p>}
        </div>
      </div>
    </div>
  );
}
