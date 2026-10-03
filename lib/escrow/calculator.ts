export interface BreakdownParams {
    productCost: number;
    shippingCost: number;
    courierHandlingFee?: number;
    isSubscribedSeller?: boolean;
}

export type BreakdownInput = BreakdownParams;

export interface EscrowBreakdown {
    buyerBreakdown: {
        productCost: number;
        shippingCost: number;
        buyerPlatformFee: number;
        courierHandlingFee: number;
        totalPaidByBuyer: number;
    };
    allocations: {
        sellerPayout: number;
        sellerCommission: number;
        courierPayout: number;
        platformRevenue: number;
    };
    sellerBreakdown: {
        grossProductAmount: number;
        sellerCommissionRate: number;
        sellerCommission: number;
        sellerPayout: number;
    };
    courierBreakdown: { shippingFee: number; courierPayout: number };
    platformBreakdown: {
        buyerPlatformFee: number;
        courierHandlingFee: number;
        sellerCommission: number;
        totalRevenue: number;
    };
    buyerSummary: EscrowBreakdown["buyerBreakdown"];
    sellerSummary: EscrowBreakdown["sellerBreakdown"];
    courierSummary: EscrowBreakdown["courierBreakdown"];
    platformSummary: EscrowBreakdown["platformBreakdown"];
}

export const BUYER_FEE_RATE = 0.015;
export const SELLER_FEE_RATE = 0.015;
export const DEFAULT_COURIER_HANDLING_FEE = 200;

const SELLER_COMMISSION_WAIVER_PLANS = new Set([
    "pro_lite",
    "pro_business_lite",
    "pro_max",
    "pro_business_max",
    "pro_yearly_business_max",
]);

/**
 * Returns whether a seller currently qualifies for the checkout commission
 * waiver. Legacy partner records may only have isPartner, so an absent expiry
 * is accepted for that flag; plan-based records are synchronized with an
 * expiry by the subscription activation flows.
 */
export function hasSellerCommissionWaiver(store: {
    isPartner?: unknown;
    subscriptionPlan?: unknown;
    partnerExpiry?: unknown;
    subscriptionExpiry?: unknown;
    premiumExpiresAt?: unknown;
}): boolean {
    const planId = String(store.subscriptionPlan || "").trim().toLowerCase();
    const eligiblePlan = SELLER_COMMISSION_WAIVER_PLANS.has(planId) || planId.includes("max");
    const eligible = store.isPartner === true || eligiblePlan;
    if (!eligible) return false;

    const expiryValue = store.partnerExpiry ?? store.subscriptionExpiry ?? store.premiumExpiresAt;
    if (expiryValue === undefined || expiryValue === null || expiryValue === "") {
        return store.isPartner === true;
    }

    const expiryDate = typeof expiryValue === "object" && expiryValue !== null && typeof (expiryValue as { toDate?: unknown }).toDate === "function"
        ? (expiryValue as { toDate: () => Date }).toDate()
        : new Date(expiryValue as string | number);
    return Number.isFinite(expiryDate.getTime()) && expiryDate.getTime() > Date.now();
}

function money(value: number, field: string): number {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${field} must be a finite, non-negative amount`);
    }
    return Math.round(value);
}

/** Calculates the immutable financial breakdown for one escrow order. */
export function calculateEscrowBreakdown(params: BreakdownParams): EscrowBreakdown {
    const productCost = money(params.productCost, "productCost");
    const shippingCost = money(params.shippingCost, "shippingCost");
    const courierHandlingFee = money(
        params.courierHandlingFee ?? DEFAULT_COURIER_HANDLING_FEE,
        "courierHandlingFee",
    );
    const buyerPlatformFee = Math.round(BUYER_FEE_RATE * (productCost + shippingCost));
    const totalPaidByBuyer = productCost + shippingCost + buyerPlatformFee + courierHandlingFee;
    const sellerCommissionRate = params.isSubscribedSeller === true ? 0 : SELLER_FEE_RATE;
    const sellerCommission = Math.round(productCost * sellerCommissionRate);
    const sellerPayout = productCost - sellerCommission;
    const platformRevenue = buyerPlatformFee + courierHandlingFee + sellerCommission;

    const buyerBreakdown = { productCost, shippingCost, buyerPlatformFee, courierHandlingFee, totalPaidByBuyer };
    const sellerBreakdown = { grossProductAmount: productCost, sellerCommissionRate, sellerCommission, sellerPayout };
    const courierBreakdown = { shippingFee: shippingCost, courierPayout: shippingCost };
    const platformBreakdown = { buyerPlatformFee, courierHandlingFee, sellerCommission, totalRevenue: platformRevenue };

    return {
        buyerBreakdown,
        allocations: { sellerPayout, sellerCommission, courierPayout: shippingCost, platformRevenue },
        sellerBreakdown,
        courierBreakdown,
        platformBreakdown,
        buyerSummary: buyerBreakdown,
        sellerSummary: sellerBreakdown,
        courierSummary: courierBreakdown,
        platformSummary: platformBreakdown,
    };
}
