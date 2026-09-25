import { NextRequest, NextResponse } from "next/server";
import { getPublicStore, jsonValue, publicStoreView } from "@/lib/api/public-catalog";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> },
) {
  try {
    const { storeId } = await params;
    const store = await getPublicStore(decodeURIComponent(storeId));
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    return NextResponse.json({ store: jsonValue(publicStoreView(store.id, store.data)) });
  } catch (error) {
    console.error("Public store API error:", error);
    return NextResponse.json({ error: "Store could not be loaded" }, { status: 500 });
  }
}
