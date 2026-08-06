import { NextRequest, NextResponse } from "next/server";
import { auth } from "firebase-admin";
import { cookies } from "next/headers";
// Ensure you have initialized Firebase Admin SDK elsewhere (e.g., lib/firebase-admin.ts)
import { adminAuth } from "@/lib/firebase-admin"; 

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { idToken } = body;

  if (!idToken) {
    return NextResponse.json({ error: "Missing ID token" }, { status: 401 });
  }

  try {
    // 1. Verify the ID token using Firebase Admin
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    // 2. Create a session cookie (valid for 5 days, for example)
    const expiresIn = 60 * 60 * 24 * 5 * 1000; 
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

    // 3. Set the cookie
    (await cookies()).set("__session", sessionCookie, {
      maxAge: expiresIn,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
    });

    return NextResponse.json({ status: "success" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}