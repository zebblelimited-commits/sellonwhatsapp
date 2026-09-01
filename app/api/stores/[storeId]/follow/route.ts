import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { notifyNewFollower } from "@/lib/novu-events";

type RouteContext = { params: Promise<{ storeId: string }> };

async function authenticate(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("Authentication required");
  return adminAuth.verifyIdToken(header.slice("Bearer ".length).trim());
}

async function toggleFollow(request: NextRequest, context: RouteContext, shouldFollow: boolean) {
  const decoded = await authenticate(request);
  const { storeId: rawStoreId } = await context.params;
  const storeId = decodeURIComponent(rawStoreId || "").trim();
  if (!storeId) return NextResponse.json({ error: "Store ID is required" }, { status: 400 });
  if (decoded.uid === storeId) return NextResponse.json({ error: "You cannot follow your own store" }, { status: 400 });

  const followRef = adminDb.collection("follows").doc(`${decoded.uid}_${storeId}`);
  const storeRef = adminDb.collection("stores").doc(storeId);
  const result = await adminDb.runTransaction(async (transaction) => {
    const [storeSnap, followSnap] = await Promise.all([
      transaction.get(storeRef),
      transaction.get(followRef),
    ]);
    if (!storeSnap.exists) return { following: false, changed: false, count: 0 };

    const currentlyFollowing = followSnap.exists;
    if (currentlyFollowing === shouldFollow) {
      return {
        following: currentlyFollowing,
        changed: false,
        count: Math.max(0, Number(storeSnap.data()?.followerCount || 0)),
      };
    }

    const currentCount = Math.max(0, Number(storeSnap.data()?.followerCount || 0));
    const nextCount = Math.max(0, currentCount + (shouldFollow ? 1 : -1));
    if (shouldFollow) {
      transaction.create(followRef, {
        followerId: decoded.uid,
        vendorId: storeId,
        createdAt: FieldValue.serverTimestamp(),
      });
    } else {
      transaction.delete(followRef);
    }
    transaction.update(storeRef, { followerCount: nextCount, updatedAt: FieldValue.serverTimestamp() });
    return { following: shouldFollow, changed: true, count: nextCount };
  });

  if (result.changed && shouldFollow) {
    try {
      const [buyerSnap, userSnap, storeSnap] = await Promise.all([
        adminDb.collection("buyers").doc(decoded.uid).get(),
        adminDb.collection("users").doc(decoded.uid).get(),
        storeRef.get(),
      ]);
      await notifyNewFollower(storeId, {
        id: decoded.uid,
        ...(buyerSnap.exists ? buyerSnap.data() : {}),
        ...(userSnap.exists ? userSnap.data() : {}),
        email: decoded.email || "",
      }, storeSnap.exists ? storeSnap.data() : undefined);
    } catch (notificationError) {
      console.error("[NOVU WHATSAPP] New-follower notification failed:", notificationError);
    }
  }

  return NextResponse.json({ success: true, following: result.following, followerCount: result.count });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    return await toggleFollow(request, context, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to follow store";
    return NextResponse.json({ error: message }, { status: message === "Authentication required" ? 401 : 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    return await toggleFollow(request, context, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to unfollow store";
    return NextResponse.json({ error: message }, { status: message === "Authentication required" ? 401 : 500 });
  }
}
