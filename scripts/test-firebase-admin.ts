// scripts/test-firebase-admin.ts
import { config } from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Load .env.local
config({ path: ".env.local" });

// Robust private key parser: handles \\n, \\\\n, etc.
const parsePrivateKey = (key: string | undefined): string | undefined => {
  if (!key) return undefined;
  // Remove surrounding quotes if present
  let cleaned = key.replace(/^"|"$/g, '');
  // Convert escaped newlines to actual newlines (handle multiple escape levels)
  cleaned = cleaned.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');
  return cleaned;
};

// Initialize Firebase Admin SDK
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: parsePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    }),
  });
}

const adminDb = getFirestore();

async function test() {
  try {
    console.log("🔍 Testing Firebase Admin SDK connection...");
    
    const snapshot = await adminDb.collection("admins").limit(1).get();
    
    console.log("✅ Success! Connected to project:", process.env.FIREBASE_PROJECT_ID);
    console.log("📊 Found", snapshot.size, "admin document(s)");
    
  } catch (error: any) {
    console.error("❌ Connection failed:", error.message);
    
    if (error.message.includes("unsupported") || error.message.includes("illegal base64")) {
      console.error("\n💡 PRIVATE KEY ESCAPING FIX:");
      console.error("1. Open .env.local");
      console.error("2. Ensure FIREBASE_PRIVATE_KEY:");
      console.error("   - Is wrapped in double quotes: \"...\"");
      console.error("   - Has \\n for newlines (not actual line breaks)");
      console.error("   - Ends with \\n before closing quote");
      console.error("\n📋 Example format:");
      console.error('FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n"');
    }
    
    if (error.message.includes("permission_denied")) {
      console.error("\n💡 PERMISSIONS FIX:");
      console.error("1. Go to Firebase Console → Project Settings → Service Accounts");
      console.error("2. Click ⋮ next to your service account → Manage permissions in Google Cloud Console");
      console.error("3. Add role: 'Firestore Admin'");
      console.error("4. Wait 1 minute, then retry");
    }
  }
}

test();