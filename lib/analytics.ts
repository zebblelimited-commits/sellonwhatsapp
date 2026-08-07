// lib/analytics.ts
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
  Timestamp
} from "firebase/firestore";

// 🌟 FIX: Unified to SINGULAR form and added 'whatsapp_click' for premium analytics
export type AnalyticsEvent = 'view' | 'click' | 'buy_now_click' | 'whatsapp_click';

type AnalyticsOptions = {
  productId?: string;
};

/**
 * Track analytics metrics for a store.
 * Creates an analytics event document (public write allowed).
 */
export const trackMetric = async (
  storeId: string,
  eventType: AnalyticsEvent,
  options?: AnalyticsOptions,
) => {
  if (!storeId) return;

  try {
    // ✅ METHOD 1: Create the analytics event in the 'analytics' collection
    await addDoc(collection(db, "analytics"), {
      storeId,
      eventType: eventType, // 🌟 Saves exactly what was passed (e.g., "whatsapp_click")
      ...(options?.productId ? { productId: options.productId } : {}),
      timestamp: serverTimestamp(),
      ...(typeof window !== 'undefined' ? {
        userAgent: navigator.userAgent.substring(0, 100),
        referrer: document.referrer || null
      } : {})
    });
    
    console.log(`[Analytics] ✅ Successfully tracked '${eventType}' for store: ${storeId}`);

    // ✅ METHOD 2: Try to update the store document counters (Optional, for legacy support)
    // Note: This requires the user to be logged in as the store owner, otherwise it silently fails.
    try {
      const storeRef = doc(db, "stores", storeId);
      // Map the singular event type to the plural field name in the 'stores' document
      const fieldName = eventType === 'buy_now_click' ? 'buy_now_clicks' : 
                        eventType === 'whatsapp_click' ? 'whatsapp_clicks' :
                        eventType === 'click' ? 'clicks' : 'views';
                        
      await setDoc(storeRef, {
        [fieldName]: increment(1),
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      console.log(`[Analytics] Updated store counter for ${fieldName}`);
    } catch (storeError: any) {
      // Silently fail if the user is not the store owner (permission-denied)
      if (storeError.code !== 'permission-denied') {
        console.warn(`[Analytics] Could not update store counter:`, storeError.message);
      }
    }
  } catch (error: any) {
    console.error(`[Analytics] ❌ Error tracking ${eventType} for ${storeId}:`, error.message);
  }
};

/**
 * Track a product view
 */
export const trackProductView = async (storeId: string, productId: string) => {
  if (!storeId || !productId) return;
  await trackMetric(storeId, 'view', { productId }); // Singular
};

/**
 * Track a store visit/page view
 */
export const trackStoreView = async (storeId: string) => {
  await trackMetric(storeId, 'view'); // Singular
};

/**
 * Track a product click
 */
export const trackProductClick = async (storeId: string, productId: string) => {
  if (!storeId || !productId) return;
  await trackMetric(storeId, 'click', { productId }); // Singular
};

/**
 * Track a "Buy Now" click
 */
export const trackBuyNowClick = async (storeId: string, productId: string) => {
  if (!storeId || !productId) return;
  await trackMetric(storeId, 'buy_now_click', { productId }); // Singular
};

/**
 * 🌟 Track a "WhatsApp" click (Premium Analytics)
 */
export const trackWhatsAppClick = async (storeId: string, productId: string) => {
  if (!storeId || !productId) return;
  await trackMetric(storeId, 'whatsapp_click', { productId }); // Singular
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
      whatsapp_clicks: 0, // 🌟 Added for premium analytics
      total: snapshot.size
    };

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.eventType === "view") counts.views++;
      else if (data.eventType === "click") counts.clicks++;
      else if (data.eventType === "buy_now_click") counts.buy_now_clicks++;
      else if (data.eventType === "whatsapp_click") counts.whatsapp_clicks++; // 🌟 Count WhatsApp clicks
    });

    return counts;
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return { views: 0, clicks: 0, buy_now_clicks: 0, whatsapp_clicks: 0, total: 0 };
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
      whatsapp_clicks: 0 // 🌟 Added for premium analytics
    };

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.eventType === "view") counts.views++;
      else if (data.eventType === "click") counts.clicks++;
      else if (data.eventType === "buy_now_click") counts.buy_now_clicks++;
      else if (data.eventType === "whatsapp_click") counts.whatsapp_clicks++; // 🌟 Count WhatsApp clicks
    });

    return counts;
  } catch (error) {
    console.error("Error fetching product analytics:", error);
    return { views: 0, clicks: 0, buy_now_clicks: 0, whatsapp_clicks: 0 };
  }
};

export default {
  trackMetric,
  trackProductView,
  trackStoreView,
  trackProductClick,
  trackBuyNowClick,
  trackWhatsAppClick, // 🌟 Added to default export
  getStoreAnalytics,
  getProductAnalytics
};
