import { db } from "./firebase";
import {
  doc,
  setDoc,
  increment,
  serverTimestamp,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp
} from "firebase/firestore";

// ✅ EXPANDED: Added 'add_to_cart_click', 'search', 'follow', and 'unfollow' to match mobile
export type AnalyticsEvent =
  | 'view'
  | 'click'
  | 'buy_now_click'
  | 'whatsapp_click'
  | 'add_to_cart_click'
  | 'search'
  | 'follow'
  | 'unfollow';

type AnalyticsOptions = {
  productId?: string;
  query?: string; // For search analytics
};

/**
 * Track analytics metrics for a store or global event.
 */
export const trackMetric = async (
  storeId: string, // Can be empty string for global events like search
  eventType: AnalyticsEvent,
  options?: AnalyticsOptions,
) => {
  try {
    const data: any = {
      eventType: eventType,
      timestamp: serverTimestamp(),
      platform: 'web', // Distinguishes web traffic from 'flutter_mobile'
      ...(typeof window !== 'undefined' ? {
        userAgent: navigator.userAgent.substring(0, 100),
        referrer: document.referrer || null
      } : {})
    };

    // Only attach storeId/productId if they exist (search is global)
    if (storeId) data.storeId = storeId;
    if (options?.productId) data.productId = options.productId;
    if (options?.query) data.query = options.query.trim().toLowerCase();

    await addDoc(collection(db, "analytics"), data);

    console.log(`[Analytics] ✅ Successfully tracked '${eventType}'${storeId ? ` for store: ${storeId}` : ''}${options?.productId ? ` (Product: ${options.productId})` : ''}`);

    // ✅ METHOD 2: Try to update the store document counters (Optional, for legacy support)
    if (storeId) {
      try {
        const storeRef = doc(db, "stores", storeId);
        let fieldName = 'views';

        switch (eventType) {
          case 'buy_now_click': fieldName = 'buy_now_clicks'; break;
          case 'whatsapp_click': fieldName = 'whatsapp_clicks'; break;
          case 'add_to_cart_click': fieldName = 'add_to_cart_clicks'; break;
          case 'click': fieldName = 'clicks'; break;
          case 'follow': fieldName = 'follows'; break;
          case 'unfollow': fieldName = 'unfollows'; break;
          default: fieldName = 'views';
        }

        await setDoc(storeRef, {
          [fieldName]: increment(1),
          updatedAt: serverTimestamp()
        }, { merge: true });

        console.log(`[Analytics] 📈 Updated store counter for '${fieldName}' (+1)`);
      } catch (storeError: any) {
        // Silently fail if the user is not the store owner (permission-denied)
        if (storeError.code !== 'permission-denied') {
          console.warn(`[Analytics] ⚠️ Could not update store counter:`, storeError.message);
        }
      }
    }
  } catch (error: any) {
    console.error(`[Analytics] ❌ Error tracking ${eventType}:`, error.message);
  }
};

/**
 * Track a product view
 */
export const trackProductView = async (storeId: string, productId: string) => {
  if (!storeId || !productId) return;
  await trackMetric(storeId, 'view', { productId });
};

/**
 * Track a store visit/page view
 */
export const trackStoreView = async (storeId: string) => {
  if (!storeId) return;
  await trackMetric(storeId, 'view');
};

/**
 * Track a product click
 */
export const trackProductClick = async (storeId: string, productId: string) => {
  if (!storeId || !productId) return;
  await trackMetric(storeId, 'click', { productId });
};

/**
 * Track a "Buy Now" click
 */
export const trackBuyNowClick = async (storeId: string, productId: string) => {
  if (!storeId || !productId) return;
  await trackMetric(storeId, 'buy_now_click', { productId });
};

/**
 * Track a "WhatsApp" click
 */
export const trackWhatsAppClick = async (storeId: string, productId: string) => {
  if (!storeId || !productId) return;
  await trackMetric(storeId, 'whatsapp_click', { productId });
};

/**
 * ✅ NEW: Track an "Add to Cart" click
 */
export const trackAddToCartClick = async (storeId: string, productId: string) => {
  if (!storeId || !productId) return;
  await trackMetric(storeId, 'add_to_cart_click', { productId });
};

/**
 * ✅ NEW: Track a global search query
 */
export const trackSearch = async (searchQuery: string) => {
  const cleanQuery = searchQuery.trim().toLowerCase();
  if (!cleanQuery) return;

  // Search is a global event, so we pass an empty storeId
  await trackMetric('', 'search', { query: cleanQuery });
};

