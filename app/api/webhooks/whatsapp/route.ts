import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

const EVENTS_COLLECTION = "whatsapp_webhook_events";
const MESSAGES_COLLECTION = "whatsapp_messages";
const STATUSES_COLLECTION = "whatsapp_message_statuses";

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function timingSafeEqual(left: string, right: string): boolean {
  const received = Buffer.from(left, "utf8");
  const expected = Buffer.from(right, "utf8");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function hasValidSignature(rawBody: string, request: Request): boolean {
  const appSecret = (
    process.env.META_WHATSAPP_APP_SECRET || process.env.APP_SECRET
  )?.trim();
  const signature = request.headers.get("x-hub-signature-256")?.trim();

  // Meta signs every production delivery. Fail closed whenever the app secret
  // is configured, and never accept unsigned requests in production.
  if (!appSecret) return process.env.NODE_ENV !== "production";
  if (!signature) return false;

  const supplied = signature.replace(/^sha256=/i, "");
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return timingSafeEqual(supplied, expected);
}

function getVerificationToken(): string {
  return process.env.META_WHATSAPP_VERIFY_TOKEN?.trim() || "";
}

function getChangeRecords(payload: JsonRecord): Array<{
  entryId: string;
  field: string;
  value: JsonRecord;
}> {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  return entries.flatMap((entryValue) => {
    const entry = record(entryValue);
    const entryId = stringValue(entry.id);
    const changes = Array.isArray(entry.changes) ? entry.changes : [];

    return changes.map((changeValue) => {
      const change = record(changeValue);
      return {
        entryId,
        field: stringValue(change.field),
        value: record(change.value),
      };
    });
  });
}

function normalizeMessage(
  message: JsonRecord,
  change: { entryId: string; field: string; value: JsonRecord },
  receivedAt: string,
): JsonRecord {
  const metadata = record(change.value.metadata);
  const contacts = Array.isArray(change.value.contacts) ? change.value.contacts : [];
  const from = stringValue(message.from);
  const contact = contacts
    .map(record)
    .find((candidate) => stringValue(candidate.wa_id) === from) || record(contacts[0]);

  return {
    provider: "meta",
    entryId: change.entryId,
    field: change.field || "messages",
    messageId: stringValue(message.id),
    from,
    messageType: stringValue(message.type),
    timestamp: stringValue(message.timestamp),
    phoneNumberId: stringValue(metadata.phone_number_id),
    displayPhoneNumber: stringValue(metadata.display_phone_number),
    contact,
    message,
    receivedAt,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function normalizeStatus(
  status: JsonRecord,
  change: { entryId: string; field: string; value: JsonRecord },
  receivedAt: string,
): JsonRecord {
  const metadata = record(change.value.metadata);

  return {
    provider: "meta",
    entryId: change.entryId,
    field: change.field || "messages",
    messageId: stringValue(status.id),
    status: stringValue(status.status),
    recipientId: stringValue(status.recipient_id),
    timestamp: stringValue(status.timestamp),
    conversation: record(status.conversation),
    pricing: record(status.pricing),
    errors: Array.isArray(status.errors) ? status.errors : [],
    phoneNumberId: stringValue(metadata.phone_number_id),
    displayPhoneNumber: stringValue(metadata.display_phone_number),
    statusUpdate: status,
    receivedAt,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedToken = getVerificationToken();

  if (mode === "subscribe" && expectedToken && verifyToken === expectedToken && challenge) {
    // Meta expects the challenge as plain text, not JSON.
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }

  return NextResponse.json({ verified: false }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!hasValidSignature(rawBody, request)) {
    return NextResponse.json({ received: false, error: "Invalid webhook signature" }, { status: 401 });
  }

  let payload: JsonRecord;
  try {
    payload = record(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ received: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (stringValue(payload.object) !== "whatsapp_business_account") {
    return NextResponse.json({ received: true, ignored: true });
  }

  const eventId = hash(rawBody);
  const eventRef = adminDb.collection(EVENTS_COLLECTION).doc(eventId);
  const changes = getChangeRecords(payload);
  const receivedAt = new Date().toISOString();
  const messageWrites: Array<{ ref: FirebaseFirestore.DocumentReference; data: JsonRecord }> = [];
  const statusWrites: Array<{ ref: FirebaseFirestore.DocumentReference; data: JsonRecord }> = [];

  for (const change of changes) {
    const messages = Array.isArray(change.value.messages) ? change.value.messages : [];
    for (const messageValue of messages) {
      const message = record(messageValue);
      const messageId = stringValue(message.id);
      const metadata = record(change.value.metadata);
      const stableId = messageId
        ? `${stringValue(metadata.phone_number_id)}:${messageId}`
        : `${eventId}:message:${messageWrites.length}`;
      messageWrites.push({
        ref: adminDb.collection(MESSAGES_COLLECTION).doc(hash(stableId)),
        data: normalizeMessage(message, change, receivedAt),
      });
    }

    const statuses = Array.isArray(change.value.statuses) ? change.value.statuses : [];
    for (const statusValue of statuses) {
      const status = record(statusValue);
      const metadata = record(change.value.metadata);
      const stableId = `${stringValue(metadata.phone_number_id)}:${stringValue(status.id)}:${stringValue(status.status)}:${stringValue(status.timestamp)}`;
      statusWrites.push({
        ref: adminDb.collection(STATUSES_COLLECTION).doc(hash(stableId)),
        data: normalizeStatus(status, change, receivedAt),
      });
    }
  }

  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      const existingEvent = await transaction.get(eventRef);
      if (existingEvent.exists) return { duplicate: true };

      transaction.create(eventRef, {
        provider: "meta",
        object: stringValue(payload.object),
        eventId,
        changeCount: changes.length,
        messageCount: messageWrites.length,
        statusCount: statusWrites.length,
        payload,
        receivedAt,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      for (const write of messageWrites) transaction.set(write.ref, write.data, { merge: true });
      for (const write of statusWrites) transaction.set(write.ref, write.data, { merge: true });

      return { duplicate: false };
    });

    return NextResponse.json({
      received: true,
      duplicate: result.duplicate,
      messages: messageWrites.length,
      statuses: statusWrites.length,
    });
  } catch (error) {
    console.error("[WHATSAPP WEBHOOK] Failed to persist Meta event:", error);
    // A non-2xx response tells Meta to retry delivery instead of silently
    // dropping a message or status update.
    return NextResponse.json({ received: false, retryable: true }, { status: 500 });
  }
}
