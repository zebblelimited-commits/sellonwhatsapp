import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import {
  getPublicStore,
  isPublicProduct,
  jsonValue,
  publicProductView,
  publicStoreView,
  timestampValue,
} from "@/lib/api/public-catalog";

function numberParam(value: string | null, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> },
) {
  try {
    const { storeId: rawStoreId } = await params;
    const store = await getPublicStore(decodeURIComponent(rawStoreId));
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    const query = new URL(request.url).searchParams;
    const limit = numberParam(query.get("limit"), 24, 100);
    const page = numberParam(query.get("page"), 1, 1000);
    const search = (query.get("search") || query.get("q") || "").trim().toLowerCase();
    const snapshots = await Promise.all([
      adminDb.collection("products").where("storeId", "==", store.id).limit(500).get(),
      adminDb.collection("products").where("vendorId", "==", store.id).limit(500).get(),
      adminDb.collection("products").where("ownerId", "==", store.id).limit(500).get(),
    ]);
    const records = new Map<string, Record<string, unknown>>();
    for (const snapshot of snapshots) {
      for (const item of snapshot.docs) records.set(item.id, item.data() as Record<string, unknown>);
    }

    const products = [...records.entries()]
      .filter(([, data]) => isPublicProduct(data))
      .map(([id, data]) => ({ id, data }))
      .filter(({ data }) => !search || [data.name, data.description, data.category, data.mainCategory, data.subCategory]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLowerCase()
        .includes(search))
      .sort((left, right) => timestampValue(right.data.createdAt) - timestampValue(left.data.createdAt));

    const start = (page - 1) * limit;
    const visible = products.slice(start, start + limit).map(({ id, data }) => publicProductView(id, data, store.data));
    return NextResponse.json({
      store: jsonValue(publicStoreView(store.id, store.data)),
      products: jsonValue(visible),
      page,
      limit,
      total: products.length,
      hasMore: start + limit < products.length,
    });
  } catch (error) {
    console.error("Public store products API error:", error);
    return NextResponse.json({ error: "Store products could not be loaded" }, { status: 500 });
  }
}
