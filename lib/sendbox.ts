// lib/sendbox.ts

const SENDBOX_BASE_URL = process.env.SENDBOX_BASE_URL || "https://sandbox.staging.sendbox.co/shipping";

let cachedToken: string | null = null;

/**
 * Authenticate with Sendbox using account credentials
 */
export async function getSendboxAuthToken(): Promise<string> {
    // 1. If we already have a token, return it directly
    if (cachedToken) {
        return cachedToken;
    }

    const email = process.env.SENDBOX_EMAIL;
    const password = process.env.SENDBOX_PASSWORD;

    if (!email || !password) {
        throw new Error("SENDBOX_EMAIL or SENDBOX_PASSWORD missing from environment variables.");
    }

    const response = await fetch(`${SENDBOX_BASE_URL}/user/authenticate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sendbox Authentication Failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const token = data.access_token || data.token || data.authorization_key;

    if (!token) {
        throw new Error("No access_token returned from Sendbox authentication endpoint.");
    }

    // 2. Format as Bearer token
    const formattedToken = token.startsWith("Bearer ") ? token : `Bearer ${token}`;

    // 3. Save to variable and return guaranteed string
    cachedToken = formattedToken;
    return formattedToken;
}

export interface SendboxQuoteRequest {
    origin_country?: string;
    origin_country_code?: string;
    origin_state?: string;
    origin_state_code?: string;
    destination_country?: string;
    destination_country_code?: string;
    destination_state: string;
    destination_state_code?: string;
    weight: number;
}

/**
 * Fetch delivery quotes using authenticated token
 */
export async function fetchSendboxQuote(params: SendboxQuoteRequest) {
    const authToken = await getSendboxAuthToken();

    const response = await fetch(`${SENDBOX_BASE_URL}/shipment_delivery_quote`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: authToken,
        },
        body: JSON.stringify({
            origin_country: params.origin_country || "Nigeria",
            origin_country_code: params.origin_country_code || "NG",
            origin_state: params.origin_state || "Lagos",
            origin_state_code: params.origin_state_code || "LOS",
            destination_country: params.destination_country || "Nigeria",
            destination_country_code: params.destination_country_code || "NG",
            destination_state: params.destination_state,
            destination_state_code: params.destination_state_code || "",
            weight: params.weight || 1,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sendbox API Quote Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : data.rates || data.quotes || [];
}