import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin"; // ✅ Added adminAuth import

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  // Safe unwrap for Next.js async params context stream
  const { reference } = await params;

  if (!reference || typeof reference !== "string" || reference.trim() === "") {
    console.error("❌ Verification rejected: Empty reference variable evaluated.");
    return NextResponse.json({ error: "Missing or invalid reference argument" }, { status: 400 });
  }

  try {
    // ✅ SECURITY: Verify the user is logged in via Firebase ID Token
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer")) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }
    
    const token = authHeader.split("Bearer ")[1].trim();
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    console.log(`[Status Checker] Validating boost status for reference: ${reference} (User: ${uid})`);

    // 1. Direct document ID lookup
    let docRef = adminDb.collection("boosts").doc(reference);
    let docSnap = await docRef.get();

    // 2. Fallback indexed lookup query mapping if matching field values instead
    if (!docSnap.exists) {
      const fallbackQuery = await adminDb
        .collection("boosts")
        .where("nombaReference", "==", reference)
        .limit(1)
        .get();

      if (!fallbackQuery.empty) {
        docSnap = fallbackQuery.docs[0];
      }
    }

    // 3. Confirm matching payload persistence
    if (!docSnap.exists) {
      return NextResponse.json({ error: "Transaction record registry path missing" }, { status: 404 });
    }

    const boostRecord = docSnap.data() || {};

    // ✅ SECURITY: Ensure the logged-in user actually owns this boost
    // (Only check if the userId field actually exists on the document)
    if (boostRecord.userId && boostRecord.userId !== uid) {
       return NextResponse.json({ error: "Forbidden: You do not own this transaction" }, { status: 403 });
    }

    // ✅ UNIVERSAL PAYLOAD SHAPE: Satisfies all frontend data-fetching variations
    return NextResponse.json({
      success: true,
      status: boostRecord.status || "pending_payment",
      packageName: boostRecord.packageName || "Store Boost Profile Package",
      
      // Shape 1: If frontend looks for data.boost (e.g., const boost = res.boost)
      boost: boostRecord, 
      
      // Shape 2: If frontend looks for data.data (e.g., const boost = res.data)
      data: boostRecord,  
      
      // Shape 3: If frontend flattens it immediately (e.g., const boost = res)
      ...boostRecord      
    });

  } catch (error: any) {
    // ✅ Handle specific Firebase Auth errors gracefully without leaking stack traces
    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
    }
    if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
      return NextResponse.json({ error: "Invalid authentication token." }, { status: 401 });
    }

    console.error("Verification Endpoint Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal validation parsing exception" },
      { status: 500 }
    );
  }
}