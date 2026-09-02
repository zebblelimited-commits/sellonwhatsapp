import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { notifyUserRegistered } from "@/lib/novu-events";
import { sendWelcomeEmailNotification } from "@/lib/email/events";

type Profile = Record<string, unknown>;

function firstString(...values: unknown[]): string {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() || "";
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!idToken) return NextResponse.json({ error: "Missing authorization token" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;
    const body = await request.json().catch(() => ({}));
    const requestedRole = body?.role === "vendor" || body?.role === "buyer" ? body.role : undefined;

    const [authUser, usersSnapshot, buyersSnapshot, vendorsSnapshot, storesSnapshot] = await Promise.all([
      adminAuth.getUser(uid),
      adminDb.collection("users").doc(uid).get(),
      adminDb.collection("buyers").doc(uid).get(),
      adminDb.collection("vendors").doc(uid).get(),
      adminDb.collection("stores").doc(uid).get(),
    ]);

    const profile: Profile = {
      ...(usersSnapshot.data() || {}),
      ...(buyersSnapshot.data() || {}),
      ...(vendorsSnapshot.data() || {}),
      ...(storesSnapshot.data() || {}),
    };
    const role: "buyer" | "vendor" = decoded.role === "vendor" || vendorsSnapshot.exists || storesSnapshot.exists
      ? "vendor"
      : requestedRole || "buyer";
    const email = firstString(authUser.email, profile.email);
    if (!email) return NextResponse.json({ error: "Registered email is missing" }, { status: 400 });

    const firstName = firstString(profile.firstName, profile.displayName, authUser.displayName) || "there";
    const phoneNumber = firstString(profile.phoneNumber, profile.phone, profile.whatsappNumber, authUser.phoneNumber);
    const user = {
      uid,
      role,
      email,
      firstName,
      lastName: firstString(profile.lastName),
      displayName: firstString(profile.displayName, authUser.displayName),
      phoneNumber,
    };

    const emailTask = sendWelcomeEmailNotification(
      user,
      role,
      firstString(profile.storeName, profile.name),
    );
    const novuTask = notifyUserRegistered(user);
    const [emailSent] = await Promise.allSettled([emailTask, novuTask]);

    return NextResponse.json({
      ok: true,
      emailSent: emailSent.status === "fulfilled" && emailSent.value === true,
      whatsappQueued: Boolean(phoneNumber),
    });
  } catch (error) {
    console.error("[WELCOME NOTIFICATIONS] Registration welcome flow failed:", error);
    return NextResponse.json({ error: "Welcome notification flow failed" }, { status: 500 });
  }
}
