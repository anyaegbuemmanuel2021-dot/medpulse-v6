"use client";
import React, { useEffect, useState } from "react";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    getDocs(query(collection(db(), "analytics"), orderBy("date", "desc"), limit(30)))
      .then((snap) => setMetrics(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, []);

  const latest: any = metrics[0] ?? {};

  const STAT_CARDS = [
    { label: "Total Users",    value: latest.totalUsers?.toLocaleString() ?? "—" },
    { label: "Daily Active",   value: latest.dau?.toLocaleString()        ?? "—" },
    { label: "Monthly Active", value: latest.mau?.toLocaleString()        ?? "—" },
    { label: "Total Posts",    value: latest.totalPosts?.toLocaleString() ?? "—" },
    { label: "Avg Session",    value: latest.avgSessionDuration ? `${latest.avgSessionDuration}s` : "—" },
    { label: "Retention",      value: latest.retentionRate ? `${(latest.retentionRate * 100).toFixed(1)}%` : "—" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Platform Analytics</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        {STAT_CARDS.map((s) => (
          <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Daily Snapshots</h2>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              {["Date","Users","Posts","DAU","MAU"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-slate-500 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {metrics.slice(0, 14).map((m: any) => (
              <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                  {m.date?.toDate?.()?.toLocaleDateString() ?? "—"}
                </td>
                <td className="px-4 py-3">{m.totalUsers?.toLocaleString() ?? "—"}</td>
                <td className="px-4 py-3">{m.totalPosts?.toLocaleString() ?? "—"}</td>
                <td className="px-4 py-3">{m.dau?.toLocaleString() ?? "—"}</td>
                <td className="px-4 py-3">{m.mau?.toLocaleString() ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
