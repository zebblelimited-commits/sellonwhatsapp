import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

async function resolvePortalRole(uid: string, tokenRole?: unknown) {
  const [adminSnapshot, storeSnapshot, vendorSnapshot, buyerSnapshot, userSnapshot] = await Promise.all([
    adminDb.collection("admins").doc(uid).get(),
    adminDb.collection("stores").doc(uid).get(),
    adminDb.collection("vendors").doc(uid).get(),
    adminDb.collection("buyers").doc(uid).get(),
    adminDb.collection("users").doc(uid).get(),
  ]);

  if (adminSnapshot.exists && adminSnapshot.data()?.isActive === true) return "admin";
  if (storeSnapshot.exists || vendorSnapshot.exists) return "vendor";
  if (buyerSnapshot.exists || userSnapshot.exists) return "buyer";

  // Claims support users created by older versions while the profile migration
  // is completed. The Firestore records above always take precedence.
  return tokenRole === "vendor" || tokenRole === "buyer" || tokenRole === "admin"
    ? tokenRole
    : "unknown";
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
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON format" }, { status: 400 });
  }

  const { idToken } = body;

  // 2. Check if the token actually exists
  if (!idToken) {
    return NextResponse.json({ error: "Missing ID token in payload" }, { status: 400 });
  }

  // 3. Create the session cookie
  try {
    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });
    const role = await resolvePortalRole(decodedToken.uid, decodedToken.role);

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
  } catch (error) {
    console.error("Error creating session cookie:", error);
    return NextResponse.json({ error: "Unauthorized or invalid token" }, { status: 401 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("__session");
  cookieStore.delete("__role");
  return NextResponse.json({ status: "signed_out" }, { status: 200 });
}
