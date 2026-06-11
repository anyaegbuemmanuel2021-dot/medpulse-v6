"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getTabFeed, trackWatchActivity } from "@/services/feed.service.v5";
import type { Post, FeedTab } from "@/types";

// ─── Feed Tab bar ─────────────────────────────────────────────────────────────
const TABS: { key: FeedTab; label: string }[] = [
  { key: "for_you",     label: "For You"      },
  { key: "following",   label: "Following"    },
  { key: "trending",    label: "Trending"     },
  { key: "communities", label: "Communities"  },
  { key: "live",        label: "🔴 Live"      },
  { key: "latest",      label: "Latest"       },
];

// ─── Auth nudge overlay ───────────────────────────────────────────────────────
function AuthNudge({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-2xl p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Join MedPulse</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4 text-sm">
          Create an account to like, comment, follow creators, and get a personalised feed.
        </p>
        <div className="flex gap-3">
          <a
            href="/auth/register"
            className="flex-1 text-center py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition"
          >
            Sign Up Free
          </a>
          <a
            href="/auth/login"
            className="flex-1 text-center py-3 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            Log In
          </a>
        </div>
        <button
          onClick={onDismiss}
          className="w-full mt-3 text-slate-500 text-sm hover:underline"
        >
          Continue as guest
        </button>
      </div>
    </div>
  );
}

// ─── Single Post Card ─────────────────────────────────────────────────────────
function FeedCard({
  post,
  onAction,
}: {
  post: Post;
  onAction: (action: string) => void;
}) {
  const viewRef = useRef<HTMLDivElement>(null);
  const startTime = useRef<number>(Date.now());

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) startTime.current = Date.now();
        else {
          const duration = (Date.now() - startTime.current) / 1000;
          if (duration > 1) trackWatchActivity(post.id, duration, "view");
        }
      },
      { threshold: 0.7 }
    );
    if (viewRef.current) observer.observe(viewRef.current);
    return () => observer.disconnect();
  }, [post.id]);

  return (
    <div
      ref={viewRef}
      className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Media */}
      {post.content?.thumbnailURL && (
        <div className="aspect-video bg-slate-100 dark:bg-slate-800 relative">
          <img
            src={post.content.thumbnailURL}
            alt={post.title ?? ""}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {post.contentType === "video" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-lg"
                aria-label="Play"
              >
                <svg className="w-6 h-6 text-slate-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Body */}
      <div className="p-4">
        {/* Author */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-300">
            {(post.userProfile?.fullName ?? post.userProfile?.username ?? "?")[0].toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white leading-none">
              {post.userProfile?.fullName ?? post.userProfile?.username}
              {post.userProfile?.isVerified && (
                <span className="ml-1 text-blue-500" title="Verified">✓</span>
              )}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {post.specialty ?? post.contentType}
            </p>
          </div>
        </div>

        {/* Content */}
        {post.title && (
          <h3 className="font-semibold text-slate-900 dark:text-white mb-1 line-clamp-2">
            {post.title}
          </h3>
        )}
        <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mb-3">
          {post.description}
        </p>

        {/* Tags */}
        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {post.tags.slice(0, 4).map((tag) => (
              <a
                key={tag}
                href={`/hashtag/${tag}`}
                className="text-xs px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full hover:bg-blue-100 transition"
              >
                #{tag}
              </a>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex gap-4">
            {[
              { icon: "♥", count: post.likes,    action: "like",    label: "Like" },
              { icon: "💬", count: post.comments, action: "comment", label: "Comment" },
              { icon: "↗", count: post.shares,   action: "share",   label: "Share" },
              { icon: "🔖", count: post.saves,    action: "save",    label: "Save" },
            ].map(({ icon, count, action, label }) => (
              <button
                key={action}
                onClick={() => onAction(action)}
                className="flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition text-sm"
                aria-label={label}
              >
                <span>{icon}</span>
                <span>{count ?? 0}</span>
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400">
            {post.views ?? 0} views
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Guest top bar ────────────────────────────────────────────────────────────
function GuestTopBar() {
  return (
    <div className="sticky top-0 z-30 bg-white/80 dark:bg-slate-950/80 backdrop-blur border-b border-slate-100 dark:border-slate-800">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">MedPulse</span>
        <div className="flex gap-2">
          <a href="/auth/login" className="text-sm px-3 py-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition">
            Log in
          </a>
          <a href="/auth/register" className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
            Sign up
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Main Feed Page ────────────────────────────────────────────────────────────
export default function FeedPage() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<FeedTab>("for_you");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [showAuthNudge, setShowAuthNudge] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);

  const loadFeed = useCallback(
    async (tab: FeedTab, reset = false) => {
      setLoading(true);
      try {
        const { posts: newPosts, nextCursor } = await getTabFeed({
          tab,
          userId: user?.uid ?? null,
          cursor: reset ? null : cursor,
          limit: 12,
        });
        setPosts((prev) => (reset ? newPosts : [...prev, ...newPosts]));
        setCursor(nextCursor ?? null);
        setHasMore(!!nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [user?.uid, cursor]
  );

  // Load on tab change
  useEffect(() => {
    if (authLoading) return;
    setPosts([]);
    setCursor(null);
    loadFeed(activeTab, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, authLoading, user?.uid]);

  // Infinite scroll
  useEffect(() => {
    if (!loaderRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !loading) loadFeed(activeTab); },
      { rootMargin: "200px" }
    );
    obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading, activeTab, loadFeed]);

  const handleAction = (action: string) => {
    if (!user) setShowAuthNudge(true);
    // Authenticated action handlers go here
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {!user && <GuestTopBar />}
      {showAuthNudge && <AuthNudge onDismiss={() => setShowAuthNudge(false)} />}

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div className="sticky top-[52px] z-20 bg-white/90 dark:bg-slate-950/90 backdrop-blur border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto scrollbar-none py-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition
                  ${activeTab === tab.key
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Feed ──────────────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {loading && posts.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse h-64" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20 text-slate-500 dark:text-slate-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="font-medium">Nothing here yet.</p>
            {activeTab === "following" && !user && (
              <a href="/auth/register" className="mt-4 inline-block px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium">
                Sign up to follow creators
              </a>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {posts.map((post) => (
              <FeedCard key={post.id} post={post} onAction={handleAction} />
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={loaderRef} className="h-10 flex items-center justify-center mt-4">
          {loading && posts.length > 0 && (
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>
    </div>
  );
}
