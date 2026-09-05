// lib/sendbox.ts

const configuredBaseUrl = (process.env.SENDBOX_BASE_URL || "https://sandbox.staging.sendbox.co/shipping").replace(/\/+$/, "");
const SENDBOX_BASE_URL = configuredBaseUrl.endsWith("/shipping")
    ? configuredBaseUrl
    : `${configuredBaseUrl}/shipping`;

let cachedToken: string | null = null;

export function sendboxConfigured() {
    return Boolean(
        process.env.SENDBOX_ACCESS_TOKEN?.trim() ||
        (process.env.SENDBOX_EMAIL?.trim() && process.env.SENDBOX_PASSWORD?.trim())
    );
}

/**
 * Authenticate with Sendbox using account credentials
 */
export async function getSendboxAuthToken(): Promise<string> {
    const configuredAccessToken = process.env.SENDBOX_ACCESS_TOKEN?.trim();
    if (configuredAccessToken) {
        // Sendbox's permanent access token is passed directly in the
        // Authorization header; it is not a Bearer token.
        return configuredAccessToken.replace(/^Bearer\s+/i, "");
    }

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

    // Sendbox uses the access token directly in the Authorization header.
    cachedToken = String(token).replace(/^Bearer\s+/i, "");
    return cachedToken;
}

export interface SendboxQuoteRequest {
    origin_country?: string;
    origin_country_code?: string;
    origin_state?: string;
    origin_state_code?: string;
    origin_name?: string;
    origin_phone?: string;
    origin_city?: string;
    origin_street?: string;
    destination_country?: string;
    destination_country_code?: string;
    destination_state: string;
    destination_state_code?: string;
    destination_name?: string;
    destination_phone?: string;
    destination_city?: string;
    destination_street?: string;
    weight: number;
}

export interface SendboxAddress {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    lga?: string;
    postalCode?: string;
    phone?: string;
    email?: string;
    latitude?: number | string;
    longitude?: number | string;
}

export interface SendboxShipment {
    id?: string | number;
    code?: string;
    tracking_code?: string;
    status_code?: string;
    current_status?: { code?: string; name?: string };
    [key: string]: unknown;
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
            origin_name: params.origin_name || "SellOnWhatsApp seller",
            origin_phone: phoneText(params.origin_phone),
            origin_city: params.origin_city || params.origin_state || "Lagos",
            origin_street: params.origin_street || "Seller pickup address",
            destination_country: params.destination_country || "Nigeria",
            destination_country_code: params.destination_country_code || "NG",
            destination_state: params.destination_state,
            destination_state_code: params.destination_state_code || "",
            destination_name: params.destination_name || "SellOnWhatsApp customer",
            destination_phone: phoneText(params.destination_phone),
            destination_city: params.destination_city || params.destination_state,
            destination_street: params.destination_street || "Buyer delivery address",
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

function phoneText(value: unknown) {
    const phone = String(value || "").replace(/[^\d+]/g, "");
    if (phone.startsWith("0")) return `+234${phone.slice(1)}`;
    return phone;
}

function contactName(value: unknown, fallback: string) {
    const name = String(value || "").trim() || fallback;
    const parts = name.split(/\s+/);
    return {
        name,
        first_name: parts[0] || fallback,
        last_name: parts.slice(1).join(" ") || "",
    };
}

function contactAddress(address: SendboxAddress, fallbackName: string) {
    const contact = contactName(address.name, fallbackName);
    return {
        ...contact,
        street: String(address.address || "Address not provided").slice(0, 120),
        street_line_2: String(address.lga || "").slice(0, 80),
        state: address.state || "",
        email: address.email || "",
        city: address.city || address.lga || address.state || "",
        country: "NG",
        post_code: address.postalCode || "",
        phone: phoneText(address.phone),
        lng: Number(address.longitude) || 0,
        lat: Number(address.latitude) || 0,
    };
}

/** Creates a Sendbox shipment after the marketplace payment is confirmed. */
export async function createSendboxShipment(params: {
    sender: SendboxAddress;
    receiver: SendboxAddress;
    items: Array<Record<string, unknown>>;
    weightKg: number;
    totalValueNaira: number;
    selectedCourierId?: string;
    reference: string;
}): Promise<SendboxShipment> {
    const authToken = await getSendboxAuthToken();
    const senderState = String(params.sender.state || "").trim().toLowerCase();
    const receiverState = String(params.receiver.state || "").trim().toLowerCase();
    const serviceCode = senderState && receiverState && senderState === receiverState ? "local" : "nation-wide";
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://sellonwhatsapp.com").replace(/\/$/, "");
    const items = params.items.map((item) => ({
        name: String(item.name || item.productName || "Marketplace item").slice(0, 120),
        description: String(item.description || item.name || "Marketplace item").slice(0, 200),
        item_type_code: "other",
        quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
        weight: Math.max(0.1, Number(item.weightKg ?? item.weight) || 1),
        value: Math.max(0, Number(item.price ?? item.value) || 0),
    }));
    const body = {
        origin: contactAddress(params.sender, "SellOnWhatsApp seller"),
        destination: contactAddress(params.receiver, "SellOnWhatsApp customer"),
        weight: Math.max(0.1, Number(params.weightKg) || 1),
        dimension: { length: 1, width: 1, height: 1 },
        incoming_option: "pickup",
        region: "NG",
        total_value: Math.max(0, Number(params.totalValueNaira) || 0),
        currency: "NGN",
        channel_code: "api",
        pickup_date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        items,
        service_code: serviceCode,
        package_type: "general",
        customs_option: "recipient",
        reference_code: params.reference,
        ...(params.selectedCourierId ? { selected_courier_id: params.selectedCourierId } : {}),
        callback_url: `${appUrl}/api/webhooks/sendbox`,
    };
    const response = await fetch(`${SENDBOX_BASE_URL}/shipments`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: authToken,
        },
        body: JSON.stringify(body),
        cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`Sendbox shipment creation failed (${response.status}): ${JSON.stringify(payload)}`);
    }
    if (payload && typeof payload === "object" && payload.data && typeof payload.data === "object") {
        return payload.data as SendboxShipment;
    }
    return payload as SendboxShipment;
}
