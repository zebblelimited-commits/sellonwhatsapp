import { adminDb } from "@/lib/firebase-admin";
import { getNovuWorkflowId, sendWhatsAppNotification } from "@/lib/novu";

type Data = Record<string, unknown>;

function firstString(...values: unknown[]): string {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() || "";
}

function numberText(value: unknown): string {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toLocaleString("en-NG") : "0";
}

function addressText(address: unknown): string {
  if (typeof address === "string") return address;
  if (!address || typeof address !== "object") return "the delivery address";
  const data = address as Data;
  return [data.address, data.city, data.lga, data.state, data.postalCode].filter(Boolean).join(", ") || "the delivery address";
}

async function storeForOrder(order: Data, store?: Data): Promise<Data> {
  if (store) return store;
  const storeId = firstString(order.storeId, order.vendorId);
  if (!storeId) return {};
  const snapshot = await adminDb.collection("stores").doc(storeId).get();
  return snapshot.exists ? snapshot.data() || {} : {};
}

function buyerPhone(order: Data): string {
  const address = order.deliveryAddress && typeof order.deliveryAddress === "object"
    ? order.deliveryAddress as Record<string, unknown>
    : {};
  return firstString(order.customerPhone, order.buyerPhone, order.phone, address.phone, address.phoneNumber);
}

function sellerPhone(store: Data): string {
  return firstString(store.whatsappNumber, store.whatsappPhone, store.phone, store.phoneNumber, store.contactPhone);
}

function baseOrderPayload(order: Data, store: Data, eventType: string, transactionId: string): Data {
  const orderId = firstString(order.orderId, order.id) || "order";
  return {
    eventType,
    transactionId,
    orderId,
    storeName: firstString(order.storeName, store.storeName, store.name) || "the store",
    buyerName: firstString(order.customerName, order.buyerName) || "Buyer",
    sellerName: firstString(store.storeName, store.ownerName, store.name) || "Seller",
    amount: numberText(order.totalAmount ?? order.total ?? order.escrowAmount),
    currency: "NGN",
    courierName: firstString(order.courierName, order.shippingMethod) || "Courier",
    trackingId: firstString(order.trackingId),
    pickupAddress: addressText(order.pickupAddress || store.address),
    deliveryAddress: addressText(order.deliveryAddress),
    trackingUrl: firstString(order.trackingUrl),
  };
}

async function dispatch(eventType: string, recipientId: string, phoneNumber: string, payload: Data) {
  if (!recipientId || !phoneNumber) return false;
  return sendWhatsAppNotification({
    workflowId: getNovuWorkflowId(eventType),
    recipientId,
    phoneNumber,
    payload,
  });
}

export async function notifyOrderPaymentConfirmed(order: Data, store?: Data): Promise<void> {
  try {
    const storeData = await storeForOrder(order, store);
    const orderId = firstString(order.orderId, order.id);
    const payload = baseOrderPayload(order, storeData, "order-placed", `order-paid-${orderId}`);
    const tasks: Promise<boolean>[] = [];

    tasks.push(dispatch("order-placed", firstString(order.buyerId), buyerPhone(order), payload));
    tasks.push(dispatch("new-order-received", firstString(order.storeId, order.vendorId), sellerPhone(storeData), { ...payload, eventType: "new-order-received", transactionId: `new-order-${orderId}` }));

    const hasCourier = firstString(order.courierId, order.shippingMethod) && firstString(order.shippingMethod) !== "self_arranged" && Number(order.shippingCost || 0) > 0;
    if (hasCourier) {
      tasks.push(dispatch("order-pickup-scheduled", firstString(order.storeId, order.vendorId), sellerPhone(storeData), { ...payload, eventType: "order-pickup-scheduled", transactionId: `pickup-scheduled-${orderId}` }));
    }
    await Promise.allSettled(tasks);
  } catch (error) {
    console.error("[NOVU WHATSAPP] Payment-confirmed notification fan-out failed:", error);
  }
}

