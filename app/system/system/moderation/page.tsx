'use client';

import React, { useState, useEffect } from 'react';
import { isUserAdmin } from '@/services/user.service';
import { useAuth } from '@/hooks/useAuth';
import { getPendingModerationItems } from '@/services/moderation.service';
import { Button } from '@/components/Button';
import { Tabs } from '@/components/Tabs';
import { redirect } from 'next/navigation';

interface ModerationItem {
  id: string;
  contentId: string;
  contentType: string;
  reportedBy: string;
  status: string;
  createdAt: Date;
}

export default function ModerationPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    
    if (!user || !isUserAdmin(user)) {
      redirect('/dashboard');
    }

    loadModerationItems();
  }, [user, loading]);

  async function loadModerationItems() {
    try {
      const data = await getPendingModerationItems(50);
      setItems(data as ModerationItem[]);
    } finally {
      setIsLoading(false);
    }
  }

  if (!user || !isUserAdmin(user)) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Moderation Center</h1>
          <p className="text-lg text-slate-600">
            Review and manage reported content
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-xl p-6 border border-slate-200">
            <p className="text-sm font-medium text-slate-600 mb-2">Pending Review</p>
            <p className="text-3xl font-bold text-slate-900">{items.length}</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-slate-200">
            <p className="text-sm font-medium text-slate-600 mb-2">Avg. Response Time</p>
            <p className="text-3xl font-bold text-slate-900">2.5h</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-slate-200">
            <p className="text-sm font-medium text-slate-600 mb-2">Actions This Month</p>
            <p className="text-3xl font-bold text-slate-900">342</p>
          </div>
        </div>

        {/* Moderation Queue */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900">Pending Items</h2>
          </div>

          {isLoading ? (
            <div className="p-8 text-center">
              <p className="text-slate-600">Loading moderation items...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-600">No pending items to review</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {items.map((item) => (
                <div key={item.id} className="p-6 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">
                        {item.contentType.toUpperCase()}: {item.contentId.substring(0, 8)}
                      </p>
                      <p className="text-sm text-slate-600 mt-1">
                        Reported by: {item.reportedBy}
                      </p>
                      <p className="text-xs text-slate-500 mt-2">
                        {item.createdAt.toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button size="sm" variant="primary">
                        Review
                      </Button>
                      <Button size="sm" variant="secondary">
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
