// scripts/seed-first-admin-standalone.ts
import { config } from "dotenv";
import { initializeApp, cert, ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";

// ✅ Load .env.local
config({ path: ".env.local" });

// ✅ Robust private key parser
const parsePrivateKey = (key: string | undefined): string | undefined => {
  if (!key) return undefined;
  let cleaned = key.replace(/^"|"$/g, '');
  cleaned = cleaned.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');
  return cleaned;
};

// ✅ Initialize Firebase Admin SDK directly in this script
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: parsePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    } as ServiceAccount),
  });
}

const adminDb = getFirestore();

// ✅ Seed function
async function seed() {
  // 🔑 Replace with your actual Firebase Auth UID for the admin user
  // Find it in Firebase Console → Authentication → Users → Click user → Copy UID
  const ADMIN_UID = "B0zVDh5pGnOOubMHVuskVa7Kfbh1";
  
  await adminDb.collection("admins").doc(ADMIN_UID).set({
    uid: ADMIN_UID,
    email: "zebblelimited@gmail.com",
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
    createdAt: Timestamp.now(),
    lastLogin: Timestamp.now()
  });
  
  console.log("✅ Super admin seeded successfully!");
  console.log("🔑 Admin UID:", ADMIN_UID);
  console.log("🌐 Next: Visit http://localhost:3000/admin/login");
}

seed().catch(console.error);