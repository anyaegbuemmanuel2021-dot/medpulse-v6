"use client";
/**
 * MedPulse V6 — Root Index Page
 * Authenticated users → /feed ; Guests → landing/splash
 */
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getFirebaseAuth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function IndexPage() {
  const router = useRouter();

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) router.replace("/feed");
    });
    return unsub;
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M2 12h20" />
          </svg>
        </div>
        <span className="text-3xl font-extrabold text-white tracking-tight">MedPulse</span>
      </div>
      <h1 className="text-4xl sm:text-5xl font-bold text-white text-center max-w-2xl leading-tight mb-4">
        Healthcare Education, <span className="text-blue-400">Reimagined</span>
      </h1>
      <p className="text-slate-400 text-center text-lg max-w-md mb-10">
        Short-form medical videos, live sessions, verified professionals,
        and AI-powered learning — all in one platform.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xs sm:max-w-sm">
        <a href="/auth/register" className="flex-1 text-center py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition">Get Started Free</a>
        <a href="/auth/login"    className="flex-1 text-center py-3.5 border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white font-semibold rounded-xl transition">Sign In</a>
      </div>
      <a href="/feed" className="mt-6 text-sm text-slate-500 hover:text-slate-300 transition underline underline-offset-2">Browse as guest</a>
      <div className="mt-16 flex flex-wrap justify-center gap-3 max-w-xl">
        {["Short-form Videos","Livestreams","Verified Credentials","AI Recommendations","Communities","Creator Studio","Hashtags","Messaging"].map((f) => (
          <span key={f} className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-slate-300 rounded-full border border-slate-700">{f}</span>
        ))}
      </div>
      <p className="mt-16 text-xs text-slate-600">&copy; {new Date().getFullYear()} MedPulse. All rights reserved.</p>
    </main>
  );
}
