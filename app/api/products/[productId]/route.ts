import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getPublicStore, isPublicProduct, jsonValue, publicProductView, publicStoreView } from "@/lib/api/public-catalog";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  try {
    const { productId } = await params;
    const snapshot = await adminDb.collection("products").doc(decodeURIComponent(productId)).get();
    if (!snapshot.exists) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const product = snapshot.data() as Record<string, unknown>;
    if (!isPublicProduct(product)) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const storeId = String(product.storeId || product.vendorId || product.ownerId || "").trim();
    const store = storeId ? await getPublicStore(storeId) : null;
    if (!store) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    return NextResponse.json({
      product: jsonValue(publicProductView(snapshot.id, product, store.data)),
      store: jsonValue(publicStoreView(store.id, store.data)),
    });
  } catch (error) {
    console.error("Public product API error:", error);
    return NextResponse.json({ error: "Product could not be loaded" }, { status: 500 });
  }
}
