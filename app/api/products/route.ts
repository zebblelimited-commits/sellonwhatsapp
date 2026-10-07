import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { syncReferralMilestones } from "@/lib/referrals";
import { getPublicStore, getPublicStoreMap, isPublicProduct, jsonValue, publicProductView, timestampValue } from "@/lib/api/public-catalog";
import { sponsorshipIsActive } from "@/lib/sponsorship";

const UTILITY_SUBCATEGORIES = new Set([
    "Beats & Instrumentals", "Sound Packs & Samples", "Music Loops", "E-books & Guides",
    "Online Courses", "Design Templates", "Website Templates", "Mobile App Templates",
    "UI/UX Kits", "Icons & Graphics", "Fonts & Typography", "Lightroom Presets",
    "Video LUTs", "AI Prompts", "Stock Photos", "Stock Videos", "Digital Wallpapers",
    "Digital Planners",
]);

function validateUtilityPayload(productPayload: Record<string, unknown>) {
    const productType = String(productPayload.productType || "").trim().toLowerCase();
    if (productType !== "utility") return null;
    if (String(productPayload.mainCategory || "").trim() !== "digital-products") return "Utility products must use the digital-products main category.";
    if (!UTILITY_SUBCATEGORIES.has(String(productPayload.subCategory || "").trim())) return "Select a valid digital product subcategory.";

    const utilityType = String(productPayload.utilityType || "").trim();
    if (!["file", "key", "ticket", "sub"].includes(utilityType)) return "Utility type must be file, key, ticket, or sub.";
    const billingCycle = String(productPayload.billingCycle || "").trim();
    if (!["one_time", "monthly", "yearly"].includes(billingCycle)) return "Billing cycle must be one_time, monthly, or yearly.";
    const metricType = String(productPayload.metricType || "").trim();
    if (!["flat", "hourly", "usage"].includes(metricType)) return "Metric type must be flat, hourly, or usage.";
    if (!String(productPayload.unitLabel || "").trim()) return "Unit label is required for utility products.";

    const price = Number(productPayload.price);
    const discountPrice = productPayload.discountPrice == null ? null : Number(productPayload.discountPrice);
    if (!Number.isFinite(price) || price <= 0) return "Utility product price must be a positive number.";
    if (discountPrice !== null && (!Number.isFinite(discountPrice) || discountPrice <= 0 || discountPrice > price)) return "Discount price must not exceed the base price.";

    const previewUrl = String(productPayload.previewAudioUrl || "").trim();
    const previewDuration = productPayload.previewDurationSeconds == null ? null : Number(productPayload.previewDurationSeconds);
    if (previewUrl) {
        try {
            const parsed = new URL(previewUrl);
            if (parsed.hostname !== "res.cloudinary.com" || !parsed.pathname.includes(`/${process.env.CLOUDINARY_CLOUD_NAME || "dmjzgqigl"}/`)) return "Audio preview must be hosted on the configured Cloudinary account.";
        } catch {
            return "Audio preview URL is invalid.";
        }
        if (previewDuration !== null && (!Number.isFinite(previewDuration) || previewDuration <= 0 || previewDuration > 30.25)) return "Audio preview must be 30 seconds or shorter.";
    }
    return null;
}

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
        const sponsoredOnly = params.get("sponsored") === "true";
        const storeIdentifier = (params.get("storeId") || "").trim();
        const targetStore = storeIdentifier ? await getPublicStore(storeIdentifier) : null;

        if (storeIdentifier && !targetStore) {
            return NextResponse.json({ products: [], page, limit, total: 0, hasMore: false });
        }

        const snapshot = await adminDb.collection("products").limit(500).get();
        const rawProducts = snapshot.docs
            .map((item) => ({ id: item.id, data: item.data() as Record<string, unknown> }))
            .filter(({ data }) => isPublicProduct(data))
            .filter(({ data }) => !targetStore || String(data.storeId || data.vendorId || data.ownerId || "") === targetStore.id)
            .filter(({ data }) => !sponsoredOnly || sponsorshipIsActive(data));
        const stores = await getPublicStoreMap(rawProducts.map(({ data }) => String(data.storeId || data.vendorId || data.ownerId || "")));

        const products = rawProducts
            .filter(({ data }) => stores.has(String(data.storeId || data.vendorId || data.ownerId || "")))
            .filter(({ data }) => {
                const searchable = [data.name, data.description, data.category, data.mainCategory, data.subCategory]
                    .filter((value): value is string => typeof value === "string")
                    .join(" ")
                    .toLowerCase();
                const categories = [data.category, data.mainCategory, data.subCategory]
                    .filter((value): value is string => typeof value === "string")
                    .map((value) => value.toLowerCase());
                return (!search || searchable.includes(search)) && (!category || categories.some((value) => value.includes(category)));
            })
            .sort((left, right) => {
                if (params.get("sort") === "popular") {
                    return Number(right.data.popularityScore || right.data.salesCount || right.data.orderCount || 0)
                        - Number(left.data.popularityScore || left.data.salesCount || left.data.orderCount || 0);
                }
                return timestampValue(right.data.createdAt) - timestampValue(left.data.createdAt);
            });

        const start = (page - 1) * limit;
        const visible = products.slice(start, start + limit).map(({ id, data }) => {
            const storeId = String(data.storeId || data.vendorId || data.ownerId || "");
            return publicProductView(id, data, stores.get(storeId));
        });

        return NextResponse.json({
            products: jsonValue(visible),
            page,
            limit,
            total: products.length,
            hasMore: start + limit < products.length,
        });
    } catch (error) {
        console.error("Public products API error:", error);
        return NextResponse.json({ error: "Products could not be loaded" }, { status: 500 });
    }
}


