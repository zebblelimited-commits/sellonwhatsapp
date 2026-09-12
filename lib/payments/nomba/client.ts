import crypto from "crypto";
import type { PayoutRequest, PayoutResponse, PaymentProvider, VirtualAccountRequest, VirtualAccountResponse } from "@/lib/payments/provider";

type JsonObject = Record<string, any>;

export interface NombaConfig {
  baseUrl?: string;
  accountId?: string;
  fetcher?: typeof fetch;
}

export interface NombaCheckoutOrder {
  orderReference: string;
  amount: string;
  currency: "NGN";
  callbackUrl: string;
  customerEmail: string;
  customerId: string;
  /** Nomba requires this only when routing checkout funds to a subaccount. */
  accountId?: string;
  allowedPaymentMethods: string[];
  orderMetaData: Record<string, string>;
}

export interface NombaCheckoutResult {
  checkoutLink: string;
  orderReference: string;
  rawResponse: unknown;
}

export interface NombaTransactionResult {
  confirmed: boolean;
  status: string;
  transactionId?: string;
  amount?: number;
  rawResponse?: unknown;
}

export class NombaError extends Error {
  status: number;
  responseBody?: unknown;

  constructor(message: string, status = 502, responseBody?: unknown) {
    super(message);
    this.name = "NombaError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

export function nombaBaseUrl(config?: NombaConfig): string {
  return (
    config?.baseUrl ||
    process.env.NOMBA_BASE_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://api.nomba.com"
      : process.env.NOMBA_SANDBOX_URL || "https://sandbox.nomba.com")
  ).replace(/\/+$/, "");
}

function isSandbox(config?: NombaConfig): boolean {
  return nombaBaseUrl(config).toLowerCase().includes("sandbox");
}

function nombaAccountId(config?: NombaConfig): string {
  const accountId = config?.accountId || process.env.NOMBA_ACCOUNT_ID;
  if (!accountId?.trim()) throw new NombaError("NOMBA_ACCOUNT_ID is not configured", 503);
  return accountId.trim();
}

function credentials() {
  const clientId = process.env.NOMBA_CLIENT_ID?.trim();
  const clientSecret = process.env.NOMBA_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new NombaError("Nomba client credentials are not configured", 503);
  return { clientId, clientSecret };
}

function responseData(body: unknown): JsonObject {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const record = body as JsonObject;
  return record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? record.data
    : record;
}

async function parseResponse(response: Response): Promise<JsonObject> {
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text.slice(0, 500) }; }
  const record = body && typeof body === "object" ? body as JsonObject : {};
  const code = String(record.code ?? "");
  if (!response.ok || (code && !["00", "200"].includes(code))) {
    throw new NombaError(String(record.description || record.message || response.statusText || "Nomba request failed"), response.status || 502, body);
  }
  return record;
}