export async function notifyOrderStatus(order: Data, eventType: "order-shipped" | "order-out-for-delivery" | "order-delivered" | "order-cancelled" | "order-refunded", store?: Data): Promise<void> {
  try {
    const storeData = await storeForOrder(order, store);
    const orderId = firstString(order.orderId, order.id);
    const payload = baseOrderPayload(order, storeData, eventType, `${eventType}-${orderId}`);
    const tasks: Promise<boolean>[] = [];
    tasks.push(dispatch(eventType, firstString(order.buyerId), buyerPhone(order), payload));
    await Promise.allSettled(tasks);
  } catch (error) {
    console.error(`[NOVU WHATSAPP] ${eventType} notification failed:`, error);
  }
}

export async function notifyFundsReleased(order: Data, store?: Data): Promise<void> {
  try {
    const storeData = await storeForOrder(order, store);
    const orderId = firstString(order.orderId, order.id);
    const payload = { ...baseOrderPayload(order, storeData, "funds-released", `funds-released-${orderId}`), amount: numberText(order.settlementAmount ?? order.escrowReservedAmount ?? order.totalAmount ?? order.total), availableBalance: numberText(storeData.availableBalance) };
    await dispatch("funds-released", firstString(order.storeId, order.vendorId), sellerPhone(storeData), payload);
  } catch (error) {
    console.error("[NOVU WHATSAPP] Funds-released notification failed:", error);
  }
}

export async function notifyPayoutCompleted(payout: Data, store?: Data): Promise<void> {
  try {
    const storeId = firstString(payout.storeId, payout.vendorId);
    const storeData = store || (storeId ? await storeForOrder({ storeId }) : {});
    const payoutId = firstString(payout.id, payout.reference, payout.nombaReference);
    await dispatch("payout-completed", storeId, sellerPhone(storeData), {
      eventType: "payout-completed",
      transactionId: `payout-completed-${payoutId}`,
      payoutId,
      amount: numberText(payout.netAmount ?? payout.amount ?? payout.grossAmount),
      currency: "NGN",
      sellerName: firstString(storeData.storeName, storeData.ownerName, storeData.name) || "Seller",
    });
  } catch (error) {
    console.error("[NOVU WHATSAPP] Payout-completed notification failed:", error);
  }
}

export async function notifyNewFollower(storeId: string, follower: Data, store?: Data): Promise<void> {
  try {
    const storeData = store || await storeForOrder({ storeId });
    const followerId = firstString(follower.followerId, follower.buyerId, follower.id);
    await dispatch("new-store-follower", storeId, sellerPhone(storeData), {
      eventType: "new-store-follower",
      transactionId: `store-follower-${followerId}-${storeId}`,
      sellerName: firstString(storeData.storeName, storeData.ownerName, storeData.name) || "Seller",
      followerName: firstString(follower.displayName, follower.firstName && `${follower.firstName} ${follower.lastName || ""}`, follower.name) || "A buyer",
      storeName: firstString(storeData.storeName, storeData.name) || "your store",
    });
  } catch (error) {
    console.error("[NOVU WHATSAPP] New-follower notification failed:", error);
  }
}

export async function notifyUserRegistered(user: Data): Promise<void> {
  try {
    const userId = firstString(user.uid, user.id);
    const phoneNumber = firstString(user.phoneNumber, user.phone, user.whatsappNumber);
    if (!userId || !phoneNumber) {
      console.warn("[NOVU WHATSAPP] Skipped 'welcome-registered': user ID or phone number is missing.");
      return;
    }

    await dispatch("welcome-registered", userId, phoneNumber, {
      eventType: "welcome-registered",
      transactionId: `welcome-registered-${userId}`,
      recipientId: userId,
      role: firstString(user.role) || "buyer",
      firstName: firstString(user.firstName, user.displayName, user.name) || "there",
      lastName: firstString(user.lastName),
      email: firstString(user.email),
      appUrl: firstString(process.env.NEXT_PUBLIC_APP_URL) || "https://sellonwhatsapp.com",
    });
  } catch (error) {
    console.error("[NOVU WHATSAPP] Welcome notification failed:", error);
  }
}
