// lib/fez.ts

const FEZ_BASE_URL = process.env.FEZ_BASE_URL || "https://apisandbox.fezdelivery.co/v1";

// Cache token in-memory to prevent excess authentication requests
let cachedAuthToken: string | null = null;
let tokenExpiryTimestamp: number | null = null;

// --- Interfaces ---

export interface FezAuthResponse {
    status: string;
    description: string;
    authDetails: {
        authToken: string;
        expireToken: string;
    };
    userDetails: {
        userID: string;
        "Full Name": string;
        Username: string;
    };
    orgDetails: {
        "secret-key": string;
        "Org Full Name": string;
    };
}

export interface FezCostRequest {
    state: string; // Destination State
    pickUpState?: string;
    weight?: number;
    locker?: boolean;
}

export interface FezCostResponse {
    status: string;
    description: string;
    cost: {
        state: string;
        cost: number;
    };
    vat: {
        vatAmount: number;
        vatPercent: string;
    };
    totalCost: number;
}

export interface FezCreateOrderItem {
    recipientAddress: string;
    recipientState: string;
    recipientName: string;
    recipientPhone: string;
    recipientEmail?: string;
    uniqueID: string; // Your internal order reference ID
    BatchID: string;
    valueOfItem: string | number;
    weight?: number;
    itemDescription?: string;
    additionalDetails?: string;
    pickUpState?: string;
    pickUpAddress?: string;

    // Custom Store / Third-Party Sender Support
    thirdparty?: "true" | "false";
    senderName?: string;
    senderAddress?: string;
    senderPhone?: string;
}

export interface FezCreateOrderResponse {
    status: string;
    description: string;
    orderNos?: Record<string, string>; // Maps internal uniqueID -> Fez Order Number
}

export interface FezTrackResponse {
    status: string;
    description: string;
    order?: {
        orderNo: string;
        orderStatus: string;
        recipientAddress: string;
        recipientName: string;
        senderAddress: string;
        senderName: string;
        recipientState: string;
        createdAt: string;
    };
    history?: Array<{
        orderStatus: string;
        statusCreationDate: string;
        statusDescription: string;
    }>;
}

// --- Helper Functions ---

/**
 * 1. Authenticate & Obtain Bearer Token (/user/authenticate)
 */
export async function getFezAuthToken(): Promise<string> {
    const now = Date.now();

    // Return cached token if valid (5 minute safety margin)
    if (cachedAuthToken && tokenExpiryTimestamp && now < tokenExpiryTimestamp - 5 * 60 * 1000) {
        return cachedAuthToken;
    }

    const userId = process.env.FEZ_USER_ID;
    const password = process.env.FEZ_PASSWORD;

    if (!userId || !password) {
        throw new Error("FEZ_USER_ID or FEZ_PASSWORD missing from environment variables.");
    }

    const response = await fetch(`${FEZ_BASE_URL}/user/authenticate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, password }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FEZ Auth Error (${response.status}): ${errorText}`);
    }

    const data: FezAuthResponse = await response.json();

    if (data.status !== "Success" || !data.authDetails?.authToken) {
        throw new Error(data.description || "FEZ Authentication failed.");
    }

    cachedAuthToken = data.authDetails.authToken;
    tokenExpiryTimestamp = new Date(data.authDetails.expireToken).getTime();

    return cachedAuthToken;
}

/**
 * Utility to get generic authorized headers for FEZ API requests
 */
async function getFezHeaders() {
    const token = await getFezAuthToken();
    const secretKey = process.env.FEZ_SECRET_KEY;

    if (!secretKey) {
        throw new Error("FEZ_SECRET_KEY is missing from environment variables.");
    }

    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "secret-key": secretKey,
    };
}

/**
 * 2. Calculate Delivery Cost (/order/cost)
 */
export async function fetchFezDeliveryCost(params: FezCostRequest): Promise<FezCostResponse> {
    const headers = await getFezHeaders();

    const response = await fetch(`${FEZ_BASE_URL}/order/cost`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            state: params.state,
            pickUpState: params.pickUpState,
            weight: params.weight || 1,
            locker: params.locker || false,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FEZ Delivery Cost Error (${response.status}): ${errorText}`);
    }

    return await response.json();
}

/**
 * 3. Create Single or Batch Orders (/order)
 */
export async function createFezOrders(
    orders: FezCreateOrderItem[]
): Promise<FezCreateOrderResponse> {
    const headers = await getFezHeaders();

    const response = await fetch(`${FEZ_BASE_URL}/order`, {
        method: "POST",
        headers,
        body: JSON.stringify(orders),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FEZ Create Order Error (${response.status}): ${errorText}`);
    }

    return await response.json();
}

/**
 * 4. Track Order Status & Timeline (/order/track/{orderNumber})
 */
export async function trackFezOrder(orderNumber: string): Promise<FezTrackResponse> {
    const headers = await getFezHeaders();

    const response = await fetch(`${FEZ_BASE_URL}/order/track/${orderNumber}`, {
        method: "GET",
        headers,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FEZ Track Order Error (${response.status}): ${errorText}`);
    }

    return await response.json();
}

/**
 * 5. Cancel Order (/order/cancel)
 */
export async function cancelFezOrder(orderNo: string, reason: string) {
    const headers = await getFezHeaders();

    const response = await fetch(`${FEZ_BASE_URL}/order/cancel`, {
        method: "POST",
        headers,
        body: JSON.stringify({ orderNo, reason }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FEZ Cancel Order Error (${response.status}): ${errorText}`);
    }

    return await response.json();
}

/**
 * 6. Register Webhook Endpoint (/webhooks/store)
 */
export async function registerFezWebhook(webhookUrl: string) {
    const headers = await getFezHeaders();

    const response = await fetch(`${FEZ_BASE_URL}/webhooks/store`, {
        method: "POST",
        headers,
        body: JSON.stringify({ webhook: webhookUrl }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FEZ Register Webhook Error (${response.status}): ${errorText}`);
    }

    return await response.json();
}