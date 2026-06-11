"use client";
import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  collection, query, where, orderBy, limit, getDocs,
} from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";

const TABS = ["All","Posts","Videos","Articles","Users","Communities","Hashtags","Events"];

export default function SearchPage() {
  const params = useSearchParams();
  const q      = params.get("q") ?? "";
  const [tab, setTab]       = useState("All");
  const [results, setResults] = useState<Record<string, unknown[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q) return;
    setLoading(true);
    const firestore = db();
    const end = q + "\uf8ff";

    Promise.all([
      getDocs(query(collection(firestore, "posts"), where("title", ">=", q), where("title", "<=", end), where("isApproved", "==", true), limit(10))),
      getDocs(query(collection(firestore, "users"), where("username", ">=", q), where("username", "<=", end), limit(10))),
      getDocs(query(collection(firestore, "hashtags"), where("slug", ">=", q.toLowerCase()), where("slug", "<=", q.toLowerCase() + "\uf8ff"), limit(10))),
      getDocs(query(collection(firestore, "communities"), where("name", ">=", q), where("name", "<=", end), limit(10))),
    ]).then(([posts, users, tags, comms]) => {
      setResults({
        Posts:       posts.docs.map((d) => ({ id: d.id, ...d.data() })),
        Users:       users.docs.map((d) => ({ id: d.id, ...d.data() })),
        Hashtags:    tags.docs.map((d) => ({ id: d.id, ...d.data() })),
        Communities: comms.docs.map((d) => ({ id: d.id, ...d.data() })),
      });
    }).finally(() => setLoading(false));
  }, [q]);

  const displayResults =
    tab === "All"
      ? Object.values(results).flat()
      : (results[tab] ?? []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {q ? `Results for "${q}"` : "Search MedPulse"}
        </h1>
      </div>
      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none mb-6">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition
              ${tab === t ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"}`}>
            {t}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
        ))}</div>
      ) : displayResults.length === 0 ? (
        <p className="text-slate-500 text-center py-12">No results found.</p>
      ) : (
        <div className="space-y-3">
          {displayResults.map((r: any) => (
            <div key={r.id} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
              <p className="font-medium text-slate-900 dark:text-white">{r.title ?? r.username ?? r.name ?? r.slug}</p>
              <p className="text-sm text-slate-500 line-clamp-1">{r.description ?? r.bio ?? ""}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
