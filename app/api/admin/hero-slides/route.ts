import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";

const stringField = (value: unknown, fallback = "", max = 500) => typeof value === "string" ? value.trim().slice(0, max) : fallback;

function slideFields(body: Record<string, unknown>) {
  return {
    eyebrow: stringField(body.eyebrow, "Join 10,000+ vendors already selling", 150),
    titleBefore: stringField(body.titleBefore, "Sell on", 150),
    highlight: stringField(body.highlight, "WhatsApp", 150),
    titleAfter: stringField(body.titleAfter, "like a real online store", 200),
    description: stringField(body.description, "", 500),
    imageUrl: stringField(body.imageUrl, "", 1000),
    primaryLabel: stringField(body.primaryLabel, "Start Selling", 80),
    primaryUrl: stringField(body.primaryUrl, "/register", 500),
    secondaryLabel: stringField(body.secondaryLabel, "See Demo", 80),
    secondaryUrl: stringField(body.secondaryUrl, "/how-it-works", 500),
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
      const fields = slideFields(body);
      if (!fields.titleBefore || !fields.highlight || !fields.titleAfter || !fields.description) {
        return NextResponse.json({ error: "Title parts and description are required" }, { status: 400 });
      }
      const slideRef = adminDb.collection("hero_slides").doc();
      const batch = adminDb.batch();
      batch.set(slideRef, { ...fields, createdAt: now, updatedAt: now });
      batch.set(auditRef, {
        action: "hero_slide_created",
        targetType: "hero_slide",
        targetId: slideRef.id,
        performedBy: access.admin.uid,
        performedByEmail: access.admin.email || "",
        details: { sortOrder: fields.sortOrder, isActive: fields.isActive },
        timestamp: now,
      });
      await batch.commit();
      return NextResponse.json({ success: true, id: slideRef.id });
    }

    if (!id) return NextResponse.json({ error: "A hero slide id is required" }, { status: 400 });
    const slideRef = adminDb.collection("hero_slides").doc(id);
    const slideSnapshot = await slideRef.get();
    if (!slideSnapshot.exists) return NextResponse.json({ error: "Hero slide not found" }, { status: 404 });

    if (action === "delete") {
      const batch = adminDb.batch();
      batch.delete(slideRef);
      batch.set(auditRef, {
        action: "hero_slide_deleted",
        targetType: "hero_slide",
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
      await slideRef.update({ isActive, updatedAt: now });
      await adminDb.collection("auditLogs").add({
        action: isActive ? "hero_slide_activated" : "hero_slide_hidden",
        targetType: "hero_slide",
        targetId: id,
        performedBy: access.admin.uid,
        performedByEmail: access.admin.email || "",
        details: { isActive },
        timestamp: now,
      });
      return NextResponse.json({ success: true, id, isActive });
    }

    if (action === "update") {
      const fields = slideFields(body);
      if (!fields.titleBefore || !fields.highlight || !fields.titleAfter || !fields.description) {
        return NextResponse.json({ error: "Title parts and description are required" }, { status: 400 });
      }
      const batch = adminDb.batch();
      batch.update(slideRef, { ...fields, updatedAt: now });
      batch.set(auditRef, {
        action: "hero_slide_updated",
        targetType: "hero_slide",
        targetId: id,
        performedBy: access.admin.uid,
        performedByEmail: access.admin.email || "",
        details: { sortOrder: fields.sortOrder, isActive: fields.isActive },
        timestamp: now,
      });
      await batch.commit();
      return NextResponse.json({ success: true, id });
    }

    return NextResponse.json({ error: "Unsupported hero slide action" }, { status: 400 });
  } catch (error) {
    console.error("Admin hero slide mutation error:", error);
    return NextResponse.json({ error: "Hero slide action could not be completed" }, { status: 500 });
  }
}
