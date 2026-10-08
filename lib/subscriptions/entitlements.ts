import { adminDb } from "@/lib/firebase-admin";

const COMMISSION_WAIVER_PLANS = new Set([
  "pro_lite",
  "pro_business_lite",
  "pro_max",
  "pro_business_max",
  "pro_yearly_business_max",
]);

const ACTIVE_SUBSCRIPTION_STATUS = "active";

export interface SellerEntitlements {
  hasCommissionWaiver: boolean;
  isMarketplacePartner: boolean;
  source: "subscription" | "marketplace_partner" | "none";
  planId: string;
  expiryDate: string | null;
}

type FirestoreRecord = Record<string, unknown>;

function timestampMillis(value: unknown): number {
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

function expiryFor(record: FirestoreRecord): number {
  return timestampMillis(record.expiryDate ?? record.currentPeriodEnd ?? record.partnerExpiry);
}

function isCommissionWaiverPlan(planId: unknown): boolean {
  const normalized = String(planId || "").trim().toLowerCase();
  return COMMISSION_WAIVER_PLANS.has(normalized) || normalized.includes("max");
}

/**
 * Reads the current seller entitlement from the subscription ledger rather
 * than trusting denormalized subscription fields on the store document.
 *
 * Marketplace Partner is intentionally separate: that payment flow records
 * partnerPlan/partnerExpiry on the store and does not create a subscription
 * document. Subscription plans must have a matching active subscription
 * document, so deleting that document immediately removes the waiver even if
 * old fields remain on stores/{uid}.
 */
export async function getSellerEntitlements(
  storeId: string,
  suppliedStoreData?: FirestoreRecord,
): Promise<SellerEntitlements> {
  const now = Date.now();
  let storeData = suppliedStoreData;

  if (!storeData) {
    const storeSnapshot = await adminDb.collection("stores").doc(storeId).get();
    storeData = storeSnapshot.exists ? (storeSnapshot.data() as FirestoreRecord) : {};
  }

  const partnerExpiry = timestampMillis(storeData.partnerExpiry);
  const isMarketplacePartner =
    storeData.isPartner === true &&
    String(storeData.partnerPlan || "").trim().toLowerCase() === "marketplace-pro" &&
    partnerExpiry > now;

  let activeSubscription: FirestoreRecord | null = null;

  try {
    const snapshot = await adminDb
      .collection("subscriptions")
      .where("userId", "==", storeId)
      .get();

    const activeSubscriptions = snapshot.docs
      .map((subscription) => subscription.data() as FirestoreRecord)
      .filter((subscription) => {
        const status = String(subscription.status || "").trim().toLowerCase();
        return status === ACTIVE_SUBSCRIPTION_STATUS
          && isCommissionWaiverPlan(subscription.planId)
          && expiryFor(subscription) > now;
      })
      .sort((left, right) => expiryFor(right) - expiryFor(left));

    activeSubscription = activeSubscriptions[0] || null;
  } catch (error) {
    // Fail closed if the ledger cannot be read. A temporary database error
    // must never grant a stale 0% commission entitlement.
    console.error("Failed to resolve seller subscription entitlement:", error);
  }

  if (activeSubscription) {
    const expiry = expiryFor(activeSubscription);
    return {
      hasCommissionWaiver: true,
      isMarketplacePartner: false,
      source: "subscription",
      planId: String(activeSubscription.planId || ""),
      expiryDate: new Date(expiry).toISOString(),
    };
  }

  if (isMarketplacePartner) {
    return {
      hasCommissionWaiver: true,
      isMarketplacePartner: true,
      source: "marketplace_partner",
      planId: String(storeData.partnerPlan || "marketplace-pro"),
      expiryDate: new Date(partnerExpiry).toISOString(),
    };
  }

  return {
    hasCommissionWaiver: false,
    isMarketplacePartner: false,
    source: "none",
    planId: "",
    expiryDate: null,
  };
}
