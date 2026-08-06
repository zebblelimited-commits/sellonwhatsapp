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
  lastLogin: any; // Timestamp
  createdBy: string;
  createdAt: any; // Timestamp
}

// Verify admin token + fetch profile
export async function verifyAdminToken(token: string): Promise<AdminUser | null> {
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const adminDoc = await adminDb.collection('admins').doc(decoded.uid).get();
    
    if (!adminDoc.exists || !adminDoc.data()?.isActive) {
      return null;
    }
    
    return { uid: decoded.uid, ...adminDoc.data() } as AdminUser;
  } catch (error) {
    console.error('Admin token verification failed:', error);
    return null;
  }
}

// Middleware helper for API routes
export async function requireAdmin(req: NextRequest, requiredPermissions?: Partial<AdminUser['permissions']>) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const admin = await verifyAdminToken(token);
  if (!admin) {
    return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401 });
  }
  
  // Check required permissions if specified
  if (requiredPermissions) {
    for (const [module, perms] of Object.entries(requiredPermissions)) {
      const adminPerms = admin.permissions[module as keyof typeof admin.permissions];
      if (!adminPerms) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      
      for (const [action, required] of Object.entries(perms as any)) {
        if (required && !(adminPerms as any)[action]) {
          return NextResponse.json({ error: `Missing permission: ${module}.${action}` }, { status: 403 });
        }
      }
    }
  }
  
  return { admin, response: null };
}