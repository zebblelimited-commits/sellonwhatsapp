// Relay is selected explicitly with CHOWDECK_API_MODE=relay. Keep the
// Merchant API configuration available as a fallback, but do not mix the two
// URL shapes: Relay does not use a merchant reference in its path.
const CHOWDECK_API_MODE = String(process.env.CHOWDECK_API_MODE || "merchant").trim().toLowerCase();
const CHOWDECK_RELAY_BASE_URL = (
  process.env.CHOWDECK_RELAY_API_BASE_URL ||
  "https://api.relay.chowdeck.com/relay"
).replace(/\/$/, "");
const CHOWDECK_MERCHANT_BASE_URL = (
  process.env.CHOWDECK_MERCHANT_API_BASE_URL ||
  process.env.CHOWDECK_API_BASE_URL ||
  "https://api.chowdeck.com"
).replace(/\/$/, "").replace(/\/merchant$/, "");

export function chowdeckUsesRelay() {
  return CHOWDECK_API_MODE === "relay";
}

export type ChowdeckCoordinates = { latitude: number; longitude: number };

export type ChowdeckAddress = {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  street?: string;
  city?: string;
  state?: string;
  lga?: string;
  postalCode?: string;
  latitude?: number | string;
  longitude?: number | string;
};

export type ChowdeckQuoteResponse = {
  status?: string;
  message?: string;
  data?: {
    id?: number | string;
    total_amount?: number | string;
    delivery_amount?: number | string;
  };
};

export type ChowdeckDeliveryResponse = {
  status?: string;
  message?: string;
  data?: {
    id?: number | string;
    reference?: string;
    delivery_price?: number | string;
    tracking_url?: string;
    status?: string;
    delivery_pin?: number | string;
  };
};

type ChowdeckRelayWalletResponse = {
  status?: string;
  message?: string;
  data?: {
    account_name?: string;
    account_number?: string;
    bank_code?: string;
    accountName?: string;
    accountNumber?: string;
    bankCode?: string;
  };
};

export function chowdeckConfigured() {
  return Boolean(
    process.env.CHOWDECK_API_KEY?.trim()
      && (chowdeckUsesRelay() || process.env.CHOWDECK_MERCHANT_REFERENCE?.trim()),
  );
}

function chowdeckUrl(path: string) {
  if (chowdeckUsesRelay()) return `${CHOWDECK_RELAY_BASE_URL}${path}`;
  const merchantReference = process.env.CHOWDECK_MERCHANT_REFERENCE?.trim();
  if (!merchantReference) throw new Error("CHOWDECK_MERCHANT_REFERENCE is missing");
  return `${CHOWDECK_MERCHANT_BASE_URL}/merchant/${encodeURIComponent(merchantReference)}${path}`;
}

