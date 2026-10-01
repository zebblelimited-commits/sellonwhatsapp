import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { HOME_CATEGORY_DEFINITIONS, isPublicStore, matchesHomeCategory } from "@/lib/categoryCatalog";
import {
  isPublicProduct,
  publicProductView,
  publicStoreView,
  timestampValue,
} from "@/lib/api/public-catalog";
import { sponsorshipIsActive } from "@/lib/sponsorship";

function normalizeHero(id: string, data: Record<string, unknown>) {
  return {
    id,
    eyebrow: typeof data.eyebrow === "string" ? data.eyebrow : "Everything you need to grow",
    titleBefore: typeof data.titleBefore === "string" ? data.titleBefore : "Turn",
    highlight: typeof data.highlight === "string" ? data.highlight : "WhatsApp",
    titleAfter: typeof data.titleAfter === "string" ? data.titleAfter : "into your business engine",
    description: typeof data.description === "string" ? data.description : "Manage products, orders, and customers directly from your phone.",
    backgroundImageUrl: typeof data.backgroundImageUrl === "string" ? data.backgroundImageUrl : "/images/hero/sellon-hero-bg.webp",
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
    eyebrowColor: typeof data.eyebrowColor === "string" ? data.eyebrowColor : "#39e878",
    titleColor: typeof data.titleColor === "string" ? data.titleColor : "#ffffff",
    highlightColor: typeof data.highlightColor === "string" ? data.highlightColor : "#00d95f",
    descriptionColor: typeof data.descriptionColor === "string" ? data.descriptionColor : "#d7fbe4",
    primaryButtonTextColor: typeof data.primaryButtonTextColor === "string" ? data.primaryButtonTextColor : "#00a63e",
    featureTextColor: typeof data.featureTextColor === "string" ? data.featureTextColor : "#6b7280",
    primaryLabel: typeof data.primaryLabel === "string" ? data.primaryLabel : "Start Selling on WhatsApp",
    primaryUrl: typeof data.primaryUrl === "string" ? data.primaryUrl : "/register",
    isActive: data.isActive !== false,
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
  };
}

export async function GET() {
  try {
    const [heroSnapshot, storesSnapshot, productsSnapshot] = await Promise.all([
      adminDb.collection("hero_slides").limit(100).get(),
      adminDb.collection("stores").limit(500).get(),
      adminDb.collection("products").limit(500).get(),
    ]);

    const storeRecords = storesSnapshot.docs
      .filter((item) => isPublicStore(item.data()))
      .map((item) => ({ id: item.id, data: item.data() as Record<string, unknown> }));
    const stores = storeRecords
      .map(({ id, data }) => publicStoreView(id, data))
      .sort((left, right) => Number(right.followerCount || right.followersCount || 0) + Number(right.productCount || 0) - (Number(left.followerCount || left.followersCount || 0) + Number(left.productCount || 0)));
    const newStores = storeRecords
      .filter(({ data }) => data.isVerified === true)
      .sort((left, right) => timestampValue(right.data.createdAt) - timestampValue(left.data.createdAt))
      .slice(0, 10)
      .map(({ id, data }) => publicStoreView(id, data));

    const rawProducts = productsSnapshot.docs
      .map((item) => ({ id: item.id, data: item.data() as Record<string, unknown> }))
      .filter(({ data }) => isPublicProduct(data));
    const storeMap = new Map(storeRecords.map(({ id, data }) => [id, data] as const));
    const products = rawProducts
      .filter(({ data }) => storeMap.has(String(data.storeId || data.vendorId || data.ownerId || "")))
      .map(({ id, data }) => publicProductView(id, data, storeMap.get(String(data.storeId || data.vendorId || data.ownerId || ""))))
      .sort((left, right) => Number(right.popularityScore || right.salesCount || right.orderCount || 0) - Number(left.popularityScore || left.salesCount || left.orderCount || 0))
      .slice(0, 12);
    const sponsoredProducts = rawProducts
      .filter(({ data }) => storeMap.has(String(data.storeId || data.vendorId || data.ownerId || "")))
      .filter(({ data }) => sponsorshipIsActive(data))
      .map(({ id, data }) => publicProductView(id, data, storeMap.get(String(data.storeId || data.vendorId || data.ownerId || ""))))
      .sort((left, right) => timestampValue(right.sponsoredAt) - timestampValue(left.sponsoredAt))
      .slice(0, 6);
    const sponsoredStores = storeRecords
      .filter(({ data }) => sponsorshipIsActive(data))
      .sort((left, right) => Number(left.data.priority || 0) - Number(right.data.priority || 0) || timestampValue(right.data.sponsoredAt) - timestampValue(left.data.sponsoredAt))
      .slice(0, 4)
      .map(({ id, data }) => publicStoreView(id, data));

    const categories = HOME_CATEGORY_DEFINITIONS.map((category) => ({
      id: category.id,
      name: category.name,
      iconKey: category.iconKey,
      storeCount: storeRecords.filter(({ data }) => matchesHomeCategory(data, category.id)).length,
    }));

    return NextResponse.json({
      heroSlides: heroSnapshot.docs
        .map((item) => normalizeHero(item.id, item.data() as Record<string, unknown>))
        .filter((slide) => slide.isActive)
        .sort((left, right) => left.sortOrder - right.sortOrder),
      categories,
      products,
      stores: stores.slice(0, 6),
      newStores,
      sponsoredStores,
      sponsoredProducts,
      generatedAt: Date.now(),
    });
  } catch (error) {
    console.error("Homepage API error:", error);
    return NextResponse.json({ error: "Homepage content could not be loaded" }, { status: 500 });
  }
}
