import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(authorization.slice("Bearer ".length).trim());
    const uid = decoded.uid;

    // Keep completed order records for financial reconciliation, but remove the
    // account documents that contain the buyer's profile and contact details.
    const [follows, buyerNotifications, recipientNotifications] = await Promise.all([
      adminDb.collection("follows").where("followerId", "==", uid).get(),
      adminDb.collection("notifications").where("buyerId", "==", uid).get(),
      adminDb.collection("notifications").where("recipientId", "==", uid).get(),
    ]);
    const references = [
      adminDb.collection("buyers").doc(uid),
      adminDb.collection("users").doc(uid),
      ...follows.docs.map((document) => document.ref),
      ...buyerNotifications.docs.map((document) => document.ref),
      ...recipientNotifications.docs.map((document) => document.ref),
    ];
    const uniqueReferences = Array.from(new Map(references.map((reference) => [reference.path, reference])).values());
    for (let index = 0; index < uniqueReferences.length; index += 450) {
      const batch = adminDb.batch();
      uniqueReferences.slice(index, index + 450).forEach((reference) => batch.delete(reference));
      await batch.commit();
    }

    await adminAuth.deleteUser(uid);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Account deletion failed:", error);
    return NextResponse.json({ error: "Account deletion could not be completed. Please contact support." }, { status: 500 });
  }
}
