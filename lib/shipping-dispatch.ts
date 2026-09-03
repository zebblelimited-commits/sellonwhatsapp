import admin from "firebase-admin";
import { adminDb } from "@/lib/firebase-admin";
import { createFezOrders } from "@/lib/fez";

type DispatchResult = {
  shipmentId: string;
  orderId: string;
  status: string;
  dispatchStatus: string;
  providerReference?: string;
  trackingId?: string;
  reason?: string;
};

const asText = (value: unknown, fallback = "") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const addressText = (address: any) => {
  if (!address) return "Address not provided";
  if (typeof address === "string") return address;
  return [address.address, address.street, address.city, address.lga, address.state, address.postalCode]
    .filter(Boolean)
    .join(", ") || "Address not provided";
};

const stateText = (address: any) => asText(typeof address === "object" ? address?.state : "", "Plateau");

const normalisePhone = (value: unknown) => {
  const phone = asText(value).replace(/[^\d+]/g, "");
  if (phone.startsWith("0")) return `+234${phone.slice(1)}`;
  return phone;
};

const isPaid = (order: any) => {
  const status = asText(order?.status).toUpperCase();
  const fundsState = asText(order?.fundsState).toLowerCase();
  return ["PAID_HELD", "SHIPPED", "OUT_FOR_DELIVERY", "COMPLETED"].includes(status) || fundsState === "held";
};

function providerCode(shipment: any, courier: any) {
  return asText(courier?.code || shipment?.courierCode || shipment?.courierId).toLowerCase();
}

/**
 * Dispatches a paid shipment to the configured aggregator. FEZ is currently
 * the only provider with an order-creation adapter. Self-arranged delivery is
 * deliberately recorded locally and never sent to an external courier.
 */
