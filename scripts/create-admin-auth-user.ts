// scripts/create-admin-auth-user.ts
import { config } from "dotenv";
import * as admin from "firebase-admin"; // ✅ Use namespace import for Admin SDK

config({ path: ".env.local" });

const parsePrivateKey = (key: string | undefined): string | undefined => {
  if (!key) return undefined;
  let cleaned = key.replace(/^"|"$/g, '');
  cleaned = cleaned.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');
  return cleaned;
};

// ✅ Initialize Firebase Admin SDK (namespace style)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: parsePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    }),
  });
}

const adminAuth = admin.auth();
const adminDb = admin.firestore();

async function createAdminUser() {
  const ADMIN_EMAIL = "adminzebbleltd@gmail.com";
  const ADMIN_PASSWORD = "$$$Tycoon23"; // 🔑 Change this!
  
  try {
    // 1. Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      emailVerified: true,
      displayName: "Super Admin"
    });
    
    console.log("✅ Auth user created:", userRecord.uid);
    
    // 2. Create/update Firestore admin doc with matching UID
    // ✅ Use namespace-style Firestore methods
    await adminDb.collection("admins").doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: ADMIN_EMAIL,
      role: "super_admin",
      permissions: {
        users: { read: true, write: true, delete: true },
        stores: { read: true, write: true, delete: true, ban: true },
        orders: { read: true, write: true, refund: true },
        payouts: { read: true, approve: true, reject: true },
        disputes: { read: true, resolve: true, escalate: true },
        analytics: { read: true, export: true },
        settings: { read: true, write: true },
        chat: { read: true, write: true },
        notifications: { read: true, send: true }
      },
      isActive: true,
      createdBy: "system",
      createdAt: admin.firestore.Timestamp.now(),
      lastLogin: admin.firestore.Timestamp.now()
    });
    
    console.log("✅ Firestore admin doc synced");
    console.log("🔑 UID (save this):", userRecord.uid);
    console.log("🌐 Next: Visit http://localhost:3000/admin/login");
    
  } catch (error: any) {
    console.error("❌ Failed to create admin user:", error);
    
    // Helpful error messages
    if (error.code === 'auth/email-already-exists') {
      console.error("💡 Fix: User already exists in Firebase Auth. Use Console to reset password or pick a different email.");
    }
    if (error.code === 'auth/invalid-email') {
      console.error("💡 Fix: Email format is invalid.");
    }
    if (error.code === 'auth/weak-password') {
      console.error("💡 Fix: Password must be at least 6 characters.");
    }
  }
}

createAdminUser();