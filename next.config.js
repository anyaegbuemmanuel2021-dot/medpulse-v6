/**
 * MedPulse V6 — Next.js 15 Configuration
 * Optimised for Vercel & Netlify deployment
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Image optimisation
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cloudinary.com" },
      { protocol: "https", hostname: "**.firebaseapp.com" },
      { protocol: "https", hostname: "**.googleapis.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com https://upload-widget.cloudinary.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "media-src 'self' blob: https:",
              "connect-src 'self' https://*.firebase.com https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://api.cloudinary.com",
              "frame-src 'self' https://accounts.google.com",
            ].join("; "),
          },
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=300",
          },
        ],
      },
      {
        source: "/service-worker.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },

  // Redirects
  async redirects() {
    return [
      { source: "/home", destination: "/", permanent: true },
      { source: "/index", destination: "/", permanent: true },
    ];
  },

  // Rewrites — proxy Firebase functions calls server-side to avoid CORS
  async rewrites() {
    return [
      {
        source: "/api/functions/:path*",
        destination: `${process.env.NEXT_PUBLIC_FUNCTIONS_URL || "https://us-central1-medpulse-v6.cloudfunctions.net"}/:path*`,
      },
    ];
  },

  // Bundle optimisation
  webpack(config, { isServer }) {
    if (!isServer) {
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks.cacheGroups,
          firebase: {
            test: /[\\/]node_modules[\\/]firebase[\\/]/,
            name: "firebase",
            priority: 20,
            reuseExistingChunk: true,
          },
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendors",
            priority: 10,
            reuseExistingChunk: true,
          },
        },
      };
    }
    return config;
  },

  transpilePackages: ["lucide-react"],
  compress: true,
  productionBrowserSourceMaps: false,
  trailingSlash: false,

  experimental: {
    optimizeCss: true,
  },

  env: {
    NEXT_PUBLIC_APP_NAME: "MedPulse",
    NEXT_PUBLIC_APP_VERSION: "6.0.0",
  },
};

module.exports = nextConfig;
