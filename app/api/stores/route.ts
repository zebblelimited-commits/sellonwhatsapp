import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { isPublicStore, jsonValue, publicStoreView, timestampValue } from "@/lib/api/public-catalog";

function numberParam(value: string | null, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const limit = numberParam(params.get("limit"), 24, 100);
    const page = numberParam(params.get("page"), 1, 1000);
    const search = (params.get("search") || params.get("q") || "").trim().toLowerCase();
    const category = (params.get("category") || "").trim().toLowerCase();
    const verifiedOnly = params.get("verified") === "true";

    const snapshot = await adminDb.collection("stores").limit(500).get();
    const stores = snapshot.docs
      .filter((item) => isPublicStore(item.data()))
      .map((item) => ({ id: item.id, data: item.data() as Record<string, unknown> }))
      .filter(({ data }) => {
        const categoryValues = [data.category, data.mainCategory, data.subCategory, data.storeCategory, data.businessCategory]
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.toLowerCase());
        const searchable = [data.storeName, data.name, data.username, data.description, ...categoryValues]
          .filter((value): value is string => typeof value === "string")
          .join(" ")
          .toLowerCase();
        return (!search || searchable.includes(search))
          && (!category || categoryValues.some((value) => value.includes(category)))
          && (!verifiedOnly || data.isVerified === true);
      })
      .sort((left, right) => timestampValue(right.data.createdAt) - timestampValue(left.data.createdAt));

    const start = (page - 1) * limit;
    const visible = stores.slice(start, start + limit).map(({ id, data }) => publicStoreView(id, data));

    return NextResponse.json({
      stores: jsonValue(visible),
      page,
      limit,
      total: stores.length,
      hasMore: start + limit < stores.length,
    });
  } catch (error) {
    console.error("Public stores API error:", error);
    return NextResponse.json({ error: "Stores could not be loaded" }, { status: 500 });
  }
}
