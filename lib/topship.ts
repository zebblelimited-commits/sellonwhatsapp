const TOPSHIP_BASE_URL = (process.env.TOPSHIP_API_BASE_URL || "https://topship-staging.africa/api").replace(/\/$/, "");

export type TopshipAddress = {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  street?: string;
  city?: string;
  state?: string;
  lga?: string;
  postalCode?: string;
};

export type TopshipQuote = {
  mode: string;
  cost: number;
  duration: string;
  currency: string;
  pricingTier: string;
  pickupId?: string;
  pickupPartner?: string;
  pickupCharge: number;
  totalCost: number;
  valueAddedTaxCharge: number;
};

export type TopshipShipment = {
  id?: string;
  trackingId?: string;
  trackingUrl?: string;
  shipmentStatus?: string;
  status?: string;
  totalCharge?: number;
  [key: string]: unknown;
};

type TopshipRate = {
  mode?: string;
  cost?: number | string;
  duration?: string;
  currency?: string;
  pricingTier?: string;
};

type TopshipPickupRate = {
  pickupCharge?: number | string;
  deliveryLocation?: string;
  partnerLogoUrl?: string;
  pickupId?: string;
  partner?: string;
};

export function topshipConfigured() {
  return Boolean(process.env.TOPSHIP_API_KEY?.trim());
}

function headers() {
  const apiKey = process.env.TOPSHIP_API_KEY?.trim();
  if (!apiKey) throw new Error("TOPSHIP_API_KEY is missing");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.message === "string" ? payload.message : JSON.stringify(payload);
    throw new Error(`Topship request failed (${response.status}): ${message}`);
  }
  return payload as T;
}

function cityOf(address?: TopshipAddress) {
  const rawCity = String(address?.city || address?.lga || address?.state || "Lagos").trim();

  // Store and buyer profiles commonly save an LGA (for example, "Jos South")
  // instead of a city. Topship's rate API expects the parent city ("Jos"),
  // so remove common directional/district suffixes before sending the route.
  return rawCity
    .replace(/\s+(north|south|east|west|central|mainland|island)$/i, "")
    .trim() || "Lagos";
}

function addressDetail(address?: TopshipAddress) {
  const addressLine1 = [address?.address, address?.street].filter(Boolean).join(", ") || "Address not provided";
  const addressLine2 = [address?.lga, address?.city].filter(Boolean).join(", ");
  return {
    name: address?.name || "SellOnWhatsApp customer",
    email: address?.email || "",
    phoneNumber: address?.phone || "",
    addressLine1: addressLine1.slice(0, 45),
    addressLine2: addressLine2.slice(0, 45),
    addressLine3: String(address?.state || "").slice(0, 45),
    country: "Nigeria",
    state: address?.state || "",
    city: cityOf(address),
    countryCode: "NG",
    postalCode: address?.postalCode || "",
  };
}

// Topship uses a smaller sender shape for pickup-rate lookup than it does for
// shipment creation. Sending name/email/phoneNumber here causes the staging
// GraphQL layer to reject the request before it can calculate pickup rates.
function pickupAddressDetail(address?: TopshipAddress) {
  const addressLine1 = [address?.address, address?.street].filter(Boolean).join(", ") || "Address not provided";
  const addressLine2 = [address?.lga, address?.city].filter(Boolean).join(", ");
  return {
    addressLine1: addressLine1.slice(0, 45),
    addressLine2: addressLine2.slice(0, 45),
    country: "Nigeria",
    countryCode: "NG",
    state: address?.state || "",
    city: cityOf(address),
  };
}

function numberOf(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function ratesFrom(payload: unknown): TopshipRate[] {
  if (Array.isArray(payload)) return payload as TopshipRate[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: TopshipRate[] }).data;
  }
  return [];
}

function pickupRatesFrom(payload: unknown): TopshipPickupRate[] {
  if (Array.isArray(payload)) return payload as TopshipPickupRate[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: TopshipPickupRate[] }).data;
  }
  return [];
}

