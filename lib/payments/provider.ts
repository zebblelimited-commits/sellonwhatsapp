export interface VirtualAccountRequest {
    externalReference: string;
    amount: number;
    validForSeconds?: number;
    customerPhone?: string;
    customerEmail?: string;
    customerName?: string;
    callbackUrl?: string;
    amountControl?: "Fixed" | "UnderPayment" | "OverPayment";
}

export interface VirtualAccountResponse {
    virtualAccountId: string;
    accountNumber: string;
    accountName: string;
    bankCode: string;
    bankName: string;
    accountReference: string;
    expiryDate?: Date;
}

export interface PayoutRequest {
    destinationBankCode: string;
    accountNumber: string;
    accountName?: string;
    amount: number;
    narration: string;
    reference: string;
}

export interface PayoutResponse {
    success: boolean;
    transferRef: string;
    providerStatus?: string;
    rawResponse?: unknown;
}

export interface PaymentProvider {
    createVirtualAccount(payload: VirtualAccountRequest): Promise<VirtualAccountResponse>;
    verifyTransaction(reference: string): Promise<boolean>;
    initiatePayout(payload: PayoutRequest): Promise<PayoutResponse>;
    processRefund(reference: string, amount: number): Promise<{ success: boolean; refundRef: string }>;
}

export type CreateVirtualAccountPayload = VirtualAccountRequest;
export type VirtualAccountResult = VirtualAccountResponse;
export type TransferPayload = PayoutRequest & { destinationAccountNumber?: string };
export type TransferResult = PayoutResponse & { transactionReference: string };
