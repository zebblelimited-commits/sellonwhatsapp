// scripts/seed-first-admin.ts
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

async function seed() {
  // 🔑 Replace with your actual Firebase Auth UID for the admin user
  // You can find this in Firebase Console → Authentication → Users
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