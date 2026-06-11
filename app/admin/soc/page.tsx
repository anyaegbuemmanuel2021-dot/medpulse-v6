"use client";
import React, { useEffect, useState } from "react";
import {
  getLatestHealthSnapshot, getHealthHistory, getActiveAlerts,
} from "@/services/monitoring.service";
import type { SystemHealthSnapshot, SystemAlert } from "@/types";

function Gauge({ value, label }: { value: number; label: string }) {
  const color = value > 85 ? "text-red-600" : value > 60 ? "text-orange-500" : "text-green-600";
  return (
    <div className="text-center">
      <p className={`text-3xl font-bold ${color}`}>{value.toFixed(1)}%</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}

export default function SOCPage() {
  const [health, setHealth]   = useState<SystemHealthSnapshot | null>(null);
  const [alerts, setAlerts]   = useState<SystemAlert[]>([]);

  useEffect(() => {
    getLatestHealthSnapshot().then(setHealth);
    getActiveAlerts().then(setAlerts);
    const id = setInterval(() => {
      getLatestHealthSnapshot().then(setHealth);
      getActiveAlerts().then(setAlerts);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const threatLevel = alerts.some((a) => a.severity === "critical") ? "CRITICAL" :
                      alerts.some((a) => a.severity === "warning")  ? "ELEVATED" : "NORMAL";
  const tlColor = { CRITICAL: "bg-red-600", ELEVATED: "bg-orange-500", NORMAL: "bg-green-500" }[threatLevel];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Security Operations Center</h1>
        <span className={`px-4 py-1.5 rounded-full text-white font-bold text-sm ${tlColor}`}>
          Threat Level: {threatLevel}
        </span>
      </div>

      {/* System Health */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-6">System Health</h2>
        {health ? (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-6">
            <Gauge value={health.cpu}    label="CPU" />
            <Gauge value={health.memory} label="Memory" />
            <Gauge value={health.storage}label="Storage" />
            <Gauge value={health.dbLoad} label="DB Load" />
            <Gauge value={health.errorRate * 100} label="Error Rate" />
            <Gauge value={health.uptimePercent} label="Uptime" />
          </div>
        ) : (
          <p className="text-slate-500">Loading system metrics…</p>
        )}
        {health && (
          <p className="text-xs text-slate-400 mt-4 text-right">
            API: {health.apiResponseTime}ms · Connections: {health.activeConnections}
          </p>
        )}
      </div>

      {/* Active Alerts */}
      <div>
        <h2 className="font-semibold text-slate-900 dark:text-white mb-3">
          Active Alerts <span className="ml-2 text-sm text-red-600">({alerts.length})</span>
        </h2>
        {alerts.length === 0 ? (
          <div className="p-6 bg-green-50 dark:bg-green-900/20 rounded-2xl text-center text-green-700 font-medium">
            ✓ All systems operational. No active alerts.
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((a) => (
              <div key={a.id} className={`p-4 rounded-xl border ${
                a.severity === "critical" ? "border-red-400 bg-red-50 dark:bg-red-900/20" :
                a.severity === "warning"  ? "border-orange-400 bg-orange-50 dark:bg-orange-900/20" :
                "border-blue-300 bg-blue-50 dark:bg-blue-900/20"}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{a.message}</p>
                    <p className="text-sm text-slate-500">
                      {a.alertType.toUpperCase()} · Value: {a.value} · Threshold: {a.threshold}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    a.severity === "critical" ? "bg-red-600 text-white" :
                    a.severity === "warning"  ? "bg-orange-500 text-white" : "bg-blue-500 text-white"}`}>
                    {a.severity.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
