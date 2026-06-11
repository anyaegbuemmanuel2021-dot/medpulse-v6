"use client";
import React, { useEffect, useState } from "react";
import { getLiveStreams, getScheduledStreams } from "@/services/livestream.service";
import type { LiveStream } from "@/types";

export default function LivePage() {
  const [live, setLive] = useState<LiveStream[]>([]);
  const [scheduled, setScheduled] = useState<LiveStream[]>([]);
  useEffect(() => {
    getLiveStreams().then(setLive);
    getScheduledStreams().then(setScheduled);
  }, []);
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Live Now</h1>
      {live.length === 0 && <p className="text-slate-500 mb-8">No live streams right now. Check back soon.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {live.map((s) => (
          <a key={s.id} href={`/live/${s.id}`}
            className="block bg-white dark:bg-slate-900 rounded-2xl border border-red-200 overflow-hidden hover:shadow-md transition">
            <div className="aspect-video bg-slate-900 flex items-center justify-center relative">
              <span className="text-white text-4xl">📡</span>
              <span className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full font-medium">LIVE</span>
              <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">👁 {s.viewerCount}</span>
            </div>
            <div className="p-3">
              <p className="font-semibold text-slate-900 dark:text-white line-clamp-1">{s.title}</p>
              <p className="text-xs text-slate-500">{s.hostProfile?.fullName}</p>
            </div>
          </a>
        ))}
      </div>
      {scheduled.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Upcoming Streams</h2>
          <div className="space-y-3">
            {scheduled.map((s) => (
              <div key={s.id} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-2xl">📅</div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{s.title}</p>
                  <p className="text-xs text-slate-500">
                    {s.scheduledFor ? new Date(s.scheduledFor).toLocaleString() : "TBD"} · {s.hostProfile?.fullName}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