export async function dispatchShipmentForOrder(orderId: string): Promise<DispatchResult> {
  const orderRef = adminDb.collection("orders").doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new Error(`Order ${orderId} not found`);

  const order = orderSnap.data() || {};
  const shipmentSnap = await adminDb.collection("shipments").where("orderId", "==", orderId).limit(1).get();
  if (shipmentSnap.empty) {
    return {
      shipmentId: "",
      orderId,
      status: asText(order.deliveryStatus || order.status, "PENDING_PAYMENT"),
      dispatchStatus: "NOT_REQUIRED",
      reason: "No physical shipment record exists for this order",
    };
  }

  const shipmentRef = shipmentSnap.docs[0].ref;
  const claim = await adminDb.runTransaction(async (transaction) => {
    const currentSnap = await transaction.get(shipmentRef);
    if (!currentSnap.exists) throw new Error("Shipment no longer exists");
    const current = currentSnap.data() || {};
    const currentDispatchStatus = asText(current.dispatchStatus).toUpperCase();
    if (["DISPATCHED", "IN_PROGRESS", "NOT_REQUIRED"].includes(currentDispatchStatus) || current.providerReference || current.trackingId) {
      return { claimed: false, shipment: current };
    }
    if (currentDispatchStatus === "DISPATCHING") {
      return { claimed: false, shipment: current };
    }

    transaction.update(shipmentRef, {
      dispatchStatus: "DISPATCHING",
      dispatchAttempts: admin.firestore.FieldValue.increment(1),
      dispatchStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { claimed: true, shipment: current };
  });

  const shipment = claim.shipment;
  const shipmentId = asText(shipment.shipmentId, shipmentRef.id);
  if (!claim.claimed) {
    return {
      shipmentId,
      orderId,
      status: asText(shipment.status, "PENDING_PICKUP"),
      dispatchStatus: asText(shipment.dispatchStatus, "DISPATCHED"),
      providerReference: shipment.providerReference,
      trackingId: shipment.trackingId,
      reason: "Dispatch already claimed or completed",
    };
  }

  if (!isPaid(order)) {
    await shipmentRef.update({
      dispatchStatus: "WAITING_FOR_PAYMENT",
      status: "PENDING_PICKUP",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { shipmentId, orderId, status: "PENDING_PICKUP", dispatchStatus: "WAITING_FOR_PAYMENT" };
  }

  const courierSnap = await adminDb.collection("couriers").doc(asText(shipment.courierId)).get();
  const courier = courierSnap.exists ? courierSnap.data() || {} : {};
  const code = providerCode(shipment, courier);

  if (code === "self_arranged" || asText(shipment.deliveryMode).toLowerCase() === "self_arranged") {
    await Promise.all([
      shipmentRef.update({
        status: "SELF_ARRANGED",
        dispatchStatus: "NOT_REQUIRED",
        provider: "self_arranged",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
      orderRef.update({
        deliveryStatus: "SELF_ARRANGED",
        courierStatus: "SELF_ARRANGED",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    ]);
    return { shipmentId, orderId, status: "SELF_ARRANGED", dispatchStatus: "NOT_REQUIRED" };
  }

  if (code !== "fez") {
    const reason = `Automated dispatch is not configured for ${asText(shipment.courierName, code || "this courier")}. Choose FEZ Delivery or Self-Arranged.`;
    await shipmentRef.update({
      status: "PENDING_PICKUP",
      dispatchStatus: "PROVIDER_INTEGRATION_REQUIRED",
      dispatchError: reason,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { shipmentId, orderId, status: "PENDING_PICKUP", dispatchStatus: "PROVIDER_INTEGRATION_REQUIRED", reason };
  }

  try {
    const deliveryAddress = order.deliveryAddress || shipment.deliveryAddress;
    const pickupAddress = shipment.pickupAddress || "Store Address";
    const items = Array.isArray(order.items) ? order.items : [];
    const weight = Math.max(1, items.reduce((total: number, item: any) => total + (Number(item.weight) || 1) * (Number(item.quantity) || 1), 0));
    const itemDescription = items.map((item: any) => `${asText(item.name, "Item")} x${Number(item.quantity) || 1}`).join(", ").slice(0, 500);
    const response = await createFezOrders([{
      recipientAddress: addressText(deliveryAddress),
      recipientState: stateText(deliveryAddress),
      recipientName: asText(order.customerName, "Customer"),
      recipientPhone: normalisePhone(order.customerPhone || deliveryAddress?.phone),
      recipientEmail: asText(order.customerEmail) || undefined,
      uniqueID: shipmentId,
      BatchID: asText(order.checkoutReference, orderId),
      valueOfItem: Number(order.productSubtotal ?? order.total ?? 0),
      weight,
      itemDescription,
      additionalDetails: `SellOnWhatsApp order ${orderId}`,
      pickUpState: asText(shipment.pickupState, stateText(shipment.pickupAddress)),
      pickUpAddress: addressText(pickupAddress),
      thirdparty: "true",
      senderName: asText(order.storeName, "SellOnWhatsApp seller"),
      senderAddress: addressText(pickupAddress),
      senderPhone: normalisePhone(shipment.pickupPhone || shipment.storePhone),
    }]);
    const providerReference = response.orderNos?.[shipmentId] || Object.values(response.orderNos || {})[0];
    if (!providerReference) throw new Error(response.description || "FEZ did not return an order number");

    await Promise.all([
      shipmentRef.update({
        status: "AWAITING_PICKUP",
        dispatchStatus: "DISPATCHED",
        provider: "fez",
        providerReference,
        courierOrderId: providerReference,
        trackingId: providerReference,
        dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        dispatchError: admin.firestore.FieldValue.delete(),
      }),
      orderRef.update({
        deliveryStatus: "AWAITING_PICKUP",
        courierStatus: "DISPATCHED",
        providerReference,
        trackingId: providerReference,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    ]);
    console.log(`[SHIPPING] FEZ shipment ${shipmentId} dispatched as ${providerReference}`);
    return { shipmentId, orderId, status: "AWAITING_PICKUP", dispatchStatus: "DISPATCHED", providerReference, trackingId: providerReference };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Courier dispatch failed";
    await shipmentRef.update({
      status: "PENDING_PICKUP",
      dispatchStatus: "FAILED",
      dispatchError: reason.slice(0, 500),
      lastDispatchAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.error(`[SHIPPING] FEZ dispatch failed for ${shipmentId}:`, reason);
    return { shipmentId, orderId, status: "PENDING_PICKUP", dispatchStatus: "FAILED", reason };
  }
}
