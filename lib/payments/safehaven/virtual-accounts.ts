import { VirtualAccountRequest, VirtualAccountResponse } from "../provider";
import { SafeHavenConfig, safeHavenRequest } from "./client";

function responseData(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = value as Record<string, unknown>;
    const nested = result.data;
    return nested && typeof nested === "object" && !Array.isArray(nested) ? nested as Record<string, unknown> : result;
}

function expiryDate(data: Record<string, unknown>): Date | undefined {
    const raw = data.expiryDate || data.expiresAt;
    if (typeof raw === "string" || typeof raw === "number") {
        const date = new Date(raw);
        if (!Number.isNaN(date.getTime())) return date;
    }
    const seconds = Number(data.validFor);
    return Number.isFinite(seconds) && seconds > 0 ? new Date(Date.now() + seconds * 1000) : undefined;
}

export async function createSafeHavenVirtualAccount(
    request: VirtualAccountRequest,
    config?: SafeHavenConfig,
): Promise<VirtualAccountResponse> {
    if (!request.externalReference.trim()) throw new Error("externalReference is required");
    if (!Number.isFinite(request.amount) || request.amount <= 0) throw new Error("amount must be greater than zero");

    const callbackUrl = request.callbackUrl || `${(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")}/api/webhooks/safehaven`;
    if (!callbackUrl.startsWith("https://") && process.env.NODE_ENV === "production") {
        throw new Error("Safe Haven webhook callback URL must use HTTPS in production");
    }

    const result = await safeHavenRequest<unknown>("virtual-accounts", {
        method: "POST",
        body: JSON.stringify({
            validFor: request.validForSeconds ?? 900,
            callbackUrl,
            amountControl: request.amountControl || "Fixed",
            amount: Math.round(request.amount),
            externalReference: request.externalReference.trim(),
            ...(process.env.SAFEHAVEN_SETTLEMENT_ACCOUNT_NUMBER ? {
                settlementAccount: {
                    bankCode: process.env.SAFEHAVEN_SETTLEMENT_BANK_CODE || "090286",
                    accountNumber: process.env.SAFEHAVEN_SETTLEMENT_ACCOUNT_NUMBER,
                },
            } : {}),
        }),
    }, config);
    const data = responseData(result);
    const accountNumber = String(data.accountNumber || "").trim();
    const virtualAccountId = String(data._id || data.id || "").trim();
    if (!accountNumber || !virtualAccountId) throw new Error("Safe Haven returned an incomplete virtual account");

    return {
        virtualAccountId,
        accountNumber,
        accountName: String(data.accountName || "SellOnWhatsApp Escrow"),
        bankCode: String(data.bankCode || "090286"),
        bankName: String(data.bankName || "Safe Haven Microfinance Bank"),
        accountReference: String(data.externalReference || request.externalReference),
        expiryDate: expiryDate(data),
    };
}