function headers() {
  const apiKey = process.env.CHOWDECK_API_KEY?.trim();
  if (!apiKey) throw new Error("CHOWDECK_API_KEY is missing");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function chowdeckFetch(path: string, init: RequestInit) {
  const url = chowdeckUrl(path);
  try {
    return await fetch(url, init);
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error
      ? ` (${error.cause.message})`
      : "";
    const message = error instanceof Error ? error.message : "request failed";
    throw new Error(`Chowdeck network request failed for ${url}: ${message}${cause}`);
  }
}

function validCoordinates(address?: ChowdeckAddress): ChowdeckCoordinates | null {
  if (!address) return null;
  const latitude = Number(address.latitude);
  const longitude = Number(address.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    ? { latitude, longitude }
    : null;
}

export function addressText(address?: ChowdeckAddress | string) {
  if (!address) return "Address not provided";
  if (typeof address === "string") return address;
  return [address.address, address.city, address.lga, address.state, address.postalCode].filter(Boolean).join(", ") || "Address not provided";
}

function addressPayload(key: "source" | "destination", address?: ChowdeckAddress | string) {
  const value = typeof address === "string" ? { address } : address;
  const coordinates = validCoordinates(value);
  if (coordinates) return { [`${key}_address`]: coordinates };

  // Relay accepts either coordinates or a human-readable address string.
  // Keep the Merchant API path strict because its integration requires the
  // coordinate form used by the existing implementation.
  if (chowdeckUsesRelay()) {
    const text = addressText(address);
    if (text !== "Address not provided") return { [`${key}_address_string`]: text };
  }

  if (!coordinates) {
    throw new Error(`Chowdeck requires ${key} pickup coordinates (latitude and longitude).`);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  const message = String((payload as { message?: unknown }).message || `Chowdeck request failed (${response.status})`);
  if (!response.ok || String((payload as { status?: unknown }).status || "").toLowerCase() === "failed") {
    if (!chowdeckUsesRelay() && /vendor\s+not\s+found/i.test(message)) {
      throw new Error(
        "Chowdeck vendor not found. Verify CHOWDECK_API_KEY and CHOWDECK_MERCHANT_REFERENCE belong to the same Merchant API environment."
      );
    }
    if (/invalid\s+key|invalid\s+token|unauthori[sz]ed/i.test(message)) {
      throw new Error(
        "Chowdeck rejected the API key. Set CHOWDECK_API_KEY to the Merchant API secret key from the same sandbox/live environment as CHOWDECK_MERCHANT_REFERENCE; do not use the webhook secret."
      );
    }
    throw new Error(message);
  }
  return payload as T;
}

/** Chowdeck requires the quote before a delivery can be created. Amounts are kobo. */
export async function fetchChowdeckDeliveryFee(params: {
  sourceAddress: ChowdeckAddress | string;
  destinationAddress: ChowdeckAddress | string;
  estimatedOrderAmountNaira?: number;
}): Promise<{ id: number | string; totalAmountNaira: number }> {
  const response = await chowdeckFetch("/delivery/fee", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      ...addressPayload("source", params.sourceAddress),
      ...addressPayload("destination", params.destinationAddress),
      estimated_order_amount: Math.max(0, Math.round(Number(params.estimatedOrderAmountNaira || 0) * 100)),
    }),
    cache: "no-store",
  });
  const payload = await parseResponse<ChowdeckQuoteResponse>(response);
  const id = payload.data?.id;
  if (id === undefined || id === null || id === "") throw new Error("Chowdeck returned no fee ID");
  return {
    id,
    totalAmountNaira: Number(payload.data?.total_amount ?? payload.data?.delivery_amount ?? 0) / 100,
  };
}

export async function createChowdeckDelivery(params: {
  feeId: number | string;
  reference: string;
  itemType: string;
  sourceContact: { name: string; phone: string; email?: string };
  destinationContact: { name: string; phone: string; email?: string };
  estimatedOrderAmountNaira?: number;
  customerDeliveryNote?: string;
  vendorNote?: string;
  deliveryPin?: number;
}): Promise<NonNullable<ChowdeckDeliveryResponse["data"]>> {
  const response = await chowdeckFetch("/delivery", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      fee_id: Number(params.feeId),
      reference: params.reference,
      item_type: params.itemType || "parcel",
      user_action: "sending",
      source_contact: params.sourceContact,
      destination_contact: params.destinationContact,
      estimated_order_amount: Math.max(0, Math.round(Number(params.estimatedOrderAmountNaira || 0) * 100)),
      customer_delivery_note: params.customerDeliveryNote || "Handle with care",
      ...(!chowdeckUsesRelay()
        ? { customer_vendor_note: params.vendorNote || "SellOnWhatsApp marketplace order" }
        : {}),
      ...(params.deliveryPin ? { delivery_pin: params.deliveryPin } : {}),
      notification_channels: ["whatsapp", "email"],
    }),
    cache: "no-store",
  });
  const payload = await parseResponse<ChowdeckDeliveryResponse>(response);
  if (!payload.data) throw new Error("Chowdeck returned no delivery data");
  return payload.data;
}

/** Resolve the bank account used to fund Chowdeck Relay's wallet. */
export async function getChowdeckRelayWalletAccount(): Promise<{
  accountName: string;
  accountNumber: string;
  bankCode: string;
}> {
  if (!chowdeckUsesRelay()) throw new Error("Chowdeck Relay mode is not enabled");

  const response = await chowdeckFetch("/wallet/virtual-account", {
    method: "GET",
    headers: headers(),
    cache: "no-store",
  });
  const payload = await parseResponse<ChowdeckRelayWalletResponse>(response);
  const data = payload.data || {};
  const accountName = String(data.account_name || data.accountName || "").trim();
  const accountNumber = String(data.account_number || data.accountNumber || "").replace(/\D/g, "");
  const bankCode = String(data.bank_code || data.bankCode || "").replace(/\D/g, "");

  if (!accountName || !/^\d{10}$/.test(accountNumber) || !bankCode) {
    throw new Error("Chowdeck Relay did not return a usable wallet virtual account");
  }

  return { accountName, accountNumber, bankCode };
}
