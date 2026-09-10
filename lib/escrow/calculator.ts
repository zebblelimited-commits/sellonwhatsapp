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

const BUYER_FEE_RATE = 0.015;
const SELLER_FEE_RATE = 0.015;
export const DEFAULT_COURIER_HANDLING_FEE = 200;

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
