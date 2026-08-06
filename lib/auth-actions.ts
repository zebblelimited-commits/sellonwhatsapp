// /workspace/lib/auth-actions.ts
"use server";
import { adminAuth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

export async function setUserRole(uid: string, role: 'admin' | 'vendor' | 'buyer') {
  try {
    await adminAuth.setCustomUserClaims(uid, { role });
    return { success: true };
  } catch (error) {
    console.error("Error setting custom claims:", error);
    return { success: false, error: "Failed to set user role" };
  }
}

/**
 * Verify JWT token from session cookie
 * Returns decoded token if valid, null otherwise
 */
export async function verifySessionToken(): Promise<{ uid: string; email?: string; exp?: number } | null> {
  // ⚠️ NOTE: Keep 'await' if on Next.js 15. Remove 'await' if on Next.js 13/14.
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('__session')?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    // Verify the JWT token with Firebase Admin
    // __session contains a Firebase session cookie, not a client ID token.
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie);

    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      exp: decodedToken.exp,
    };
  } catch (error) {
    console.error('Session token verification failed:', error);
    return null;
  }
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser() {
  const user = await verifySessionToken();
  return user;
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}
