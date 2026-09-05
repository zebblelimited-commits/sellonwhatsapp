import admin from "firebase-admin";
import { adminDb } from "@/lib/firebase-admin";
import { createFezOrders } from "@/lib/fez";
import { createChowdeckDelivery } from "@/lib/chowdeck";
import { createSendboxShipment, type SendboxAddress } from "@/lib/sendbox";
import { createTopshipShipment, payTopshipShipment, type TopshipAddress, type TopshipQuote } from "@/lib/topship";

type DispatchResult = {
  shipmentId: string;
  orderId: string;
  status: string;
  dispatchStatus: string;
  providerReference?: string;
  trackingId?: string;
  trackingUrl?: string;
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
 * Dispatches a paid shipment to the configured aggregator. FEZ, Chowdeck, and
 * Topship have order-creation adapters; self-arranged delivery is deliberately
 * recorded locally and never sent to an external courier.
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

  if (code === "chowdeck") {
    try {
      if (shipment.providerQuoteId === undefined || shipment.providerQuoteId === null || shipment.providerQuoteId === "") {
        throw new Error("Chowdeck fee quote is missing or expired");
      }
      const deliveryAddress = order.deliveryAddress || shipment.deliveryAddress;
      const items = Array.isArray(order.items) ? order.items : [];
      const delivery = await createChowdeckDelivery({
        feeId: shipment.providerQuoteId,
        reference: shipmentId,
        itemType: asText(items[0]?.category || items[0]?.productType, "parcel"),
        sourceContact: {
          name: asText(order.storeName, "SellOnWhatsApp seller"),
          phone: normalisePhone(shipment.pickupPhone || shipment.storePhone),
        },
        destinationContact: {
          name: asText(order.customerName, "Customer"),
          phone: normalisePhone(order.customerPhone || deliveryAddress?.phone),
          email: asText(order.customerEmail) || undefined,
        },
        estimatedOrderAmountNaira: Number(order.productSubtotal ?? order.total ?? 0),
        customerDeliveryNote: asText(deliveryAddress?.deliveryNote, "Handle with care"),
        vendorNote: `SellOnWhatsApp order ${orderId}`,
      });
      const providerReference = asText(delivery.reference, String(delivery.id || ""));
      if (!providerReference) throw new Error("Chowdeck did not return a delivery reference");

      await Promise.all([
        shipmentRef.update({
          status: "PREPARING",
          dispatchStatus: "DISPATCHED",
          provider: "chowdeck",
          providerReference,
          courierOrderId: String(delivery.id || providerReference),
          trackingId: providerReference,
          trackingUrl: delivery.tracking_url || null,
          dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          dispatchError: admin.firestore.FieldValue.delete(),
        }),
        orderRef.update({
          deliveryStatus: "PREPARING",
          courierStatus: "DISPATCHED",
          providerReference,
          trackingId: providerReference,
          trackingUrl: delivery.tracking_url || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      ]);
      console.log(`[SHIPPING] Chowdeck shipment ${shipmentId} dispatched as ${providerReference}`);
      return { shipmentId, orderId, status: "PREPARING", dispatchStatus: "DISPATCHED", providerReference, trackingId: providerReference, trackingUrl: delivery.tracking_url };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Chowdeck dispatch failed";
      await shipmentRef.update({
        status: "PENDING_PICKUP",
        dispatchStatus: "FAILED",
        dispatchError: reason.slice(0, 500),
        lastDispatchAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.error(`[SHIPPING] Chowdeck dispatch failed for ${shipmentId}:`, reason);
      return { shipmentId, orderId, status: "PENDING_PICKUP", dispatchStatus: "FAILED", reason };
    }
  }

  if (code === "topship") {
    try {
      const quote = shipment.providerQuote as TopshipQuote | undefined;
      if (!quote || !Number.isFinite(Number(quote.cost)) || !quote.pricingTier) {
        throw new Error("Topship delivery quote is missing or expired");
      }

      const deliveryAddress = order.deliveryAddress || shipment.deliveryAddress;
      const pickupAddress = shipment.pickupAddress;
      const sender: TopshipAddress = typeof pickupAddress === "string"
        ? {
            name: asText(order.storeName, "SellOnWhatsApp seller"),
            phone: normalisePhone(shipment.pickupPhone || shipment.storePhone),
            address: pickupAddress,
            state: asText(shipment.pickupState),
          }
        : {
            name: asText(pickupAddress?.name, order.storeName || "SellOnWhatsApp seller"),
            phone: normalisePhone(pickupAddress?.phone || shipment.pickupPhone || shipment.storePhone),
            address: addressText(pickupAddress),
            city: asText(pickupAddress?.city),
            state: asText(pickupAddress?.state || shipment.pickupState),
            lga: asText(pickupAddress?.lga),
          };
      const receiver: TopshipAddress = {
        name: asText(order.customerName, "Customer"),
        phone: normalisePhone(order.customerPhone || deliveryAddress?.phone),
        email: asText(order.customerEmail) || undefined,
        address: addressText(deliveryAddress),
        city: asText(deliveryAddress?.city),
        state: stateText(deliveryAddress),
        lga: asText(deliveryAddress?.lga),
        postalCode: asText(deliveryAddress?.postalCode),
      };
      const items = Array.isArray(order.items) ? order.items : [];

      // Persist the draft ID before paying from the Topship wallet. If wallet
      // payment fails, a retry pays the same draft instead of creating a
      // duplicate shipment.
      let topShipShipmentId = asText(shipment.topshipShipmentId);
      if (!topShipShipmentId) {
        const draft = await createTopshipShipment({ quote, sender, receiver, items });
        topShipShipmentId = asText(draft.id);
        if (!topShipShipmentId) throw new Error("Topship did not return a shipment ID");
        await shipmentRef.update({
          topshipShipmentId: topShipShipmentId,
          provider: "topship",
          dispatchStatus: "PROVIDER_PAYMENT_PENDING",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      const paidShipment = await payTopshipShipment(topShipShipmentId);
      const providerReference = asText(paidShipment.trackingId || paidShipment.id, topShipShipmentId);
      if (!providerReference) throw new Error("Topship did not return a tracking reference");

      await Promise.all([
        shipmentRef.update({
          status: "AWAITING_PICKUP",
          dispatchStatus: "DISPATCHED",
          provider: "topship",
          topshipShipmentId: topShipShipmentId,
          providerReference,
          courierOrderId: topShipShipmentId,
          trackingId: providerReference,
          trackingUrl: paidShipment.trackingUrl || null,
          providerStatus: paidShipment.shipmentStatus || paidShipment.status || "Confirmed",
          dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          dispatchError: admin.firestore.FieldValue.delete(),
        }),
        orderRef.update({
          deliveryStatus: "AWAITING_PICKUP",
          courierStatus: paidShipment.shipmentStatus || paidShipment.status || "Confirmed",
          providerReference,
          trackingId: providerReference,
          trackingUrl: paidShipment.trackingUrl || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      ]);
      console.log(`[SHIPPING] Topship shipment ${shipmentId} booked as ${providerReference}`);
      return { shipmentId, orderId, status: "AWAITING_PICKUP", dispatchStatus: "DISPATCHED", providerReference, trackingId: providerReference, trackingUrl: paidShipment.trackingUrl };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Topship dispatch failed";
      await shipmentRef.update({
        status: "PENDING_PICKUP",
        dispatchStatus: "FAILED",
        dispatchError: reason.slice(0, 500),
        lastDispatchAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.error(`[SHIPPING] Topship dispatch failed for ${shipmentId}:`, reason);
      return { shipmentId, orderId, status: "PENDING_PICKUP", dispatchStatus: "FAILED", reason };
    }
  }

  if (code === "sendbox") {
    try {
      const quote = (shipment.providerQuote || {}) as Record<string, unknown>;
      const deliveryAddress = order.deliveryAddress || shipment.deliveryAddress;
      const pickupAddress = shipment.pickupAddress || {};
      const sender: SendboxAddress = {
        name: asText(pickupAddress?.name, order.storeName || "SellOnWhatsApp seller"),
        phone: normalisePhone(pickupAddress?.phone || shipment.pickupPhone || shipment.storePhone),
        address: addressText(pickupAddress),
        city: asText(pickupAddress?.city),
        state: asText(pickupAddress?.state || shipment.pickupState),
        lga: asText(pickupAddress?.lga),
        latitude: pickupAddress?.latitude,
        longitude: pickupAddress?.longitude,
      };
      const receiver: SendboxAddress = {
        name: asText(order.customerName, "Customer"),
        phone: normalisePhone(order.customerPhone || deliveryAddress?.phone),
        email: asText(order.customerEmail) || undefined,
        address: addressText(deliveryAddress),
        city: asText(deliveryAddress?.city),
        state: stateText(deliveryAddress),
        lga: asText(deliveryAddress?.lga),
        postalCode: asText(deliveryAddress?.postalCode),
        latitude: deliveryAddress?.latitude,
        longitude: deliveryAddress?.longitude,
      };
      const items = Array.isArray(order.items) ? order.items : [];
      const weight = Math.max(1, items.reduce((total: number, item: any) => total + (Number(item.weightKg ?? item.weight) || 1) * (Number(item.quantity) || 1), 0));
      const sendboxShipment = await createSendboxShipment({
        sender,
        receiver,
        items,
        weightKg: weight,
        totalValueNaira: Number(order.productSubtotal ?? order.total ?? 0),
        selectedCourierId: asText(quote.key || quote.id) || undefined,
        reference: shipmentId,
      });
      const providerReference = asText(sendboxShipment.tracking_code || sendboxShipment.code || sendboxShipment.id);
      if (!providerReference) throw new Error("Sendbox did not return a shipment or tracking reference");
      const providerStatus = asText(sendboxShipment.status_code || sendboxShipment.current_status?.code, "pending");
      const isDrafted = ["drafted", "on_hold"].includes(providerStatus.toLowerCase());

      await Promise.all([
        shipmentRef.update({
          status: isDrafted ? "PENDING_PICKUP" : "AWAITING_PICKUP",
          dispatchStatus: isDrafted ? "PROVIDER_PAYMENT_PENDING" : "DISPATCHED",
          provider: "sendbox",
          providerReference,
          courierOrderId: String(sendboxShipment.id || providerReference),
          trackingId: providerReference,
          providerStatus,
          dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          dispatchError: admin.firestore.FieldValue.delete(),
        }),
        orderRef.update({
          deliveryStatus: isDrafted ? "PENDING_PICKUP" : "AWAITING_PICKUP",
          courierStatus: providerStatus,
          providerReference,
          trackingId: providerReference,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      ]);
      console.log(`[SHIPPING] Sendbox shipment ${shipmentId} created as ${providerReference}`);
      return { shipmentId, orderId, status: isDrafted ? "PENDING_PICKUP" : "AWAITING_PICKUP", dispatchStatus: isDrafted ? "PROVIDER_PAYMENT_PENDING" : "DISPATCHED", providerReference, trackingId: providerReference };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Sendbox dispatch failed";
      await shipmentRef.update({
        status: "PENDING_PICKUP",
        dispatchStatus: "FAILED",
        dispatchError: reason.slice(0, 500),
        lastDispatchAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.error(`[SHIPPING] Sendbox dispatch failed for ${shipmentId}:`, reason);
      return { shipmentId, orderId, status: "PENDING_PICKUP", dispatchStatus: "FAILED", reason };
    }
  }

  if (code !== "fez") {
    const reason = `Automated dispatch is not configured for ${asText(shipment.courierName, code || "this courier")}. Choose Chowdeck, FEZ, Sendbox, Topship, or Self-Arranged.`;
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
