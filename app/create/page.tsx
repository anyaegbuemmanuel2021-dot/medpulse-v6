"use client";
import React from "react";

const CREATE_OPTIONS = [
  { href: "/create/video",   icon: "🎥", label: "Video",          desc: "Upload or record a video post" },
  { href: "/create/article", icon: "📝", label: "Article",        desc: "Write a long-form article or case study" },
  { href: "/create/poll",    icon: "📊", label: "Poll",           desc: "Collect opinions from the community" },
  { href: "/create/live",    icon: "📡", label: "Go Live",        desc: "Start a live stream session" },
  { href: "/create/post",    icon: "💬", label: "Quick Post",     desc: "Share a thought, image, or update" },
  { href: "/create/event",   icon: "📅", label: "Event",          desc: "Schedule a webinar or conference" },
];

export default function CreatePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Create Content</h1>
      <p className="text-slate-500 mb-8">Share your knowledge with the MedPulse community.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CREATE_OPTIONS.map((o) => (
          <a key={o.href} href={o.href}
            className="flex gap-4 p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-blue-400 hover:shadow-md transition">
            <span className="text-3xl">{o.icon}</span>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{o.label}</p>
              <p className="text-sm text-slate-500">{o.desc}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
