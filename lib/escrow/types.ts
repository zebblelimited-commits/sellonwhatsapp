export const ESCROW_COLLECTION = "escrow_transactions";
export const ESCROW_WEBHOOK_EVENTS_COLLECTION = "escrow_webhook_events";

export type EscrowStatus =
    | "PENDING_PAYMENT"
    | "FUNDED"
    | "DISPUTED"
    | "SETTLEMENT_PENDING"
    | "RELEASED"
    | "REFUND_PENDING"
    | "REFUNDED"
    | "EXPIRED";

export interface EscrowRecord {
    externalReference: string;
    amount: number;
    orderIds: string[];
    buyerId?: string;
    status: EscrowStatus;
    virtualAccountId?: string | null;
    virtualAccountNumber?: string | null;
    virtualAccountBankCode?: string | null;
    virtualAccountBankName?: string | null;
    expiryDate?: Date | null;
    providerReference?: string | null;
    providerSessionId?: string | null;
    fundedAmount?: number | null;
}