export async function getNombaAccessToken(config?: NombaConfig): Promise<string> {
  const { clientId, clientSecret } = credentials();
  const response = await (config?.fetcher || fetch)(`${nombaBaseUrl(config)}/v1/auth/token/issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", accountId: nombaAccountId(config) },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    cache: "no-store",
  });
  const body = await parseResponse(response);
  const token = String(responseData(body).access_token || "").trim();
  if (!token) throw new NombaError("Nomba did not return an access token", 502, body);
  return token;
}

async function nombaRequest<T = JsonObject>(path: string, init: RequestInit = {}, config?: NombaConfig): Promise<T> {
  const token = await getNombaAccessToken(config);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("accountId", nombaAccountId(config));
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await (config?.fetcher || fetch)(`${nombaBaseUrl(config)}/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  return await parseResponse(response) as T;
}

export async function createNombaCheckoutOrder(order: NombaCheckoutOrder, config?: NombaConfig): Promise<NombaCheckoutResult> {
  const request = {
    method: "POST",
    body: JSON.stringify({ order }),
  } satisfies RequestInit;
  const primaryPath = isSandbox(config) ? "sandbox/checkout/order" : "v1/checkout/order";
  let result: JsonObject;
  try {
    result = await nombaRequest<JsonObject>(primaryPath, request, config);
  } catch (error) {
    // Nomba currently publishes both sandbox path variants in its official
    // documentation. Retry only a sandbox 404; never retry other failures or
    // production requests, because a provider timeout could otherwise create
    // a duplicate checkout.
    if (!isSandbox(config) || !(error instanceof NombaError) || error.status !== 404) throw error;
    result = await nombaRequest<JsonObject>("v1/checkout/order", request, config);
  }
  const data = responseData(result);
  const checkoutLink = String(data.checkoutLink || "").trim();
  if (!checkoutLink) throw new NombaError("Nomba did not return a checkout link", 502, result);
  return {
    checkoutLink,
    orderReference: String(data.orderReference || order.orderReference),
    rawResponse: result,
  };
}

export async function verifyNombaTransaction(reference: string, config?: NombaConfig): Promise<NombaTransactionResult> {
  const value = reference.trim();
  if (!value) return { confirmed: false, status: "" };

  if (isSandbox(config)) {
    try {
      const url = new URL(`${nombaBaseUrl(config)}/sandbox/checkout/transaction`);
      url.searchParams.set("idType", "orderReference");
      url.searchParams.set("id", value);
      const result = await nombaRequest<JsonObject>(url.pathname + url.search, { method: "GET" }, config);
      const data = responseData(result);
      const details = data.transactionDetails && typeof data.transactionDetails === "object" ? data.transactionDetails as JsonObject : {};
      const order = data.order && typeof data.order === "object" ? data.order as JsonObject : {};
      const statusCode = String(details.statusCode || "").toUpperCase();
      const confirmed = data.success === true || String(data.success).toLowerCase() === "true" || statusCode.includes("SUCCESS") || statusCode.includes("APPROVED");
      if (confirmed) {
        return {
          confirmed: true,
          status: "SUCCESS",
          transactionId: String(details.paymentReference || details.transactionId || "") || undefined,
          amount: Number.isFinite(Number(order.amount)) ? Number(order.amount) : undefined,
          rawResponse: result,
        };
      }
    } catch (error) {
      const responseCode = error instanceof NombaError && error.responseBody && typeof error.responseBody === "object"
        ? String((error.responseBody as JsonObject).code || "")
        : "";
      if (!(error instanceof NombaError && (error.status === 404 || error.status === 200 || responseCode === "01"))) throw error;
    }
  }

  for (const queryKey of ["orderReference", "transactionRef", "merchantTxRef"]) {
    const url = new URL(`${nombaBaseUrl(config)}/v1/transactions/accounts/single`);
    url.searchParams.set(queryKey, value);
    try {
      const result = await nombaRequest<JsonObject>(url.pathname + url.search, { method: "GET" }, config);
      const data = responseData(result);
      const status = String(data.status || data.transactionStatus || data.gatewayMessage || "").toUpperCase();
      const confirmed = ["SUCCESS", "PAYMENT_SUCCESS", "PAYMENT_SUCCESSFUL", "PAYMENT SUCCESSFUL", "APPROVED", "COMPLETED"]
        .includes(status);
      return {
        confirmed,
        status,
        transactionId: String(data.id || data.transactionId || "") || undefined,
        amount: Number.isFinite(Number(data.amount)) ? Number(data.amount) : undefined,
        rawResponse: result,
      };
    } catch (error) {
      const responseCode = error instanceof NombaError && error.responseBody && typeof error.responseBody === "object"
        ? String((error.responseBody as JsonObject).code || "")
        : "";
      if (error instanceof NombaError && (error.status === 404 || error.status === 200 || responseCode === "01")) continue;
      throw error;
    }
  }
  return { confirmed: false, status: "NOT_FOUND" };
}

export function nombaWebhookSignature(payload: unknown, timestamp: string, secret: string): string {
  const body = payload && typeof payload === "object" ? payload as JsonObject : {};
  const merchant = body.data?.merchant || {};
  const transaction = body.data?.transaction || {};
  const responseCode = transaction.responseCode === "null" || transaction.responseCode == null ? "" : String(transaction.responseCode);
  const value = [
    body.event_type || "",
    body.requestId || body.request_id || "",
    merchant.userId || "",
    merchant.walletId || "",
    transaction.transactionId || "",
    transaction.type || "",
    transaction.time || "",
    responseCode,
    timestamp,
  ].join(":");
  return crypto.createHmac("sha256", secret).update(value).digest("base64");
}

export function isNombaWebhookSignatureValid(payload: unknown, timestamp: string, signature: string, secret: string): boolean {
  const expected = nombaWebhookSignature(payload, timestamp, secret);
  const received = Buffer.from(signature.trim());
  const generated = Buffer.from(expected);
  return received.length === generated.length && crypto.timingSafeEqual(received, generated);
}

export async function lookupNombaBankAccount(bankCode: string, accountNumber: string, config?: NombaConfig) {
  const result = await nombaRequest<JsonObject>("v1/transfers/bank/lookup", {
    method: "POST",
    body: JSON.stringify({ bankCode: bankCode.trim(), accountNumber: accountNumber.trim() }),
  }, config);
  const data = responseData(result);
  const accountName = String(data.accountName || data.name || data.account_name || "").trim();
  if (!accountName) throw new NombaError("Nomba could not verify the destination account", 400, result);
  return { accountName, accountNumber: String(data.accountNumber || accountNumber), bankCode: bankCode.trim(), rawResponse: result };
}

export async function listNombaBanks(config?: NombaConfig): Promise<unknown[]> {
  const result = await nombaRequest<JsonObject>("v1/transfers/banks", { method: "GET" }, config);
  const data = responseData(result);
  return Array.isArray(data) ? data : Array.isArray(data.banks) ? data.banks : [];
}

export async function initiateNombaBankTransfer(request: PayoutRequest, config?: NombaConfig): Promise<PayoutResponse> {
  const beneficiary = await lookupNombaBankAccount(request.destinationBankCode, request.accountNumber, config);
  const sourceAccount = process.env.NOMBA_PAYOUT_ACCOUNT_ID?.trim() || process.env.NOMBA_ESCROW_ACCOUNT_ID?.trim();
  const path = sourceAccount ? `v2/transfers/bank/${encodeURIComponent(sourceAccount)}` : "v2/transfers/bank";
  const result = await nombaRequest<JsonObject>(path, {
    method: "POST",
    body: JSON.stringify({
      amount: Math.round(request.amount),
      accountNumber: beneficiary.accountNumber,
      accountName: request.accountName || beneficiary.accountName,
      bankCode: beneficiary.bankCode,
      merchantTxRef: request.reference,
      senderName: process.env.NOMBA_SENDER_NAME || "SellOnWhatsApp",
      narration: request.narration,
    }),
  }, config);
  const data = responseData(result);
  const status = String(data.status || "").toUpperCase();
  return {
    success: ["SUCCESS", "PENDING_BILLING", "NEW"].includes(status),
    transferRef: String(data.id || data.transactionId || request.reference),
    providerStatus: status,
    rawResponse: result,
  };
}

export async function initiateNombaWalletTransfer(amount: number, receiverAccountId: string, reference: string, narration: string, config?: NombaConfig): Promise<PayoutResponse> {
  const result = await nombaRequest<JsonObject>("v2/transfers/wallet", {
    method: "POST",
    body: JSON.stringify({
      amount: Math.round(amount),
      receiverAccountId: receiverAccountId.trim(),
      merchantTxRef: reference,
      senderName: process.env.NOMBA_SENDER_NAME || "SellOnWhatsApp",
      narration,
    }),
  }, config);
  const data = responseData(result);
  const status = String(data.status || "").toUpperCase();
  return {
    success: status === "SUCCESS",
    transferRef: String(data.id || data.transactionId || reference),
    providerStatus: status,
    rawResponse: result,
  };
}

export class NombaProvider implements PaymentProvider {
  async createVirtualAccount(_payload: VirtualAccountRequest): Promise<VirtualAccountResponse> {
    throw new NombaError("Nomba checkout does not use the Safe Haven virtual-account flow", 501);
  }

  async verifyTransaction(reference: string): Promise<boolean> {
    const result = await verifyNombaTransaction(reference);
    return result.confirmed;
  }

  async initiatePayout(request: PayoutRequest): Promise<PayoutResponse> {
    return initiateNombaBankTransfer(request);
  }

  async processRefund(reference: string, amount: number) {
    const result = await nombaRequest<JsonObject>(isSandbox() ? "sandbox/checkout/refund" : "v1/checkout/refund", {
      method: "POST",
      body: JSON.stringify({ transactionId: reference.trim(), ...(amount > 0 ? { amount } : {}) }),
    });
    const data = responseData(result);
    return { success: data.success !== false, refundRef: String(data.transactionId || reference) };
  }
}

export const nombaProvider = new NombaProvider();
