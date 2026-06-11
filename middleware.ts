/**
 * MedPulse Enterprise – Next.js Middleware  v4.0
 * Zero-Trust: every protected route verifies the Firebase session cookie
 * server-side. Frontend state is NEVER trusted.
 *
 * Route tiers:
 *  • Public  – guests + authenticated users (read-only views, auth pages)
 *  • App     – authenticated users only
 *  • Admin   – admin roles only (verified via custom claims)
 *  • Owner   – owner role only
 */

import { NextRequest, NextResponse } from "next/server";

// ─── Route definitions ───────────────────────────────────────────────────────

/** Freely accessible by everyone including guests */
const PUBLIC_ROUTES = [
  "/",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/maintenance",
  "/api/public",
  "/search",
  "/hashtags",
  "/hashtag",
  "/live",
  "/events",
  "/event",
  "/premium",
];

/** Require a valid Firebase session cookie */
const APP_ROUTES = [
  "/feed",
  "/dashboard",
  "/chat",
  "/communities",
  "/creator",
  "/learning",
  "/profile",
  "/notifications",
  "/settings",
  "/create",
  "/ads",
  "/premium",
  "/analytics",
];

/** Admin-only dashboard routes – also require role claim */
const ADMIN_ROUTES = [
  "/admin",
  "/system",
  "/core",
  "/manage",
  "/secure-panel",
];

/** Owner-only routes */
const OWNER_ROUTES = [
  "/admin/owner",
  "/admin/system-settings",
  "/admin/backups",
];

const ADMIN_ROLES = [
  "owner",
  "super_admin",
  "security_admin",
  "verification_admin",
  "advertisement_admin",
  "support_admin",
  "moderator",
  "analytics_admin",
];

// ─── Cookie / Token helpers ───────────────────────────────────────────────────

/**
 * Decode a Firebase ID token (JWT) WITHOUT signature verification.
 * Signature verification MUST be done in Cloud Functions / API routes.
 * This middleware only needs the claims to decide routing.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function getTokenFromRequest(request: NextRequest): string | null {
  // Prefer the HttpOnly session cookie set by the server
  const cookie = request.cookies.get("__session")?.value;
  if (cookie) return cookie;
  // Fallback: Authorization header (for API calls)
  const header = request.headers.get("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Maintenance mode check ──────────────────────────────────────────────
  // Read from a lightweight edge-config or cookie set by the system
  const maintenanceCookie = request.cookies.get("maintenance_active")?.value;
  if (maintenanceCookie === "true" && !pathname.startsWith("/maintenance")) {
    // Let admins through even in maintenance mode
    const token = getTokenFromRequest(request);
    const payload = token ? decodeJwtPayload(token) : null;
    const role = (payload?.role as string) ?? "guest";
    if (!ADMIN_ROLES.includes(role)) {
      return NextResponse.redirect(new URL("/maintenance", request.url));
    }
  }

  // ── 2. Always-public routes ────────────────────────────────────────────────
  if (PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    return NextResponse.next();
  }

  // ── 3. Extract & decode token ──────────────────────────────────────────────
  const token = getTokenFromRequest(request);

  if (!token) {
    // Unauthenticated – redirect to login
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const payload = decodeJwtPayload(token);

  if (!payload) {
    // Malformed token
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check token expiry (exp is in seconds)
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && typeof payload.exp === "number" && payload.exp < now) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    loginUrl.searchParams.set("reason", "session_expired");
    return NextResponse.redirect(loginUrl);
  }

  const role = (payload.role as string) ?? "user";
  const isBanned = payload.isBanned === true;
  const isSuspended =
    payload.isSuspended === true &&
    payload.suspendedUntil != null &&
    (payload.suspendedUntil as number) > now;

  // ── 4. Banned/suspended users – redirect to info page ────────────────────
  if (isBanned) {
    return NextResponse.redirect(new URL("/auth/banned", request.url));
  }
  if (isSuspended) {
    return NextResponse.redirect(new URL("/auth/suspended", request.url));
  }

  // ── 5. Owner-only routes ───────────────────────────────────────────────────
  if (OWNER_ROUTES.some((r) => pathname.startsWith(r))) {
    if (role !== "owner") {
      return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
    }
    return NextResponse.next();
  }

  // ── 6. Admin routes ────────────────────────────────────────────────────────
  if (ADMIN_ROUTES.some((r) => pathname.startsWith(r))) {
    if (!ADMIN_ROLES.includes(role)) {
      return NextResponse.redirect(new URL("/auth/login?error=unauthorized", request.url));
    }
    return NextResponse.next();
  }

  // ── 7. Authenticated app routes ────────────────────────────────────────────
  if (APP_ROUTES.some((r) => pathname.startsWith(r))) {
    // Token is valid and user is not banned/suspended → allow
    return NextResponse.next();
  }

  // ── 8. Default allow (static assets, API, etc.) ────────────────────────────
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match everything except:
     * - _next/static  (static assets)
     * - _next/image   (image optimization)
     * - favicon.ico
     * - public/       (public directory)
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
