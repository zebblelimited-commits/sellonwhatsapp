import { Novu } from "@novu/api";

export type NovuPayload = Record<string, unknown> & {
  transactionId?: string;
  eventType?: string;
};

export type WhatsAppNotificationParams = {
  workflowId: string;
  recipientId: string;
  phoneNumber: string | number | null | undefined;
  payload: NovuPayload;
};

const secretKey = process.env.NOVU_SECRET_KEY?.trim();
const novu = secretKey ? new Novu({ secretKey }) : null;

/**
 * Normalise Nigerian and international numbers to E.164.
 * Examples: 08012345678 -> +2348012345678, 2348012345678 -> +2348012345678.
 */
export function normalizePhoneNumber(value: unknown, defaultCountryCode = "234"): string | null {
  if (value === null || value === undefined) return null;

  let raw = String(value).trim().replace(/[\s().-]/g, "");
  if (!raw) return null;

  if (raw.startsWith("00")) raw = `+${raw.slice(2)}`;
  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    return /^\+[1-9]\d{7,14}$/.test(`+${digits}`) ? `+${digits}` : null;
  }

  const digits = raw.replace(/\D/g, "");
  const international = digits.startsWith(defaultCountryCode)
    ? digits
    : digits.startsWith("0")
      ? `${defaultCountryCode}${digits.slice(1)}`
      : `${defaultCountryCode}${digits}`;

  const formatted = `+${international}`;
  return /^\+[1-9]\d{7,14}$/.test(formatted) ? formatted : null;
}

/**
 * Map an application event to a Novu workflow identifier. A single legacy
 * NOVU_WORKFLOW_ID remains supported as a fallback while event workflows are
 * being created in Novu.
 */
export function getNovuWorkflowId(eventType: string): string {
  const envKeyByEvent: Record<string, string> = {
    "order-placed": "NOVU_WORKFLOW_ORDER_PLACED",
    "new-order-received": "NOVU_WORKFLOW_NEW_ORDER_RECEIVED",
    "order-shipped": "NOVU_WORKFLOW_ORDER_SHIPPED",
    "order-out-for-delivery": "NOVU_WORKFLOW_ORDER_OUT_FOR_DELIVERY",
    "order-delivered": "NOVU_WORKFLOW_ORDER_DELIVERED",
    "order-cancelled": "NOVU_WORKFLOW_ORDER_CANCELLED",
    "order-refunded": "NOVU_WORKFLOW_ORDER_REFUNDED",
    "new-store-follower": "NOVU_WORKFLOW_NEW_STORE_FOLLOWER",
    "order-pickup-scheduled": "NOVU_WORKFLOW_ORDER_PICKUP_SCHEDULED",
    "funds-released": "NOVU_WORKFLOW_FUNDS_RELEASED",
    "payout-completed": "NOVU_WORKFLOW_PAYOUT_COMPLETED",
    "welcome-registered": "NOVU_WORKFLOW_WELCOME_REGISTERED",
  };

  return (
    (envKeyByEvent[eventType] ? process.env[envKeyByEvent[eventType]] : "")?.trim() ||
    process.env.NOVU_WORKFLOW_ID?.trim() ||
    ""
  );
}

/**
 * Trigger a Novu workflow using its WhatsApp step. This helper intentionally
 * resolves failures to false: notifications are a side effect and must never
 * roll back or break a checkout, webhook, or wallet transaction.
 */
export async function sendWhatsAppNotification({
  workflowId,
  recipientId,
  phoneNumber,
  payload,
}: WhatsAppNotificationParams): Promise<boolean> {
  const eventType = String(payload.eventType || workflowId || "notification");
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  if (!secretKey || !novu) {
    console.warn(`[NOVU WHATSAPP] Skipped '${eventType}': NOVU_SECRET_KEY is not configured.`);
    return false;
  }
  if (!workflowId?.trim()) {
    console.warn(`[NOVU WHATSAPP] Skipped '${eventType}': no workflow ID is configured.`);
    return false;
  }
  if (!recipientId?.trim()) {
    console.warn(`[NOVU WHATSAPP] Skipped '${eventType}': recipient ID is missing.`);
    return false;
  }
  if (!normalizedPhone) {
    console.warn(`[NOVU WHATSAPP] Skipped '${eventType}': invalid phone number.`);
    return false;
  }

  try {
    const { transactionId, ...workflowPayload } = payload;
    await novu.trigger({
      workflowId: workflowId.trim(),
      to: {
        subscriberId: recipientId.trim(),
        phone: normalizedPhone,
      },
      payload: workflowPayload,
      ...(transactionId ? { transactionId } : {}),
    });
    console.log(`[NOVU WHATSAPP] Sent '${eventType}' to ${normalizedPhone}`);
    return true;
  } catch (error) {
    console.error(`[NOVU WHATSAPP] Failed '${eventType}' to ${normalizedPhone}:`, error);
    return false;
  }
}
