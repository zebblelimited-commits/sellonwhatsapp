// lib/auth-actions.ts
"use server"; 
import { adminAuth } from "@/lib/firebase-admin";

export async function setUserRole(uid: string, role: 'admin' | 'vendor' | 'buyer') {
  try {
    await adminAuth.setCustomUserClaims(uid, { role });
    return { success: true };
  } catch (error) {
    console.error("Error setting custom claims:", error);
    return { success: false, error: "Failed to set user role" };
  }
}