export async function POST(request: NextRequest) {
    try {
        const { userId, productPayload } = await request.json();
        const authorization = request.headers.get("authorization");
        if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const decoded = await adminAuth.verifyIdToken(authorization.slice("Bearer ".length).trim());
        if (decoded.uid !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
        }

        if (!productPayload || typeof productPayload !== "object" || Array.isArray(productPayload)) {
            return NextResponse.json({ error: "Product payload is required" }, { status: 400 });
        }
        const payloadStoreId = String((productPayload as Record<string, unknown>).storeId || "").trim();
        if (payloadStoreId && payloadStoreId !== decoded.uid) return NextResponse.json({ error: "Product store does not belong to the authenticated seller" }, { status: 403 });
        const utilityValidationError = validateUtilityPayload(productPayload as Record<string, unknown>);
        if (utilityValidationError) return NextResponse.json({ error: utilityValidationError }, { status: 400 });
        const isUtility = String((productPayload as Record<string, unknown>).productType || "").trim().toLowerCase() === "utility";
        const payloadToWrite = {
            ...(productPayload as Record<string, unknown>),
            storeId: payloadStoreId || decoded.uid,
            ...(isUtility ? {
                type: "utility",
                mainCategory: "digital-products",
                category: (productPayload as Record<string, unknown>).subCategory,
                trackInventory: false,
                stockCount: 1,
                availability: "in_stock",
            } : {}),
        };

        // 1. Get tier limits from user profile doc
        const userSnap = await adminDb.collection("users").doc(userId).get();
        const userData = userSnap.exists ? userSnap.data() : null;
        const productLimit = userData?.productLimit ?? 20; // Default fallback to 20

        // 2. Get high-performance server-side aggregation count 
        const productsQuerySnapshot = await adminDb
            .collection("products")
            .where("userId", "==", userId)
            .count()
            .get();

        const currentCount = productsQuerySnapshot.data().count;

        // 3. Enforce gating conditions
        if (currentCount >= productLimit) {
            return NextResponse.json({
                success: false,
                error: "PRODUCT_LIMIT_EXCEEDED",
                message: `Your subscription tier limits you to ${productLimit} products. Please upgrade to add more items.`
            }, { status: 403 });
        }

        // 4. Otherwise, continue and write the item record securely...
        const docRef = await adminDb.collection("products").add({
            ...payloadToWrite,
            userId,
            createdAt: new Date().toISOString()
        });
        await syncReferralMilestones(userId);

        return NextResponse.json({ success: true, id: docRef.id });

    } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Product could not be created" }, { status: 500 });
    }
}
