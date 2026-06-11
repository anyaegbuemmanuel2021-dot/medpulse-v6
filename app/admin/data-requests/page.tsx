"use client";
import React, { useEffect, useState } from "react";
import { getPendingDataRequests } from "@/services/data-export.service";
import type { DataRequest } from "@/types";

export default function DataRequestsPage() {
  const [requests, setRequests] = useState<DataRequest[]>([]);
  useEffect(() => { getPendingDataRequests().then(setRequests); }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Data Requests (GDPR)</h1>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>{["User ID","Type","Status","Requested","Action"].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-slate-500 font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-mono text-xs">{r.userId.slice(0, 12)}…</td>
                <td className="px-4 py-3">{r.requestType.replace(/_/g, " ")}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                    ${r.status === "completed" ? "bg-green-100 text-green-700" :
                      r.status === "processing" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(r.requestedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <button className="text-xs px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                    Process
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {requests.length === 0 && (
          <p className="text-center py-10 text-slate-500">No pending data requests.</p>
        )}
      </div>
    </div>
  );
}
