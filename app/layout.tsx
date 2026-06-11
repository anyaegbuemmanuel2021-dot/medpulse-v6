/**
 * MedPulse V6 — Root Layout (Next.js 15)
 */
import type { Metadata, Viewport } from "next";
import { Providers } from "@/providers";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: { default: "MedPulse", template: "%s | MedPulse" },
  description: "TikTok for Healthcare — short-form medical videos, livestreams, verified credentials, and AI-powered learning.",
  keywords: ["medical education","healthcare","social learning","doctors","medical students"],
  authors: [{ name: "MedPulse" }],
  openGraph: { title: "MedPulse", description: "TikTok for Healthcare", type: "website", locale: "en_US", siteName: "MedPulse" },
  twitter: { card: "summary_large_image", title: "MedPulse", description: "TikTok for Healthcare" },
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "MedPulse" },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, maximumScale: 5, themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