/**
 * Get analytics counts for a store
 */
export const getStoreAnalytics = async (
  storeId: string,
  dateRange?: { start: Date; end: Date }
) => {
  try {
    let q = query(
      collection(db, "analytics"),
      where("storeId", "==", storeId)
    );

    if (dateRange) {
      q = query(q,
        where("timestamp", ">=", Timestamp.fromDate(dateRange.start)),
        where("timestamp", "<=", Timestamp.fromDate(dateRange.end))
      );
    }

    const snapshot = await getDocs(q);
    const counts = {
      views: 0,
      clicks: 0,
      buy_now_clicks: 0,
      whatsapp_clicks: 0,
      add_to_cart_clicks: 0, // ✅ NEW
      follows: 0,            // ✅ NEW
      unfollows: 0,          // ✅ NEW
      total: snapshot.size
    };

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.eventType === "view") counts.views++;
      else if (data.eventType === "click") counts.clicks++;
      else if (data.eventType === "buy_now_click") counts.buy_now_clicks++;
      else if (data.eventType === "whatsapp_click") counts.whatsapp_clicks++;
      else if (data.eventType === "add_to_cart_click") counts.add_to_cart_clicks++; // ✅ NEW
      else if (data.eventType === "follow") counts.follows++; // ✅ NEW
      else if (data.eventType === "unfollow") counts.unfollows++; // ✅ NEW
    });

    return counts;
  } catch (error) {
    console.error("Error fetching store analytics:", error);
    return { views: 0, clicks: 0, buy_now_clicks: 0, whatsapp_clicks: 0, add_to_cart_clicks: 0, follows: 0, unfollows: 0, total: 0 };
  }
};

/**
 * Get analytics for a specific product
 */
export const getProductAnalytics = async (
  storeId: string,
  productId: string
) => {
  try {
    const q = query(
      collection(db, "analytics"),
      where("storeId", "==", storeId),
      where("productId", "==", productId)
    );

    const snapshot = await getDocs(q);
    const counts = {
      views: 0,
      clicks: 0,
      buy_now_clicks: 0,
      whatsapp_clicks: 0,
      add_to_cart_clicks: 0 // ✅ NEW
    };

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.eventType === "view") counts.views++;
      else if (data.eventType === "click") counts.clicks++;
      else if (data.eventType === "buy_now_click") counts.buy_now_clicks++;
      else if (data.eventType === "whatsapp_click") counts.whatsapp_clicks++;
      else if (data.eventType === "add_to_cart_click") counts.add_to_cart_clicks++; // ✅ NEW
    });

    return counts;
  } catch (error) {
    console.error("Error fetching product analytics:", error);
    return { views: 0, clicks: 0, buy_now_clicks: 0, whatsapp_clicks: 0, add_to_cart_clicks: 0 };
  }
};

/**
 * ✅ NEW: Get top search queries for the Admin Dashboard
 * Note: Firestore doesn't do native GROUP BY easily, so we fetch recent searches and aggregate in memory.
 */
export const getTopSearches = async (limitCount: number = 20) => {
  try {
    const q = query(
      collection(db, "analytics"),
      where("eventType", "==", "search"),
      orderBy("timestamp", "desc"),
      limit(500) // Fetch last 500 searches to aggregate in memory
    );

    const snapshot = await getDocs(q);
    const searchCounts: Record<string, number> = {};

    snapshot.forEach(doc => {
      const data = doc.data();
      const queryStr = data.query as string;

      if (queryStr && queryStr.trim().length > 0) {
        searchCounts[queryStr] = (searchCounts[queryStr] || 0) + 1;
      }
    });

    // Sort by count descending
    const sortedSearches = Object.entries(searchCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limitCount)
      .map(([query, count]) => ({ query, count }));

    console.log(`[Analytics] 📊 Fetched top ${limitCount} searches. Top result: ${sortedSearches.length > 0 ? sortedSearches[0].query : "None"}`);

    return sortedSearches;
  } catch (error) {
    console.error("[Analytics] ❌ Error fetching top searches:", error);
    return [];
  }
};

export default {
  trackMetric,
  trackProductView,
  trackStoreView,
  trackProductClick,
  trackBuyNowClick,
  trackWhatsAppClick,
  trackAddToCartClick, // ✅ NEW
  trackSearch,         // ✅ NEW
  getStoreAnalytics,
  getProductAnalytics,
  getTopSearches       // ✅ NEW
};