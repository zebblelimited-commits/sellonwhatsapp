const DEFAULT_GIG_BASE_URL = "https://dev-thirdpartynode.theagilitysystems.com";

const GIG_BASE_URL = (process.env.GIG_API_BASE_URL || DEFAULT_GIG_BASE_URL).replace(/\/+$/, "");
const GIG_REQUEST_TIMEOUT_MS = Math.max(3_000, Number(process.env.GIG_REQUEST_TIMEOUT_MS) || 8_000);

type JsonRecord = Record<string, unknown>;

export type GigAddress = {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  street?: string;
  city?: string;
  lga?: string;
  state?: string;
  postalCode?: string;
  latitude?: number | string;
  longitude?: number | string;
};

export type GigQuote = {
  shippingFeeNaira: number;
  senderStationId: string | number;
  receiverStationId: string | number;
  customerCode: string;
  tempCode?: string;
  priceResponse?: JsonRecord;
};

export type GigShipment = {
  providerReference: string;
  trackingId: string;
  trackingUrl?: string;
  status?: string;
  tempCode?: string;
  rawResponse?: JsonRecord;
};

type GigClient = {
  accessToken: string;
  customerCode: string;
};

type GigStation = {
  id: string | number;
  text: string;
};

let cachedClient: (GigClient & { expiresAt: number }) | null = null;
let loginPromise: Promise<GigClient> | null = null;
let stationsPromise: Promise<GigStation[]> | null = null;

const text = (value: unknown, fallback = "") => {
  const result = String(value ?? "").trim();
  return result || fallback;
};

const normalise = (value: unknown) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const numberOrUndefined = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

function ownValue(record: JsonRecord, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const key = Object.keys(record).find((candidate) => wanted.has(candidate.toLowerCase()));
  return key ? record[key] : undefined;
}

function findValue(payload: unknown, keys: string[], maxDepth = 5): unknown {
  if (maxDepth < 0 || payload === null || payload === undefined) return undefined;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findValue(item, keys, maxDepth - 1);
      if (found !== undefined && found !== null && found !== "") return found;
    }
    return undefined;
  }
  if (typeof payload !== "object") return undefined;

  const record = payload as JsonRecord;
  const direct = ownValue(record, keys);
  if (direct !== undefined && direct !== null && direct !== "") return direct;

  for (const value of Object.values(record)) {
    const found = findValue(value, keys, maxDepth - 1);
    if (found !== undefined && found !== null && found !== "") return found;
  }
  return undefined;
}

function responseMessage(payload: unknown) {
  return text(findValue(payload, ["message", "description", "error", "title"]), "GIG API request failed");
}

class GigApiError extends Error {
  status: number;
  payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "GigApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function gigConfigured() {
  return Boolean((process.env.GIG_EMAIL || process.env.GIG_USERNAME)?.trim() && process.env.GIG_PASSWORD?.trim());
}

function gigEmail() {
  return text(process.env.GIG_EMAIL || process.env.GIG_USERNAME);
}

async function readResponse(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!body.trim()) return {};
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return { message: body.slice(0, 500) };
  }
}

