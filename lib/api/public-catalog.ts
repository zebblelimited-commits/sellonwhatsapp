import { adminDb } from "@/lib/firebase-admin";
import { isPublicStore } from "@/lib/categoryCatalog";

export { isPublicStore };

type RecordValue = Record<string, unknown>;

const PUBLIC_STORE_FIELDS = [
  "storeName", "name", "username", "description", "bio", "about",
  "logoUrl", "logo", "bannerUrl", "coverImage", "coverImageUrl",
  "category", "mainCategory", "subCategory", "storeCategory",
  "businessCategory", "categoryName", "location", "address", "city",
  "state", "country", "phone", "whatsappNumber", "socialLinks", "website",
  "followerCount", "followersCount", "productCount", "isVerified",
  "verificationTier", "status", "isActive", "createdAt", "updatedAt", "slug",
] as const;

const PUBLIC_PRODUCT_FIELDS = [
  "name", "description", "price", "originalPrice", "discountPrice", "currency",
  "images", "image", "imageUrl", "productType", "mainCategory", "subCategory",
  "category", "features", "variants", "stockCount", "stock", "availability",
  "status", "storeId", "vendorName", "storeName", "username", "storeUsername",
  "popularityScore", "salesCount", "orderCount", "views", "clicks",
  "add_to_cart_clicks", "addToCartClicks", "isSponsored", "sponsoredAt",
  "createdAt", "updatedAt", "shipping", "deliveryType", "fulfillmentMethod",
  "turnaroundTime", "duration", "locationType", "maxDaily", "metricType",
  "unitLabel", "weightKg", "dimensions", "bookingDate", "bookingSlot",
] as const;

export function jsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(jsonValue);

  if (typeof value === "object") {
    const candidate = value as { toMillis?: () => number; toDate?: () => Date };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
    if (typeof candidate.toDate === "function") return candidate.toDate().getTime();

    return Object.fromEntries(
      Object.entries(value as RecordValue).map(([key, entry]) => [key, jsonValue(entry)]),
    );
  }

  return value;
}

function copyFields(fields: readonly string[], data: RecordValue) {
  const output: RecordValue = {};
  for (const field of fields) {
    if (data[field] !== undefined) output[field] = jsonValue(data[field]);
  }
  return output;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isPublicProduct(data: RecordValue) {
  return data.isDeleted !== true && !["inactive", "banned", "deleted"].includes(text(data.status).toLowerCase());
}

export function publicStoreView(id: string, data: RecordValue): RecordValue & { id: string } {
  return {
    id,
    ...copyFields(PUBLIC_STORE_FIELDS, data),
  };
}

export function publicProductView(id: string, data: RecordValue, store?: RecordValue | null): RecordValue & { id: string } {
  const storeId = text(data.storeId) || text(data.vendorId) || text(data.ownerId);
  const output = copyFields(PUBLIC_PRODUCT_FIELDS, data);

  // These normalized fields keep the mobile contract consistent with the
  // existing web cards, including older product records.
  output.storeId = storeId;
  output.vendorName = text(data.vendorName) || text(data.storeName) || text(store?.storeName) || text(store?.name) || "Marketplace seller";
  output.username = text(data.username) || text(data.storeUsername) || text(store?.username);

  if (output.stockCount === undefined && data.stock !== undefined) output.stockCount = jsonValue(data.stock);
  if (output.images === undefined) output.images = [];

  return { id, ...output };
}

export function timestampValue(value: unknown) {
  if (value && typeof value === "object") {
    const candidate = value as { toMillis?: () => number; toDate?: () => Date };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
    if (typeof candidate.toDate === "function") return candidate.toDate().getTime();
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function getPublicStore(identifier: string) {
  const normalized = identifier.trim();
  if (!normalized) return null;

  const direct = await adminDb.collection("stores").doc(normalized).get();
  if (direct.exists && isPublicStore(direct.data())) {
    return { id: direct.id, data: direct.data() as RecordValue };
  }

  const byUsername = await adminDb
    .collection("stores")
    .where("username", "==", normalized.toLowerCase())
    .limit(1)
    .get();

  const match = byUsername.docs.find((item) => isPublicStore(item.data()));
  return match ? { id: match.id, data: match.data() as RecordValue } : null;
}

export async function getPublicStoreMap(storeIds: string[]) {
  const uniqueIds = [...new Set(storeIds.filter(Boolean))];
  const entries = await Promise.all(uniqueIds.map(async (id) => {
    const snapshot = await adminDb.collection("stores").doc(id).get();
    if (!snapshot.exists || !isPublicStore(snapshot.data())) return null;
    return [id, snapshot.data() as RecordValue] as const;
  }));

  return new Map(entries.filter((entry): entry is readonly [string, RecordValue] => Boolean(entry)));
}
