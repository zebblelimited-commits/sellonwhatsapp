import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function timestampValue(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return 0;
}

function normalizeProduct(id: string, data: Record<string, unknown>, store?: Record<string, unknown> | null) {
  return {
    id,
    name: text(data.name) || "Untitled product",
    description: text(data.description),
    price: numberValue(data.price),
    discountPrice: data.discountPrice == null ? null : numberValue(data.discountPrice),
    images: Array.isArray(data.images) ? data.images.filter((item): item is string => typeof item === "string") : [],
    imageUrl: text(data.imageUrl),
    productType: text(data.productType) || "physical",
    mainCategory: text(data.mainCategory),
    subCategory: text(data.subCategory),
    category: text(data.category),
    storeId: text(data.storeId) || text(data.vendorId) || text(data.ownerId),
    vendorName: text(data.vendorName) || text(data.storeName) || text(store?.storeName) || text(store?.name) || "Marketplace seller",
    username: text(data.username) || text(store?.username),
    stockCount: numberValue(data.stockCount ?? data.stock),
    status: text(data.status),
    isDeleted: data.isDeleted === true,
    isSponsored: data.isSponsored === true,
    createdAt: timestampValue(data.createdAt),
  };
}

export async function GET(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  try {
    const search = new URL(request.url).searchParams.get("search")?.trim().toLowerCase() || "";
    const snapshot = await adminDb.collection("products").limit(1000).get();
    const rawProducts = snapshot.docs.map((item) => ({ id: item.id, data: item.data() as Record<string, unknown> }));

    const products = rawProducts
      // Product documents already contain the store/vendor identifiers. Avoid
      // one extra Firestore request per store so the admin search stays fast.
      .map(({ id, data }) => normalizeProduct(id, data))
      .filter((product) => !search || [product.id, product.name, product.vendorName, product.storeId, product.mainCategory, product.subCategory, product.category].some((field) => field.toLowerCase().includes(search)))
      .sort((left, right) => Number(right.isSponsored) - Number(left.isSponsored) || right.createdAt - left.createdAt)
      .slice(0, 200);

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Admin products load error:", error);
    return NextResponse.json({ error: "Products could not be loaded" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  try {
    const body = await request.json() as Record<string, unknown>;
    const id = text(body.id).trim();
    if (!id) return NextResponse.json({ error: "A product id is required" }, { status: 400 });
    const productRef = adminDb.collection("products").doc(id);
    const productSnapshot = await productRef.get();
    if (!productSnapshot.exists) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const isSponsored = body.isSponsored === true;
    const now = FieldValue.serverTimestamp();
    const auditRef = adminDb.collection("auditLogs").doc();
    const batch = adminDb.batch();
    batch.update(productRef, {
      isSponsored,
      sponsoredAt: isSponsored ? now : FieldValue.delete(),
      updatedAt: now,
    });
    batch.set(auditRef, {
      action: isSponsored ? "product_sponsored" : "product_unsponsored",
      targetType: "product",
      targetId: id,
      performedBy: access.admin.uid,
      performedByEmail: access.admin.email || "",
      details: { isSponsored },
      timestamp: now,
    });
    await batch.commit();

    return NextResponse.json({ success: true, id, isSponsored });
  } catch (error) {
    console.error("Admin product sponsorship action error:", error);
    return NextResponse.json({ error: "Product sponsorship could not be updated" }, { status: 500 });
  }
}
