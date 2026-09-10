// Compatibility wrapper for older imports. New code should import the
// provider from lib/payments/safehaven/virtual-accounts.
import { createSafeHavenVirtualAccount } from "@/lib/payments/safehaven/virtual-accounts";
import type { VirtualAccountResponse } from "@/lib/payments/provider";

export interface CreateVirtualAccountPayload {
    amount: number;
    amountControl: "Fixed" | "UnderPayment" | "OverPayment";
    callbackUrl?: string;
    validFor?: number;
    externalReference: string;
    settlementAccountNumber?: string;
}

export async function createVirtualAccount(payload: CreateVirtualAccountPayload): Promise<VirtualAccountResponse> {
    return createSafeHavenVirtualAccount({
        amount: payload.amount,
        amountControl: payload.amountControl,
        callbackUrl: payload.callbackUrl,
        validForSeconds: payload.validFor,
        externalReference: payload.externalReference,
    });
}
