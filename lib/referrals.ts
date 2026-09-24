import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { MINIMUM_REFERRAL_WITHDRAWAL } from "@/lib/referral-constants";

export const REFERRAL_POINTS = {
  buyerProfile: 100,
  buyerActivity: 100,
  buyerFirstOrder: 400,
  sellerRegistration: 100,
  sellerProfile: 200,
  sellerFiveProducts: 200,
  sellerPublished: 100,
  sellerFirstOrder: 400,
  personalProfile: 100,
  personalFiveProducts: 150,
} as const;

export { MINIMUM_REFERRAL_WITHDRAWAL } from "@/lib/referral-constants";

type ProfileRole = "buyer" | "vendor" | "seller" | "guest" | string;

function cleanCode(value: unknown): string {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

function codeCandidate(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "SOWUSER";
  return `${base}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export function profileReferences(uid: string) {
  return [
    adminDb.collection("users").doc(uid),
    adminDb.collection("stores").doc(uid),
    adminDb.collection("vendors").doc(uid),
    adminDb.collection("buyers").doc(uid),
  ];
}

async function getProfile(uid: string) {
  const snapshots = await Promise.all(profileReferences(uid).map((reference) => reference.get()));
  const data = snapshots.find((snapshot) => snapshot.exists)?.data() || {};
  return { data, snapshots };
}

export async function ensureReferralProfile(uid: string, role?: ProfileRole, displayName?: string) {
  const references = profileReferences(uid);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidate = codeCandidate(displayName || uid);
    try {
      return await adminDb.runTransaction(async (transaction) => {
        const snapshots = await Promise.all(references.map((reference) => transaction.get(reference)));
        const existing = snapshots.find((snapshot) => snapshot.exists)?.data() || {};
        const existingCode = cleanCode(existing.referralCode);
        if (existingCode) return existingCode;

        const codeReference = adminDb.collection("referralCodes").doc(candidate);
        const codeSnapshot = await transaction.get(codeReference);
        if (codeSnapshot.exists && codeSnapshot.data()?.uid !== uid) throw new Error("REFERRAL_CODE_COLLISION");

        const now = FieldValue.serverTimestamp();
        transaction.set(codeReference, {
          uid,
          role: role || existing.role || "buyer",
          createdAt: now,
          updatedAt: now,
        }, { merge: true });
        transaction.set(references[0], {
          uid,
          role: role || existing.role || "buyer",
          referralCode: candidate,
          referralWallet: existing.referralWallet || {
            availablePoints: 0,
            pendingPoints: 0,
            lifetimePoints: 0,
            redeemedPoints: 0,
          },
          updatedAt: now,
        }, { merge: true });

        references.slice(1).forEach((reference) => {
          const snapshot = snapshots[references.indexOf(reference)];
          if (snapshot.exists) transaction.set(reference, { referralCode: candidate, updatedAt: now }, { merge: true });
        });
        return candidate;
      });
    } catch (error) {
      if (error instanceof Error && error.message === "REFERRAL_CODE_COLLISION") continue;
      throw error;
    }
  }

  throw new Error("Could not create a referral code");
}

export async function findReferralCode(code: string) {
  const normalized = cleanCode(code);
  if (!normalized) return null;
  const codeSnapshot = await adminDb.collection("referralCodes").doc(normalized).get();
  if (codeSnapshot.exists && codeSnapshot.data()?.uid) return { code: normalized, ...codeSnapshot.data() } as { code: string; uid: string; role?: string };

  // Supports users created before the referral program was introduced. The
  // first authenticated request backfills the lookup document safely.
  const [users, stores, vendors, buyers] = await Promise.all([
    adminDb.collection("users").where("referralCode", "==", normalized).limit(1).get(),
    adminDb.collection("stores").where("referralCode", "==", normalized).limit(1).get(),
    adminDb.collection("vendors").where("referralCode", "==", normalized).limit(1).get(),
    adminDb.collection("buyers").where("referralCode", "==", normalized).limit(1).get(),
  ]);
  const match = [users, stores, vendors, buyers].find((snapshot) => !snapshot.empty)?.docs[0];
  if (!match) return null;
  const data = match.data();
  await adminDb.collection("referralCodes").doc(normalized).set({ uid: match.id, role: data.role || "buyer", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { code: normalized, uid: match.id, role: data.role || "buyer" };
}

export async function getReferralAttribution(uid: string) {
  const { data } = await getProfile(uid);
  if (!data.referredByUid) return null;
  return { uid: String(data.referredByUid), code: cleanCode(data.referredBy), role: String(data.role || "buyer") };
}

export async function awardReferralReward(options: {
  eventId: string;
  referrerId: string;
  referredUserId: string;
  type: string;
  points: number;
  description: string;
  status?: "approved" | "pending";
  metadata?: Record<string, unknown>;
}) {
  const points = Math.max(0, Math.floor(Number(options.points)));
  if (!points) return { awarded: false, reason: "invalid_points" };
  const ledgerReference = adminDb.collection("referralLedger").doc(options.eventId);
  const referrerReference = adminDb.collection("users").doc(options.referrerId);
  const status = options.status || "approved";

  return adminDb.runTransaction(async (transaction) => {
    const [ledgerSnapshot, referrerSnapshot] = await Promise.all([
      transaction.get(ledgerReference),
      transaction.get(referrerReference),
    ]);
    if (ledgerSnapshot.exists) return { awarded: false, reason: "already_awarded" };

    const wallet = referrerSnapshot.data()?.referralWallet || {};
    const currentAvailable = Number(wallet.availablePoints || 0);
    const currentPending = Number(wallet.pendingPoints || 0);
    const currentLifetime = Number(wallet.lifetimePoints || 0);
    const currentRedeemed = Number(wallet.redeemedPoints || 0);
    const availablePoints = status === "approved" ? currentAvailable + points : currentAvailable;
    const pendingPoints = status === "pending" ? currentPending + points : currentPending;
    const typeKey = options.type.includes("buyer")
      ? "referralBuyerCount"
      : options.type.includes("seller")
        ? "referralSellerCount"
        : options.type.includes("order")
          ? "referralOrderCount"
          : null;

    transaction.set(ledgerReference, {
      id: options.eventId,
      referrerId: options.referrerId,
      referredUserId: options.referredUserId,
      type: options.type,
      description: options.description,
      points,
      amountNaira: points,
      status,
      metadata: options.metadata || {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(referrerReference, {
      referralWallet: {
        availablePoints,
        pendingPoints,
        lifetimePoints: currentLifetime + points,
        redeemedPoints: currentRedeemed,
      },
      ...(typeKey ? { [typeKey]: FieldValue.increment(1) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { awarded: true, points, status };
  });
}

export async function awardPersonalReward(uid: string, eventId: string, type: string, points: number, description: string) {
  return awardReferralReward({
    eventId,
    referrerId: uid,
    referredUserId: uid,
    type,
    points,
    description,
  });
}

export async function attributeReferral(options: { uid: string; role: ProfileRole; referralCode?: string; displayName?: string }) {
  const referralCode = cleanCode(options.referralCode);
  const code = await ensureReferralProfile(options.uid, options.role, options.displayName);
  const references = profileReferences(options.uid);
  const source = referralCode ? await findReferralCode(referralCode) : null;
  const existing = await getProfile(options.uid);
  const alreadyAttributed = existing.data.referredByUid;

  if (!alreadyAttributed && source && source.uid !== options.uid) {
    await adminDb.runTransaction(async (transaction) => {
      const snapshots = await Promise.all(references.map((reference) => transaction.get(reference)));
      if (snapshots.some((snapshot) => snapshot.data()?.referredByUid)) return;
      const now = FieldValue.serverTimestamp();
      references.forEach((reference) => transaction.set(reference, {
        referredBy: source.code,
        referredByUid: source.uid,
        referredAt: now,
        referralStatus: "registered",
        updatedAt: now,
      }, { merge: true }));
    });

    if (options.role === "vendor" || options.role === "seller") {
      await awardReferralReward({ eventId: `seller_registration_${options.uid}`, referrerId: source.uid, referredUserId: options.uid, type: "seller_registration", points: REFERRAL_POINTS.sellerRegistration, description: "Seller registered" });
      await awardReferralReward({ eventId: `seller_profile_${options.uid}`, referrerId: source.uid, referredUserId: options.uid, type: "seller_profile", points: REFERRAL_POINTS.sellerProfile, description: "Seller completed store profile" });
    } else {
      await awardReferralReward({ eventId: `buyer_profile_${options.uid}`, referrerId: source.uid, referredUserId: options.uid, type: "buyer_profile", points: REFERRAL_POINTS.buyerProfile, description: "Buyer completed profile" });
    }
  }

  await awardPersonalReward(options.uid, `personal_profile_${options.uid}`, "personal_profile", REFERRAL_POINTS.personalProfile, "Completed your profile");
  return { referralCode: code, referredBy: source?.code || null };
}

export async function recordMeaningfulActivity(uid: string) {
  const source = await getReferralAttribution(uid);
  if (!source || source.role === "vendor" || source.role === "seller") return { awarded: false };
  return awardReferralReward({ eventId: `buyer_activity_${uid}`, referrerId: source.uid, referredUserId: uid, type: "buyer_activity", points: REFERRAL_POINTS.buyerActivity, description: "Buyer completed meaningful marketplace activity" });
}

export async function syncReferralMilestones(uid: string) {
  const { data } = await getProfile(uid);
  const role = String(data.role || "");
  if (role !== "vendor" && role !== "seller") return;
  const [userProducts, storeProducts] = await Promise.all([
    adminDb.collection("products").where("userId", "==", uid).limit(6).get(),
    adminDb.collection("products").where("storeId", "==", uid).limit(6).get(),
  ]);
  const productIds = new Set([...userProducts.docs, ...storeProducts.docs].map((item) => item.id));
  const source = await getReferralAttribution(uid);
  if (productIds.size >= 5) {
    await awardPersonalReward(uid, `personal_products_5_${uid}`, "personal_products_5", REFERRAL_POINTS.personalFiveProducts, "Added your first 5 products");
    if (source) await awardReferralReward({ eventId: `seller_products_5_${uid}`, referrerId: source.uid, referredUserId: uid, type: "seller_products_5", points: REFERRAL_POINTS.sellerFiveProducts, description: "Referred seller added 5 products" });
  }
  const hasPublishedStore = Boolean(data.username && data.storeName && data.isPublished !== false);
  if (hasPublishedStore && source) await awardReferralReward({ eventId: `seller_published_${uid}`, referrerId: source.uid, referredUserId: uid, type: "seller_published", points: REFERRAL_POINTS.sellerPublished, description: "Referred seller published a store" });
}

export async function recordSuccessfulOrder(orderId: string, buyerId?: string, sellerId?: string) {
  const results = [];
  if (buyerId) {
    const source = await getReferralAttribution(buyerId);
    if (source) results.push(await awardReferralReward({ eventId: `buyer_first_order_${buyerId}`, referrerId: source.uid, referredUserId: buyerId, type: "buyer_first_order", points: REFERRAL_POINTS.buyerFirstOrder, description: "Referred buyer completed a successful order", status: "approved", metadata: { orderId } }));
  }
  if (sellerId) {
    const source = await getReferralAttribution(sellerId);
    if (source) results.push(await awardReferralReward({ eventId: `seller_first_order_${sellerId}`, referrerId: source.uid, referredUserId: sellerId, type: "seller_first_order", points: REFERRAL_POINTS.sellerFirstOrder, description: "Referred seller received a successful order", status: "approved", metadata: { orderId } }));
  }
  return results;
}

export async function readReferralWallet(uid: string) {
  const { data } = await getProfile(uid);
  const wallet = data.referralWallet || {};
  return {
    availablePoints: Number(wallet.availablePoints || 0),
    pendingPoints: Number(wallet.pendingPoints || 0),
    lifetimePoints: Number(wallet.lifetimePoints || 0),
    redeemedPoints: Number(wallet.redeemedPoints || 0),
    referralCode: cleanCode(data.referralCode),
    role: String(data.role || "buyer"),
    referredBy: cleanCode(data.referredBy),
    payoutSettings: data.referralPayoutSettings || null,
  };
}
