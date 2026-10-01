import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

type RecordValue = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function timestampMillis(value: unknown) {
  if (value && typeof value === "object") {
    const candidate = value as { toMillis?: () => number; toDate?: () => Date };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
    if (typeof candidate.toDate === "function") return candidate.toDate().getTime();
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isFuture(value: unknown, now = Date.now()) {
  const millis = timestampMillis(value);
  return millis <= 0 || millis > now;
}

function adminSponsored(data: RecordValue) {
  return data.adminSponsored === true || (
    data.isSponsored === true &&
    ["admin", "admin_and_store_boost"].includes(text(data.sponsorshipSource || data.source).toLowerCase())
  );
}

function effectiveSource(admin: boolean, boost: boolean) {
  if (admin && boost) return "admin_and_store_boost";
  if (admin) return "admin";
  if (boost) return "store_boost";
  return "none";
}

/**
 * Synchronizes the public sponsorship state after a Store Boost changes.
 * Manual admin sponsorship is preserved when the Boost expires.
 */
export async function syncStoreBoostSponsorship(
  storeId: string,
  active: boolean,
  expiryDate?: Date,
  excludedBoostId?: string,
) {
  const normalizedStoreId = storeId.trim();
  if (!normalizedStoreId) return { storeUpdated: false, productsUpdated: 0 };

  let shouldBeActive = active;
  let effectiveExpiry = expiryDate;

  if (!active) {
    const activeBoosts = await adminDb
      .collection("boosts")
      .where("storeId", "==", normalizedStoreId)
      .get();
    const remaining = activeBoosts.docs
      .filter((item) => item.id !== excludedBoostId)
      .map((item) => item.data() as RecordValue)
      .filter((data) => text(data.status).toLowerCase() === "active" && isFuture(data.expiryDate))
      .sort((left, right) => timestampMillis(right.expiryDate) - timestampMillis(left.expiryDate));
    if (remaining.length > 0) {
      shouldBeActive = true;
      const remainingExpiry = timestampMillis(remaining[0].expiryDate);
      effectiveExpiry = remainingExpiry > 0 ? new Date(remainingExpiry) : undefined;
    }
  }

  const storeRef = adminDb.collection("stores").doc(normalizedStoreId);
  const storeSnapshot = await storeRef.get();
  if (!storeSnapshot.exists) return { storeUpdated: false, productsUpdated: 0 };

  const storeData = (storeSnapshot.data() || {}) as RecordValue;
  const hasAdminSponsorship = adminSponsored(storeData);
  const sponsored = hasAdminSponsorship || shouldBeActive;
  const source = effectiveSource(hasAdminSponsorship, shouldBeActive);
  const now = FieldValue.serverTimestamp();
  const storeFields: Record<string, unknown> = {
    boostSponsored: shouldBeActive,
    isSponsored: sponsored,
    sponsored: sponsored,
    sponsorshipStatus: sponsored ? "active" : "inactive",
    sponsorshipSource: source,
    source,
    updatedAt: now,
  };

  if (shouldBeActive) {
    storeFields.boostSponsoredAt = now;
    storeFields.boostSponsoredUntil = effectiveExpiry ? Timestamp.fromDate(effectiveExpiry) : FieldValue.delete();
    storeFields.sponsoredAt = now;
    storeFields.sponsoredUntil = hasAdminSponsorship || !effectiveExpiry ? FieldValue.delete() : Timestamp.fromDate(effectiveExpiry);
  } else {
    storeFields.boostSponsoredAt = FieldValue.delete();
    storeFields.boostSponsoredUntil = FieldValue.delete();
    if (!hasAdminSponsorship) {
      storeFields.sponsoredAt = FieldValue.delete();
      storeFields.sponsoredUntil = FieldValue.delete();
    }
  }
  await storeRef.set(storeFields, { merge: true });

  const productSnapshots = await Promise.all(
    ["storeId", "vendorId", "ownerId"].map((field) =>
      adminDb.collection("products").where(field, "==", normalizedStoreId).get(),
    ),
  );
  const products = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  productSnapshots.forEach((snapshot) => snapshot.docs.forEach((item) => products.set(item.id, item)));

  const productEntries = [...products.values()];
  for (let index = 0; index < productEntries.length; index += 450) {
    const batch = adminDb.batch();
    productEntries.slice(index, index + 450).forEach((product) => {
      const data = product.data() as RecordValue;
      const hasAdminProductSponsorship = adminSponsored(data);
      const productSponsored = hasAdminProductSponsorship || shouldBeActive;
      const productSource = effectiveSource(hasAdminProductSponsorship, shouldBeActive);
      const fields: Record<string, unknown> = {
        boostSponsored: shouldBeActive,
        isSponsored: productSponsored,
        sponsored: productSponsored,
        sponsorshipStatus: productSponsored ? "active" : "inactive",
        sponsorshipSource: productSource,
        source: productSource,
        updatedAt: now,
      };
      if (shouldBeActive) {
        fields.boostSponsoredAt = now;
        fields.boostSponsoredUntil = effectiveExpiry ? Timestamp.fromDate(effectiveExpiry) : FieldValue.delete();
        fields.sponsoredAt = now;
        fields.sponsoredUntil = hasAdminProductSponsorship || !effectiveExpiry ? FieldValue.delete() : Timestamp.fromDate(effectiveExpiry);
      } else {
        fields.boostSponsoredAt = FieldValue.delete();
        fields.boostSponsoredUntil = FieldValue.delete();
        if (!hasAdminProductSponsorship) {
          fields.sponsoredAt = FieldValue.delete();
          fields.sponsoredUntil = FieldValue.delete();
        }
      }
      batch.set(product.ref, fields, { merge: true });
    });
    await batch.commit();
  }

  return { storeUpdated: true, productsUpdated: productEntries.length };
}

export function sponsorshipIsActive(data: RecordValue, now = Date.now()) {
  if (data.isSponsored !== true && data.sponsored !== true) return false;
  const status = text(data.sponsorshipStatus).toLowerCase();
  if (["inactive", "expired", "cancelled", "canceled", "ended", "rejected"].includes(status)) return false;
  return isFuture(data.sponsoredUntil, now);
}
