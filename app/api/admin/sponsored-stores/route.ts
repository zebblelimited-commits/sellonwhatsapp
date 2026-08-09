import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";

const stringField = (value: unknown, fallback = "", max = 1000) =>
  typeof value === "string" ? value.trim().slice(0, max) : fallback;

function cardFields(body: Record<string, unknown>) {
  return {
    title: stringField(body.title, "Sponsored Store", 150),
    description: stringField(body.description, "Discover products from this featured store.", 500),
    ctaText: stringField(body.ctaText, "View Store", 80),
    ctaUrl: stringField(body.ctaUrl, "/explore", 1000),
    bgImageUrl: stringField(body.bgImageUrl, "/images/placeholder-cover.svg", 1000),
    sortOrder: Math.max(0, Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0),
    isActive: body.isActive !== false,
  };
}

export async function PATCH(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = body.action;
    const id = stringField(body.id, "", 150);
    const now = FieldValue.serverTimestamp();
    const auditRef = adminDb.collection("auditLogs").doc();

    if (action === "create") {
      const fields = cardFields(body);
      if (!fields.title || !fields.description || !fields.bgImageUrl) {
        return NextResponse.json({ error: "Title, description, and an image are required" }, { status: 400 });
      }

      const cardRef = adminDb.collection("sponsored_stores").doc();
      const batch = adminDb.batch();
      batch.set(cardRef, { ...fields, createdAt: now, updatedAt: now });
      batch.set(auditRef, {
        action: "sponsored_store_created",
        targetType: "sponsored_store",
        targetId: cardRef.id,
        performedBy: access.admin.uid,
        performedByEmail: access.admin.email || "",
        details: { sortOrder: fields.sortOrder, isActive: fields.isActive },
        timestamp: now,
      });
      await batch.commit();
      return NextResponse.json({ success: true, id: cardRef.id });
    }

    if (!id) return NextResponse.json({ error: "A sponsored card id is required" }, { status: 400 });

    const cardRef = adminDb.collection("sponsored_stores").doc(id);
    const cardSnapshot = await cardRef.get();
    if (!cardSnapshot.exists) return NextResponse.json({ error: "Sponsored card not found" }, { status: 404 });

    if (action === "delete") {
      const batch = adminDb.batch();
      batch.delete(cardRef);
      batch.set(auditRef, {
        action: "sponsored_store_deleted",
        targetType: "sponsored_store",
        targetId: id,
        performedBy: access.admin.uid,
        performedByEmail: access.admin.email || "",
        details: {},
        timestamp: now,
      });
      await batch.commit();
      return NextResponse.json({ success: true, id });
    }

    if (action === "toggle") {
      const isActive = body.isActive === true;
      await cardRef.update({ isActive, updatedAt: now });
      await adminDb.collection("auditLogs").add({
        action: isActive ? "sponsored_store_activated" : "sponsored_store_hidden",
        targetType: "sponsored_store",
        targetId: id,
        performedBy: access.admin.uid,
        performedByEmail: access.admin.email || "",
        details: { isActive },
        timestamp: now,
      });
      return NextResponse.json({ success: true, id, isActive });
    }

    if (action === "update") {
      const fields = cardFields(body);
      if (!fields.title || !fields.description || !fields.bgImageUrl) {
        return NextResponse.json({ error: "Title, description, and an image are required" }, { status: 400 });
      }

      const batch = adminDb.batch();
      batch.update(cardRef, { ...fields, updatedAt: now });
      batch.set(auditRef, {
        action: "sponsored_store_updated",
        targetType: "sponsored_store",
        targetId: id,
        performedBy: access.admin.uid,
        performedByEmail: access.admin.email || "",
        details: { sortOrder: fields.sortOrder, isActive: fields.isActive },
        timestamp: now,
      });
      await batch.commit();
      return NextResponse.json({ success: true, id });
    }

    return NextResponse.json({ error: "Unsupported sponsored card action" }, { status: 400 });
  } catch (error) {
    console.error("Admin sponsored store action error:", error);
    return NextResponse.json({ error: "Sponsored store action could not be completed" }, { status: 500 });
  }
}
