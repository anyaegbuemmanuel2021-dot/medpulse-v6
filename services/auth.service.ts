/**
 * MedPulse Enterprise – Auth Service  v4.0
 * Integrates progressive login lockout, device tracking, and audit logging.
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
  sendEmailVerification,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { createUserDocument, getUserDocument } from "./user.service";
import { checkLoginAllowed, recordFailedLogin, clearFailedLogin } from "./security.service";
import type { UserProfile, UserRole } from "@/types";

export interface AuthResponse {
  user: UserProfile | null;
  success: boolean;
  error?: string;
  lockedUntil?: number;
}

/** Generate a simple device fingerprint from browser env */
function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "server";
  return btoa(
    [navigator.userAgent, navigator.language, screen.width, screen.height].join("|")
  ).slice(0, 32);
}

/**
 * Register new user with email and password.
 * Sends email verification automatically.
 */
export async function registerWithEmail(
  email: string,
  password: string,
  fullName: string,
  username: string,
  role: UserRole = "user" as UserRole
): Promise<AuthResponse> {
  try {
    const auth = getFirebaseAuth();
    await setPersistence(auth, browserLocalPersistence);

    const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, password);

    await updateProfile(firebaseUser, { displayName: fullName });
    await sendEmailVerification(firebaseUser);

    const user = await createUserDocument(firebaseUser, role, { fullName, username });
    return { user, success: true };
  } catch (error: unknown) {
    return {
      user: null,
      success: false,
      error: (error as Error).message ?? "Registration failed",
    };
  }
}

/**
 * Sign in with email and password.
 * Enforces lockout policy BEFORE attempting Firebase auth.
 */
export async function loginWithEmail(
  email: string,
  password: string
): Promise<AuthResponse> {
  try {
    // ── Check lockout FIRST ──────────────────────────────────────────────────
    const ip = ""; // In production, pass client IP via a server endpoint
    const lockStatus = await checkLoginAllowed(email, ip);
    if (!lockStatus.allowed) {
      return {
        user: null,
        success: false,
        error: "Account temporarily locked due to too many failed attempts.",
        lockedUntil: lockStatus.lockedUntil,
      };
    }

    const auth = getFirebaseAuth();
    await setPersistence(auth, browserLocalPersistence);

    let firebaseUser: FirebaseUser;
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      firebaseUser = result.user;
    } catch (authError: unknown) {
      // Record failed attempt
      await recordFailedLogin(email, ip, navigator.userAgent);
      throw authError;
    }

    // ── Clear failed login counter ───────────────────────────────────────────
    await clearFailedLogin(email);

    const user = await getUserDocument(firebaseUser.uid);
    if (!user) throw new Error("User document not found.");

    if ((user as any).isBanned) {
      await signOut(auth);
      return { user: null, success: false, error: "Account has been banned." };
    }

    return { user, success: true };
  } catch (error: unknown) {
    return { user: null, success: false, error: (error as Error).message ?? "Login failed" };
  }
}

export async function loginWithGoogle(): Promise<AuthResponse> {
  try {
    const auth     = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    await setPersistence(auth, browserLocalPersistence);
    const { user: firebaseUser } = await signInWithPopup(auth, provider);

    let user = await getUserDocument(firebaseUser.uid);
    if (!user) {
      user = await createUserDocument(firebaseUser, "user" as UserRole, {
        fullName: firebaseUser.displayName ?? "User",
        username: firebaseUser.email?.split("@")[0] ?? firebaseUser.uid.slice(0, 8),
      });
    }
    return { user, success: true };
  } catch (error: unknown) {
    return { user: null, success: false, error: (error as Error).message ?? "Google login failed" };
  }
}

export async function logoutUser(): Promise<boolean> {
  try {
    await signOut(getFirebaseAuth());
    return true;
  } catch {
    return false;
  }
}

export async function resetPassword(email: string): Promise<boolean> {
  try {
    await sendPasswordResetEmail(getFirebaseAuth(), email);
    return true;
  } catch {
    return false;
  }
}

export function getCurrentUser(): FirebaseUser | null {
  return getFirebaseAuth().currentUser;
}

export async function getUserIdToken(): Promise<string | null> {
  try {
    return (await getCurrentUser()?.getIdToken()) ?? null;
  } catch {
    return null;
  }
}

export function isUserAuthenticated(): boolean {
  return getCurrentUser() !== null;
}
