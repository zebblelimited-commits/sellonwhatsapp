import { adminAuth, adminDb } from "./firebase-admin";
import { NextRequest, NextResponse } from "next/server";

export type AdminRole = 'super_admin' | 'admin' | 'support' | 'finance' | 'moderator';

export interface AdminUser {
  uid: string;
  email: string;
  role: AdminRole;
  permissions: {
    users: { read: boolean; write: boolean; delete: boolean };
    stores: { read: boolean; write: boolean; delete: boolean; ban: boolean };
    orders: { read: boolean; write: boolean; refund: boolean };
    payouts: { read: boolean; approve: boolean; reject: boolean };
    disputes: { read: boolean; resolve: boolean; escalate: boolean };
    analytics: { read: boolean; export: boolean };
    settings: { read: boolean; write: boolean };
    chat: { read: boolean; write: boolean };
    notifications: { read: boolean; send: boolean };
  };
  isActive: boolean;
  lastLogin: unknown; // Timestamp
  createdBy: string;
  createdAt: unknown; // Timestamp
}

// Verify admin token + fetch profile
async function getActiveAdmin(uid: string): Promise<AdminUser | null> {
  const adminDoc = await adminDb.collection('admins').doc(uid).get();

  if (!adminDoc.exists || !adminDoc.data()?.isActive) {
    return null;
  }

  return { uid, ...adminDoc.data() } as AdminUser;
}

export async function verifyAdminToken(token: string): Promise<AdminUser | null> {
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return getActiveAdmin(decoded.uid);
  } catch (error) {
    console.error('Admin token verification failed:', error);
    return null;
  }
}

async function verifyAdminSessionCookie(sessionCookie: string): Promise<AdminUser | null> {
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    return getActiveAdmin(decoded.uid);
  } catch (error) {
    console.error('Admin session verification failed:', error);
    return null;
  }
}

// Middleware helper for API routes
export async function requireAdmin(req: NextRequest, requiredPermissions?: Partial<AdminUser['permissions']>) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  const sessionCookie = req.cookies.get('__session')?.value;
  const admin = (token ? await verifyAdminToken(token) : null)
    || (sessionCookie ? await verifyAdminSessionCookie(sessionCookie) : null);
  if (!admin) {
    return NextResponse.json({ error: token ? 'Invalid admin credentials' : 'Unauthorized' }, { status: 401 });
  }
  
  // Check required permissions if specified
  if (requiredPermissions) {
    for (const [module, perms] of Object.entries(requiredPermissions)) {
      const adminPerms = admin.permissions[module as keyof typeof admin.permissions];
      if (!adminPerms) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      
      for (const [action, required] of Object.entries(perms as Record<string, boolean>)) {
        if (required && !(adminPerms as unknown as Record<string, boolean>)[action]) {
          return NextResponse.json({ error: `Missing permission: ${module}.${action}` }, { status: 403 });
        }
      }
    }
  }
  
  return { admin, response: null };
}
