import { PayoutRequest, PayoutResponse } from "../provider";
import { SafeHavenConfig, safeHavenRequest } from "./client";

function responseData(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = value as Record<string, unknown>;
    const nested = result.data;
    return nested && typeof nested === "object" && !Array.isArray(nested) ? nested as Record<string, unknown> : result;
}

export interface BankAccountDetails {
    accountName: string;
    accountNumber: string;
    bankCode: string;
    sessionId: string;
}

export async function listSafeHavenBanks(config?: SafeHavenConfig): Promise<unknown[]> {
    const result = await safeHavenRequest<unknown>("transfers/banks", { method: "GET" }, config);
    const raw = result && typeof result === "object" ? (result as { data?: unknown }).data : undefined;
    return Array.isArray(raw) ? raw : [];
}

export async function resolveSafeHavenBankAccount(
    bankCode: string,
    accountNumber: string,
    config?: SafeHavenConfig,
): Promise<BankAccountDetails> {
    const result = await safeHavenRequest<unknown>("transfers/name-enquiry", {
        method: "POST",
        body: JSON.stringify({ bankCode: bankCode.trim(), accountNumber: accountNumber.trim() }),
    }, config);
    const data = responseData(result);
    const accountName = String(data.accountName || data.name || "").trim();
    const sessionId = String(data.sessionId || data.nameEnquiryReference || "").trim();
    if (!accountName || !sessionId) throw new Error("Safe Haven could not verify the destination account");
    return { accountName, accountNumber: String(data.accountNumber || accountNumber), bankCode, sessionId };
}

export async function initiateSafeHavenTransfer(
    request: PayoutRequest,
    config?: SafeHavenConfig,
): Promise<PayoutResponse> {
    const debitAccountNumber = process.env.SAFEHAVEN_DEBIT_ACCOUNT_NUMBER?.trim();
    if (!debitAccountNumber) throw new Error("SAFEHAVEN_DEBIT_ACCOUNT_NUMBER is not configured");
    const beneficiary = await resolveSafeHavenBankAccount(request.destinationBankCode, request.accountNumber, config);
    const result = await safeHavenRequest<unknown>("transfers", {
        method: "POST",
        body: JSON.stringify({
            nameEnquiryReference: beneficiary.sessionId,
            debitAccountNumber,
            beneficiaryBankCode: beneficiary.bankCode,
            beneficiaryAccountNumber: beneficiary.accountNumber,
            amount: Math.round(request.amount),
            saveBeneficiary: false,
            narration: request.narration,
            paymentReference: request.reference,
        }),
    }, config);
    const data = responseData(result);
    return {
        success: true,
        transferRef: String(data.paymentReference || data.transactionReference || data.reference || request.reference),
        rawResponse: result,
    };
}
