"use client";
/**
 * MedPulse V6 — App Providers
 */
import React, { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFirebaseApp } from "@/lib/firebase";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000*60*5, gcTime: 1000*60*10, retry: 1, refetchOnWindowFocus: false },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    getFirebaseApp();
    setMounted(true);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {});
    }
  }, []);

  if (!mounted) return null;

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