async function rawRequest(path: string, init: RequestInit, accessToken?: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GIG_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${GIG_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(accessToken ? { "access-token": accessToken } : {}),
        ...(init.headers || {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = await readResponse(response);
    if (!response.ok) throw new GigApiError(`${response.status}: ${responseMessage(payload)}`, response.status, payload);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function login(force = false): Promise<GigClient> {
  if (!gigConfigured()) throw new Error("GIG_EMAIL/GIG_USERNAME and GIG_PASSWORD are required");
  if (!force && cachedClient && cachedClient.expiresAt > Date.now()) {
    return cachedClient;
  }
  if (loginPromise) return loginPromise;

  loginPromise = (async () => {
    const payload = await rawRequest("/login", {
      method: "POST",
      body: JSON.stringify({ email: gigEmail(), password: process.env.GIG_PASSWORD }),
    });
    const accessToken = text(findValue(payload, ["access-token", "accessToken", "access_token", "token"]));
    if (!accessToken) throw new Error("GIG login succeeded without an access token");

    const customerCode = text(process.env.GIG_CUSTOMER_CODE || findValue(payload, ["customerCode", "customer_code", "customerNo", "customerNumber"]));
    const client = { accessToken, customerCode };
    cachedClient = { ...client, expiresAt: Date.now() + 15 * 60 * 1000 };
    return client;
  })().finally(() => {
    loginPromise = null;
  });

  return loginPromise;
}

async function authenticatedRequest(path: string, init: RequestInit) {
  let client = await login();
  try {
    return await rawRequest(path, init, client.accessToken);
  } catch (error) {
    if (!(error instanceof GigApiError) || error.status !== 401) throw error;
    cachedClient = null;
    client = await login(true);
    return rawRequest(path, init, client.accessToken);
  }
}

function locationForApi(address: GigAddress | undefined) {
  const latitude = numberOrUndefined(address?.latitude);
  const longitude = numberOrUndefined(address?.longitude);
  const addressText = text(address?.address || address?.street, "Address not provided");
  return {
    Address: addressText,
    City: text(address?.city || address?.lga),
    LGA: text(address?.lga),
    State: text(address?.state),
    Country: "Nigeria",
    PostalCode: text(address?.postalCode),
    Latitude: latitude,
    Longitude: longitude,
  };
}

function stationIdFromRecord(record: JsonRecord): string | number | undefined {
  const value = ownValue(record, ["stationId", "stationID", "localStationId", "id", "value"]);
  if (value === undefined || value === null || value === "") return undefined;
  return numberOrUndefined(value) ?? text(value);
}

function stationRecords(payload: unknown): GigStation[] {
  const records: GigStation[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth < 0 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth - 1));
      return;
    }
    if (typeof value !== "object") return;
    const record = value as JsonRecord;
    const id = stationIdFromRecord(record);
    if (id !== undefined) {
      const stationText = [
        ownValue(record, ["name", "stationName", "title"]),
        ownValue(record, ["city", "town"]),
        ownValue(record, ["state", "stateName"]),
        ownValue(record, ["address", "location"]),
      ].map(text).filter(Boolean).join(" ");
      records.push({ id, text: stationText });
    }
    Object.values(record).forEach((child) => visit(child, depth - 1));
  };
  visit(payload, 5);
  return Array.from(new Map(records.map((station) => [String(station.id), station])).values());
}

async function localStations() {
  if (!stationsPromise) {
    stationsPromise = authenticatedRequest("/localstations/get", { method: "GET" })
      .then(stationRecords)
      .catch((error) => {
        stationsPromise = null;
        throw error;
      });
  }
  return stationsPromise;
}

function configuredStationId(key: string) {
  const value = text(process.env[key]);
  return value ? numberOrUndefined(value) ?? value : undefined;
}

function resolveStationId(address: GigAddress | undefined, stations: GigStation[], overrideKey: string) {
  const override = configuredStationId(overrideKey);
  if (override !== undefined) return override;

  const state = normalise(address?.state);
  const city = normalise(address?.city || address?.lga);
  const target = normalise([address?.state, address?.city, address?.lga].filter(Boolean).join(" "));
  const scored = stations.map((station) => {
    const candidate = normalise(station.text);
    let score = 0;
    if (state && candidate.includes(state)) score += 5;
    if (city && candidate.includes(city)) score += 4;
    if (target && candidate.includes(target)) score += 2;
    return { station, score };
  }).sort((a, b) => b.score - a.score);

  if (!scored[0] || scored[0].score === 0) {
    throw new Error(`GIG station not found for ${text(address?.city || address?.lga || address?.state, "the supplied address")}. Set ${overrideKey} to the GIG station ID.`);
  }
  return scored[0].station.id;
}

function itemsForApi(items: Array<Record<string, unknown>>, fallbackWeightKg: number, totalValue: number) {
  const source = items.length > 0 ? items : [{ name: "Marketplace parcel", quantity: 1, weightKg: fallbackWeightKg, price: totalValue }];
  return source.map((item) => ({
    ItemType: 0,
    Description: text(item.name || item.title, "Marketplace item").slice(0, 200),
    Quantity: Math.max(1, Number(item.quantity) || 1),
    Weight: Math.max(0.1, Number(item.weightKg ?? item.weight) || fallbackWeightKg),
    Value: Math.max(0, Number(item.price ?? item.value) || 0),
    Length: numberOrUndefined(item.lengthCm ?? item.length),
    Width: numberOrUndefined(item.widthCm ?? item.width),
    Height: numberOrUndefined(item.heightCm ?? item.height),
  }));
}

function amountFromPriceResponse(payload: unknown) {
  const keys = ["totalAmount", "totalPrice", "shippingFee", "deliveryFee", "shipmentPrice", "amount", "price", "cost", "value"];
  const value = numberOrUndefined(findValue(payload, keys));
  if (value === undefined || value < 0) throw new Error(`GIG returned no usable shipment price: ${responseMessage(payload)}`);
  return value;
}

export async function fetchGigDeliveryQuote(params: {
  sender: GigAddress;
  receiver: GigAddress;
  totalWeightKg: number;
  cartTotal: number;
  items?: Array<Record<string, unknown>>;
}): Promise<GigQuote> {
  const client = await login();
  const customerCode = text(process.env.GIG_CUSTOMER_CODE || client.customerCode);
  if (!customerCode) throw new Error("GIG customer code is missing. Set GIG_CUSTOMER_CODE or ask GIG to include it in the test account response.");

  const stations = await localStations();
  const senderStationId = resolveStationId(params.sender, stations, "GIG_SENDER_STATION_ID");
  const receiverStationId = resolveStationId(params.receiver, stations, "GIG_RECEIVER_STATION_ID");
  const shipmentItems = itemsForApi(params.items || [], Math.max(1, params.totalWeightKg), params.cartTotal);

  const payload = await authenticatedRequest("/price", {
    method: "POST",
    body: JSON.stringify({
      SenderStationId: senderStationId,
      ReceiverStationId: receiverStationId,
      VehicleType: 1,
      ReceiverLocation: locationForApi(params.receiver),
      SenderLocation: locationForApi(params.sender),
      IsFromAgility: false,
      CustomerCode: customerCode,
      CustomerType: 0,
      DeliveryOptionIds: [],
      PickUpOptions: 0,
      ShipmentItems: shipmentItems,
      Value: params.cartTotal,
    }),
  }) as JsonRecord;

  return {
    shippingFeeNaira: amountFromPriceResponse(payload),
    senderStationId,
    receiverStationId,
    customerCode,
    tempCode: text(findValue(payload, ["tempCode", "temp_code", "preShipmentCode"])) || undefined,
    priceResponse: payload,
  };
}

function detailsForApi(address: GigAddress, stationId: string | number) {
  const location = locationForApi(address);
  return {
    Name: text(address.name, "SellOnWhatsApp customer"),
    FullName: text(address.name, "SellOnWhatsApp customer"),
    PhoneNumber: text(address.phone),
    Phone: text(address.phone),
    Email: text(address.email),
    ...location,
    StationId: stationId,
  };
}

export async function createGigShipment(params: {
  reference: string;
  sender: GigAddress;
  receiver: GigAddress;
  quote: GigQuote;
  items: Array<Record<string, unknown>>;
  totalWeightKg: number;
  totalValueNaira: number;
}): Promise<GigShipment> {
  const client = await login();
  const customerCode = text(process.env.GIG_CUSTOMER_CODE || client.customerCode || params.quote.customerCode);
  const senderStationId = params.quote.senderStationId ?? configuredStationId("GIG_SENDER_STATION_ID");
  const receiverStationId = params.quote.receiverStationId ?? configuredStationId("GIG_RECEIVER_STATION_ID");
  if (senderStationId === undefined || receiverStationId === undefined) throw new Error("GIG shipment is missing station IDs");

  const shipmentItems = itemsForApi(params.items, Math.max(1, params.totalWeightKg), params.totalValueNaira);
  const payload = await authenticatedRequest("/create/dropOff", {
    method: "POST",
    body: JSON.stringify({
      TempCode: params.quote.tempCode || "",
      SenderDetails: detailsForApi(params.sender, senderStationId),
      ReceiverDetails: detailsForApi(params.receiver, receiverStationId),
      ShipmentDetails: {
        Reference: params.reference,
        CustomerCode: customerCode,
        CustomerType: 0,
        ShipmentType: 2,
        VehicleType: 1,
        PickUpOptions: 0,
        DeliveryOptionIds: [],
        Value: params.totalValueNaira,
        Weight: Math.max(1, params.totalWeightKg),
      },
      ShipmentItems: shipmentItems,
    }),
  }) as JsonRecord;

  const providerReference = text(findValue(payload, [
    "waybill", "waybillNumber", "waybillNo", "waybillId", "trackingNumber", "trackingId", "shipmentNumber", "shipmentId", "reference",
  ]));
  if (!providerReference) throw new Error(`GIG did not return a waybill: ${responseMessage(payload)}`);

  return {
    providerReference,
    trackingId: providerReference,
    trackingUrl: text(process.env.GIG_TRACKING_URL_TEMPLATE).replace("{waybill}", encodeURIComponent(providerReference)) || undefined,
    status: text(findValue(payload, ["status", "shipmentStatus"]), "created"),
    tempCode: text(findValue(payload, ["tempCode", "temp_code"])) || undefined,
    rawResponse: payload,
  };
}

export async function trackGigShipment(waybill: string) {
  const params = new URLSearchParams({ Waybill: waybill, fetchOption: "1" });
  return authenticatedRequest(`/track/mobileShipment?${params.toString()}`, { method: "GET" });
}
