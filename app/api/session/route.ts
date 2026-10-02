import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";
import { resolvePortalRole as resolveRole } from "@/lib/portal-role";

async function resolvePortalRole(uid: string, tokenRole?: unknown) {
  const [adminSnapshot, storeSnapshot, vendorSnapshot, buyerSnapshot, userSnapshot] = await Promise.all([
    adminDb.collection("admins").doc(uid).get(),
    adminDb.collection("stores").doc(uid).get(),
    adminDb.collection("vendors").doc(uid).get(),
    adminDb.collection("buyers").doc(uid).get(),
    adminDb.collection("users").doc(uid).get(),
  ]);

  return resolveRole({
    admin: { exists: adminSnapshot.exists && adminSnapshot.data()?.isActive === true, role: adminSnapshot.data()?.role },
    store: { exists: storeSnapshot.exists, role: storeSnapshot.data()?.role },
    vendor: { exists: vendorSnapshot.exists, role: vendorSnapshot.data()?.role },
    buyer: { exists: buyerSnapshot.exists, role: buyerSnapshot.data()?.role },
    user: { exists: userSnapshot.exists, role: userSnapshot.data()?.role },
    tokenRole,
  });
}

export async function POST(request: NextRequest) {
  let body;
  
  // 1. Safely parse the JSON body to prevent crashes
  try {
    const rawBody = await request.text();
    if (!rawBody) {
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON format" }, { status: 400 });
  }

  const { idToken } = body;

  // 2. Check if the token actually exists
  if (!idToken) {
    return NextResponse.json({ error: "Missing ID token in payload" }, { status: 400 });
  }

  const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
  let decodedToken: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;

  // Keep token failures separate from server credential or Firestore errors.
  try {
    decodedToken = await adminAuth.verifyIdToken(idToken);
  } catch (error) {
    console.error("Admin ID token verification failed:", error);
    return NextResponse.json({ error: "Admin token could not be verified" }, { status: 401 });
  }

  let sessionCookie: string;
  try {
    sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });
  } catch (error) {
    console.error("Admin session cookie creation failed:", error);
    return NextResponse.json({ error: "Admin session could not be created" }, { status: 503 });
  }

  let role: string;
  try {
    role = await resolvePortalRole(decodedToken.uid, decodedToken.role);
  } catch (error) {
    console.error("Admin role lookup failed:", error);
    return NextResponse.json({ error: "Admin role could not be loaded" }, { status: 503 });
  }

  const cookieStore = await cookies();
  cookieStore.set("__session", sessionCookie, {
    maxAge: Math.floor(expiresIn / 1000),
    expires: new Date(Date.now() + expiresIn),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "lax",
  });
  cookieStore.set("__role", role, {
    maxAge: Math.floor(expiresIn / 1000),
    expires: new Date(Date.now() + expiresIn),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "lax",
  });

  return NextResponse.json({ status: "success", role }, { status: 200 });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("__session");
  cookieStore.delete("__role");
  return NextResponse.json({ status: "signed_out" }, { status: 200 });
}