/** Fetches the cheapest Topship route quote and the cheapest available pickup rate. */
export async function fetchTopshipQuote(params: {
  sender: TopshipAddress;
  receiver: TopshipAddress;
  totalWeightKg: number;
}): Promise<TopshipQuote> {
  const shipmentDetail = {
    senderDetails: { cityName: cityOf(params.sender), countryCode: "NG" },
    receiverDetails: { cityName: cityOf(params.receiver), countryCode: "NG" },
    totalWeight: Math.max(1, Number(params.totalWeightKg) || 1),
  };
  const query = new URLSearchParams({ shipmentDetail: JSON.stringify(shipmentDetail) });
  const rateResponse = await fetch(`${TOPSHIP_BASE_URL}/get-shipment-rate?${query.toString()}`, {
    method: "GET",
    headers: headers(),
    cache: "no-store",
  });
  const rates = ratesFrom(await parseResponse<unknown>(rateResponse))
    .map((rate) => ({
      mode: String(rate.mode || "Standard"),
      cost: numberOf(rate.cost),
      duration: String(rate.duration || "2-5 Business Days"),
      currency: String(rate.currency || "KOBO"),
      pricingTier: String(rate.pricingTier || "Budget"),
    }))
    .filter((rate) => rate.cost > 0)
    .sort((a, b) => a.cost - b.cost);

  const routeRate = rates[0];
  if (!routeRate) {
    throw new Error(
      `Topship returned no delivery rates for ${cityOf(params.sender)} to ${cityOf(params.receiver)}`
    );
  }

  let pickup: TopshipPickupRate | undefined;
  try {
    const pickupInput = {
      senderDetail: pickupAddressDetail(params.sender),
      pickupDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    const pickupQuery = new URLSearchParams({ input: JSON.stringify(pickupInput) });
    const pickupResponse = await fetch(`${TOPSHIP_BASE_URL}/get-pickup-rates?${pickupQuery.toString()}`, {
      method: "GET",
      headers: headers(),
      cache: "no-store",
    });
    const supportedPickupPartners = new Set(["fez", "standard", "dellyman", "sendstack", "messenger"]);
    const pickupRates = pickupRatesFrom(await parseResponse<unknown>(pickupResponse))
      .filter((rate) => numberOf(rate.pickupCharge) >= 0)
      .filter((rate) => supportedPickupPartners.has(String(rate.partner || "").trim().toLowerCase()))
      .sort((a, b) => numberOf(a.pickupCharge) - numberOf(b.pickupCharge));
    pickup = pickupRates[0];
  } catch (error) {
    // A route quote is still useful when Topship has not configured pickup
    // coverage for the sender. Booking will use DropOff in that case.
    console.warn("[TOPSHIP] Pickup rate unavailable; using route rate only:", error);
  }

  const cost = routeRate.cost;
  const pickupCharge = numberOf(pickup?.pickupCharge);
  const preTaxTotal = cost + pickupCharge;
  const valueAddedTaxCharge = Math.ceil(preTaxTotal * 0.075);
  return {
    ...routeRate,
    pickupId: pickup?.pickupId,
    pickupPartner: pickup?.partner,
    pickupCharge,
    totalCost: preTaxTotal + valueAddedTaxCharge,
    valueAddedTaxCharge,
  };
}

const TOPSHIP_CATEGORIES = new Set([
  "Appliance", "BeautyProducts", "Jewelry", "ComputerSupplies", "HomeDecor", "BabySupplies",
  "TelevisionAndEntertainment", "KitchenAccessories", "Furniture", "Gadgets", "SolarPanelsAndInverter",
  "VehicleParts", "ClothingAndTextile", "SportAccessories", "GymEquipment", "Fashion", "Education",
  "Drones", "Document", "FoodItems", "Medication", "LaptopsAndTablets", "Phones", "Others",
]);

function topshipCategory(item: Record<string, unknown>) {
  const category = String(item.category || item.productCategory || "Others");
  return TOPSHIP_CATEGORIES.has(category) ? category : "Others";
}

/** Saves a Topship draft shipment. Charges are sent in kobo as required by Topship. */
export async function createTopshipShipment(params: {
  quote: TopshipQuote;
  sender: TopshipAddress;
  receiver: TopshipAddress;
  items: Array<Record<string, unknown>>;
}): Promise<TopshipShipment> {
  const shipmentCharge = Math.max(0, Math.round(params.quote.cost));
  const pickupCharge = Math.max(0, Math.round(params.quote.pickupCharge));
  const insuranceCharge = 0;
  const discount = 0;
  const valueAddedTaxCharge = Math.max(0, Math.round(params.quote.valueAddedTaxCharge));
  const body = {
    shipment: [{
      items: params.items.map((item) => ({
        category: topshipCategory(item),
        description: String(item.name || item.productName || "Marketplace item").slice(0, 200),
        weight: Math.max(0.1, numberOf(item.weightKg ?? item.weight) || 1),
        quantity: Math.max(1, Math.round(numberOf(item.quantity) || 1)),
        value: Math.max(0, Math.round(numberOf(item.price) * 100)),
      })),
      itemCollectionMode: params.quote.pickupId ? "PickUp" : "DropOff",
      pricingTier: params.quote.pricingTier,
      insuranceType: "None",
      insuranceCharge,
      discount,
      shipmentRoute: "Domestic",
      shipmentCharge,
      pickupCharge,
      deliveryLocation: cityOf(params.receiver),
      ...(params.quote.pickupId ? { pickupId: params.quote.pickupId } : {}),
      ...(params.quote.pickupPartner ? { pickupPartner: params.quote.pickupPartner } : {}),
      valueAddedTaxCharge,
      senderDetail: addressDetail(params.sender),
      receiverDetail: addressDetail(params.receiver),
    }],
  };
  const response = await fetch(`${TOPSHIP_BASE_URL}/save-shipment`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return parseResponse<TopshipShipment>(response);
}

export async function payTopshipShipment(shipmentId: string): Promise<TopshipShipment> {
  const response = await fetch(`${TOPSHIP_BASE_URL}/pay-from-wallet`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ detail: { shipmentId } }),
    cache: "no-store",
  });
  return parseResponse<TopshipShipment>(response);
}

export async function trackTopshipShipment(trackingId: string): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({ trackingId });
  const response = await fetch(`${TOPSHIP_BASE_URL}/track-shipment?${query.toString()}`, {
    method: "GET",
    headers: headers(),
    cache: "no-store",
  });
  return parseResponse<Record<string, unknown>>(response);
}
