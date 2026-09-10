import {
    PaymentProvider,
    PayoutRequest,
    PayoutResponse,
    VirtualAccountRequest,
    VirtualAccountResponse,
} from "../provider";
import { getAuthCredentials } from "@/src/infrastructure/payments/safehaven/auth";
import { createSafeHavenVirtualAccount } from "./virtual-accounts";
import { initiateSafeHavenTransfer } from "./transfers";

export interface SafeHavenConfig {
    baseUrl?: string;
    fetcher?: typeof fetch;
}

export class SafeHavenError extends Error {
    status: number;
    responseBody?: unknown;

    constructor(message: string, status = 502, responseBody?: unknown) {
        super(message);
        this.name = "SafeHavenError";
        this.status = status;
        this.responseBody = responseBody;
    }
}

export function safeHavenBaseUrl(config?: SafeHavenConfig): string {
    return (config?.baseUrl || process.env.SAFEHAVEN_BASE_URL || "https://api.sandbox.safehavenmfb.com").replace(/\/+$/, "");
}

export function safeHavenUrl(path: string, config?: SafeHavenConfig): string {
    return `${safeHavenBaseUrl(config)}/${path.replace(/^\/+/, "")}`;
}

export async function safeHavenRequest<T>(
    path: string,
    init: RequestInit = {},
    config?: SafeHavenConfig,
): Promise<T> {
    const { accessToken, ibsClientId } = await getAuthCredentials();
    const fetcher = config?.fetcher || fetch;
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("ClientID", ibsClientId);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    const response = await fetcher(safeHavenUrl(path, config), { ...init, headers, cache: "no-store" });
    const text = await response.text();
    let body: unknown = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text.slice(0, 500) }; }
    const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const statusCode = Number(data.statusCode);
    if (!response.ok || data.status === false || (Number.isFinite(statusCode) && statusCode >= 400)) {
        const message = typeof data.message === "string" ? data.message : response.statusText || "Safe Haven request failed";
        throw new SafeHavenError(message, response.status || 502, body);
    }
    return body as T;
}

export class SafeHavenProvider implements PaymentProvider {
    private readonly config: SafeHavenConfig;

    constructor(config: SafeHavenConfig = {}) { this.config = config; }

    async createVirtualAccount(request: VirtualAccountRequest): Promise<VirtualAccountResponse> {
        return createSafeHavenVirtualAccount(request, this.config);
    }

    async verifyTransaction(reference: string): Promise<boolean> {
        if (!reference.trim()) return false;
        try {
            // Checkout.js payments are verified with the checkout reference,
            // not the transfer-status endpoint used by legacy bank transfers.
            const result = await safeHavenRequest<unknown>(
                `checkout/${encodeURIComponent(reference.trim())}/verify`,
                { method: "GET" },
                this.config,
            );
            const data = result && typeof result === "object" && (result as { data?: unknown }).data && typeof (result as { data: unknown }).data === "object"
                ? (result as { data: Record<string, unknown> }).data
                : result as Record<string, unknown>;
            const status = String(data?.status || data?.transactionStatus || data?.paymentStatus || "").toLowerCase();
            return data?.success === true
                || data?.isPaid === true
                || ["completed", "successful", "success", "approved", "paid"].includes(status);
        } catch { return false; }
    }

    async initiatePayout(request: PayoutRequest): Promise<PayoutResponse> {
        return initiateSafeHavenTransfer(request, this.config);
    }

    async processRefund(reference: string, amount: number): Promise<{ success: boolean; refundRef: string }> {
        if (!reference.trim() || !Number.isFinite(amount) || amount <= 0) {
            throw new SafeHavenError("A valid payment reference and refund amount are required", 400);
        }
        // The public Safe Haven reference documents transfer status and
        // creation, but not a universal refund endpoint. Configure the path
        // enabled for this merchant account rather than silently faking a refund.
        const result = await safeHavenRequest<unknown>(
            process.env.SAFEHAVEN_REFUND_PATH || "transfers/refund",
            { method: "POST", body: JSON.stringify({ transactionReference: reference.trim(), amount }) },
            this.config,
        );
        const data = result && typeof result === "object" && (result as { data?: unknown }).data && typeof (result as { data: unknown }).data === "object"
            ? (result as { data: Record<string, unknown> }).data
            : result as Record<string, unknown>;
        return { success: true, refundRef: String(data.paymentReference || data.reference || data.transactionReference || reference) };
    }
}

export const safeHavenProvider = new SafeHavenProvider();
