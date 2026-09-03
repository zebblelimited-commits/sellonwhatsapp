const CHOWDECK_BASE_URL = (process.env.CHOWDECK_API_BASE_URL || "https://api.chowdeck.com").replace(/\/$/, "");

export type ChowdeckCoordinates = { latitude: number; longitude: number };

export type ChowdeckAddress = {
  address?: string;
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

export function chowdeckConfigured() {
  return Boolean(process.env.CHOWDECK_API_KEY && process.env.CHOWDECK_MERCHANT_REFERENCE);
}

function apiUrl(path: string) {
  const merchantReference = process.env.CHOWDECK_MERCHANT_REFERENCE;
  if (!merchantReference) throw new Error("CHOWDECK_MERCHANT_REFERENCE is missing");
  return `${CHOWDECK_BASE_URL}/merchant/${encodeURIComponent(merchantReference)}${path}`;
}

function headers() {
  const apiKey = process.env.CHOWDECK_API_KEY;
  if (!apiKey) throw new Error("CHOWDECK_API_KEY is missing");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
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
  return { [`${key}_address_string`]: addressText(address) };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || String((payload as { status?: unknown }).status || "").toLowerCase() === "failed") {
    throw new Error(String((payload as { message?: unknown }).message || `Chowdeck request failed (${response.status})`));
  }
  return payload as T;
}

/** Chowdeck requires the quote before a delivery can be created. Amounts are kobo. */
export async function fetchChowdeckDeliveryFee(params: {
  sourceAddress: ChowdeckAddress | string;
  destinationAddress: ChowdeckAddress | string;
  estimatedOrderAmountNaira?: number;
}): Promise<{ id: number | string; totalAmountNaira: number }> {
  const response = await fetch(apiUrl("/delivery/fee"), {
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
  const response = await fetch(apiUrl("/delivery"), {
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
      customer_vendor_note: params.vendorNote || "SellOnWhatsApp marketplace order",
      ...(params.deliveryPin ? { delivery_pin: params.deliveryPin } : {}),
      notification_channels: ["whatsapp", "email"],
    }),
    cache: "no-store",
  });
  const payload = await parseResponse<ChowdeckDeliveryResponse>(response);
  if (!payload.data) throw new Error("Chowdeck returned no delivery data");
  return payload.data;
}
