import { createElement } from "react";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { sendEmail } from "@/lib/email";
import type { SendEmailResult } from "@/lib/email/types";
import OrderConfirmation from "@/emails/OrderConfirmation";
import PaymentConfirmation from "@/emails/PaymentConfirmation";
import NewOrder from "@/emails/NewOrder";
import ShippingUpdate from "@/emails/ShippingUpdate";
import OrderDelivered from "@/emails/OrderDelivered";
import SubscriptionConfirmation from "@/emails/SubscriptionConfirmation";
import RenewalReminder from "@/emails/RenewalReminder";
import PaymentFailed from "@/emails/PaymentFailed";
import BuyerWelcome from "@/emails/BuyerWelcome";
import SellerWelcome from "@/emails/SellerWelcome";
import type { OrderItem } from "@/components/emails/OrderCard";
import type { TrackingStep } from "@/components/emails/TrackingTimeline";

type Data = Record<string, unknown>;
type SubscriptionType = "seller" | "store_boost" | "marketplace_partner";
type OrderStatusEmail = "order-shipped" | "order-out-for-delivery" | "order-delivered" | "order-cancelled" | "order-refunded";

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "https://sellonwhatsapp.com").replace(/\/$/, "");

function text(...values: unknown[]): string {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() || "";
}

function number(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value.replace(/[^\d.-]/g, "")) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown): string {
  const raw = text(value);
  if (raw.startsWith("₦")) return raw;
  return `₦${number(value).toLocaleString("en-NG")}`;
}

function dateText(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toLocaleString("en-NG");
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toLocaleString("en-NG");
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? text(value) || undefined : parsed.toLocaleString("en-NG");
}

function itemsOf(order: Data): OrderItem[] {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.map((item, index) => {
    const data = item && typeof item === "object" ? item as Data : {};
    const images = Array.isArray(data.images) ? data.images : [];
    return {
      name: text(data.name, data.productName, data.title) || `Item ${index + 1}`,
      imageUrl: text(data.imageUrl, data.image, data.thumbnail, images[0]),
      quantity: Math.max(1, Math.floor(number(data.quantity || data.qty || 1))),
      price: money(data.price ?? data.unitPrice ?? data.amount),
      variant: text(data.variant, data.variantName, data.selectedVariant),
    };
  });
}

function orderNumberOf(order: Data): string {
  return text(order.orderNumber, order.orderId, order.id, order.checkoutReference) || "order";
}

function orderIdOf(order: Data): string {
  return text(order.id, order.orderId, order.orderNumber, order.checkoutReference) || "order";
}

function orderTotals(order: Data) {
  const items = itemsOf(order);
  const calculatedSubtotal = items.reduce((sum, item) => sum + number(item.price) * (item.quantity || 1), 0);
  const subtotal = order.subtotal ?? order.subTotal ?? calculatedSubtotal;
  const shipping = order.shipping ?? order.shippingCost ?? order.deliveryFee ?? 0;
  const discount = order.discount ?? order.discountAmount ?? 0;
  const total = order.totalAmount ?? order.total ?? order.amount ?? number(subtotal) + number(shipping) - number(discount);
  return { items, subtotal: money(subtotal), shipping: money(shipping), discount: money(discount), total: money(total) };
}

async function getIdentity(uid: string, fallbackEmail?: unknown, fallbackName?: unknown) {
  if (!uid && !text(fallbackEmail)) return { email: "", name: text(fallbackName) };

  const [userSnapshot, vendorSnapshot, storeSnapshot, authUser] = await Promise.all([
    uid ? adminDb.collection("users").doc(uid).get().catch(() => null) : Promise.resolve(null),
    uid ? adminDb.collection("vendors").doc(uid).get().catch(() => null) : Promise.resolve(null),
    uid ? adminDb.collection("stores").doc(uid).get().catch(() => null) : Promise.resolve(null),
    uid ? adminAuth.getUser(uid).catch(() => null) : Promise.resolve(null),
  ]);
  const profile = {
    ...(userSnapshot?.data() || {}),
    ...(vendorSnapshot?.data() || {}),
    ...(storeSnapshot?.data() || {}),
  } as Data;

  return {
    email: text(fallbackEmail, profile.email, profile.contactEmail, profile.ownerEmail, authUser?.email),
    name: text(fallbackName, profile.displayName, profile.name, profile.storeName, profile.firstName && `${profile.firstName} ${text(profile.lastName)}`, authUser?.displayName) || "there",
  };
}

async function orderContext(order: Data, store?: Data) {
  const sellerId = text(order.storeId, order.vendorId);
  const buyerId = text(order.buyerId, order.customerId);
  const storeData = store || (sellerId ? (await adminDb.collection("stores").doc(sellerId).get()).data() || {} : {});
  const buyer = await getIdentity(buyerId, order.customerEmail ?? order.buyerEmail ?? order.email, order.customerName ?? order.buyerName);
  const seller = await getIdentity(sellerId, order.sellerEmail ?? storeData.email ?? storeData.ownerEmail, order.sellerName ?? storeData.storeName ?? storeData.name);
  const orderId = orderIdOf(order);
  const totals = orderTotals(order);
  return {
    buyerId,
    sellerId,
    buyer,
    seller,
    storeData,
    orderId,
    orderNumber: orderNumberOf(order),
    orderUrl: `${appUrl()}/buyer/orders/${encodeURIComponent(orderId)}`,
    sellerOrderUrl: `${appUrl()}/dashboard?tab=orders&order=${encodeURIComponent(orderId)}`,
    ...totals,
  };
}

async function report(result: SendEmailResult, type: string, email: string) {
  if (result.success) console.log(`[EMAIL] Sent '${type}' to ${email}${result.alreadySent ? " (already sent)" : ""}`);
  else console.error(`[EMAIL] Failed '${type}' to ${email}: ${result.error || "Unknown error"}`);
  return result;
}

async function safeSend(options: Parameters<typeof sendEmail>[0], type: string) {
  try {
    const recipient = Array.isArray(options.to) ? options.to[0] : options.to;
    return await report(await sendEmail(options), type, recipient.email);
  } catch (error) {
    console.error(`[EMAIL] Failed '${type}':`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown email error" } satisfies SendEmailResult;
  }
}

export async function sendOrderPaymentEmails(order: Data, store?: Data): Promise<void> {
  try {
    const context = await orderContext(order, store);
    const paymentReference = text(order.paymentReference, order.nombaReference, order.checkoutReference, context.orderId);
    const amount = money(order.totalAmount ?? order.total ?? order.amount);
    const paymentMethod = text(order.paymentMethod, order.paymentChannel, order.channel);
    const tasks: Promise<SendEmailResult>[] = [];

    if (context.buyer.email) {
      tasks.push(safeSend({
        to: { email: context.buyer.email, name: context.buyer.name },
        subject: `Order #${context.orderNumber} received 🎉`,
        react: createElement(OrderConfirmation, {
          customerName: context.buyer.name,
          orderNumber: context.orderNumber,
          storeName: text(order.storeName, context.storeData.storeName, context.storeData.name),
          items: context.items,
          subtotal: context.subtotal,
          shipping: context.shipping,
          discount: context.discount,
          total: context.total,
          orderUrl: context.orderUrl,
        }),
        type: "order_confirmation",
        idempotencyKey: `order_confirmation:${context.orderId}`,
        metadata: { orderId: context.orderId, customerId: context.buyerId, storeId: context.sellerId },
      }, "order_confirmation"));
      tasks.push(safeSend({
        to: { email: context.buyer.email, name: context.buyer.name },
        subject: `Payment confirmed for order #${context.orderNumber} 🎉`,
        react: createElement(PaymentConfirmation, {
          customerName: context.buyer.name,
          orderNumber: context.orderNumber,
          amount,
          paymentReference,
          paymentMethod,
          orderUrl: context.orderUrl,
        }),
        type: "payment_confirmation",
        idempotencyKey: `payment_confirmation:${paymentReference}`,
        metadata: { orderId: context.orderId, customerId: context.buyerId, storeId: context.sellerId, paymentReference },
      }, "payment_confirmation"));
    }

    if (context.seller.email) {
      tasks.push(safeSend({
        to: { email: context.seller.email, name: context.seller.name },
        subject: `New paid order #${context.orderNumber} 🎉`,
        react: createElement(NewOrder, {
          sellerName: context.seller.name,
          orderNumber: context.orderNumber,
          customerName: context.buyer.name,
          items: context.items,
          subtotal: context.subtotal,
          shipping: context.shipping,
          discount: context.discount,
          total: context.total,
          paymentStatus: "Paid",
          orderUrl: context.sellerOrderUrl,
        }),
        type: "new_order",
        idempotencyKey: `new_order:${context.orderId}`,
        metadata: { orderId: context.orderId, sellerId: context.sellerId, storeId: context.sellerId, paymentStatus: "paid" },
      }, "new_order"));
    }

    await Promise.allSettled(tasks);
  } catch (error) {
    console.error("[EMAIL] Payment confirmation fan-out failed:", error);
  }
}

function shippingSteps(eventType: OrderStatusEmail, order: Data): TrackingStep[] {
  const shipped = eventType === "order-shipped" || eventType === "order-out-for-delivery" || eventType === "order-delivered";
  const outForDelivery = eventType === "order-out-for-delivery" || eventType === "order-delivered";
  const delivered = eventType === "order-delivered";
  return [
    { label: "Order placed", description: "Your order was received.", completed: true, date: dateText(order.createdAt) },
    { label: "Payment confirmed", description: "Your payment was successfully confirmed.", completed: true, date: dateText(order.paidAt || order.paymentConfirmedAt) },
    { label: "Order shipped", description: "Your order has been handed over to the courier.", completed: shipped, current: eventType === "order-shipped", date: dateText(order.shippedAt) },
    { label: "Out for delivery", description: "Your order will be delivered to you.", completed: outForDelivery, current: eventType === "order-out-for-delivery", date: dateText(order.outForDeliveryAt) },
    { label: "Delivered", description: "Your order has been delivered.", completed: delivered, current: delivered, date: dateText(order.deliveredAt || order.completedAt) },
  ];
}

export async function sendOrderStatusEmail(order: Data, eventType: OrderStatusEmail, store?: Data): Promise<void> {
  try {
    const context = await orderContext(order, store);
    if (!context.buyer.email) return;
    const trackingNumber = text(order.trackingNumber, order.trackingId, order.courierTrackingId);
    const trackingUrl = text(order.trackingUrl, order.trackingLink);
    const courierName = text(order.courierName, order.carrier, order.shippingMethod);
    const status = eventType === "order-shipped" ? "Shipped" : eventType === "order-out-for-delivery" ? "Out for delivery" : eventType === "order-delivered" ? "Delivered" : eventType === "order-refunded" ? "Refunded" : "Cancelled";
    const email = eventType === "order-delivered"
      ? createElement(OrderDelivered, {
          customerName: context.buyer.name,
          orderNumber: context.orderNumber,
          storeName: text(order.storeName, context.storeData.storeName, context.storeData.name),
          deliveredAt: dateText(order.deliveredAt || order.completedAt),
          orderUrl: context.orderUrl,
        })
      : createElement(ShippingUpdate, {
          customerName: context.buyer.name,
          orderNumber: context.orderNumber,
          storeName: text(order.storeName, context.storeData.storeName, context.storeData.name),
          courierName,
          trackingNumber,
          trackingUrl,
          status,
          statusDescription: eventType === "order-cancelled" ? "Your order delivery has been cancelled. Please contact support if you need help." : eventType === "order-refunded" ? "Your payment has been refunded. Please contact support if you need help." : undefined,
          estimatedDelivery: dateText(order.estimatedDelivery),
          steps: shippingSteps(eventType, order),
          orderUrl: context.orderUrl,
        });

    await safeSend({
      to: { email: context.buyer.email, name: context.buyer.name },
      subject: eventType === "order-delivered" ? `Your order #${context.orderNumber} has been delivered 🎉` : `Shipping update for order #${context.orderNumber} 📦`,
      react: email,
      type: eventType === "order-delivered" ? "order_delivered" : "shipping_update",
      idempotencyKey: `${eventType === "order-delivered" ? "order_delivered" : "shipping_update"}:${context.orderId}:${text(order.deliveryStatus, order.courierStatus, status)}`,
      metadata: { orderId: context.orderId, customerId: context.buyerId, storeId: context.sellerId, courierName, trackingNumber, shippingStatus: status },
    }, eventType === "order-delivered" ? "order_delivered" : "shipping_update");
  } catch (error) {
    console.error(`[EMAIL] ${eventType} email failed:`, error);
  }
}

function subscriptionTypeOf(subscription: Data, explicit?: SubscriptionType): SubscriptionType {
  if (explicit) return explicit;
  if (subscription.isBoost || text(subscription.subscriptionType) === "store_boost") return "store_boost";
  if (subscription.isPartner || text(subscription.planId).toLowerCase().includes("partner")) return "marketplace_partner";
  return "seller";
}

async function subscriptionContext(subscription: Data, explicitType?: SubscriptionType) {
  const userId = text(subscription.userId, subscription.storeId, subscription.vendorId, subscription.sellerId);
  const identity = await getIdentity(userId, subscription.email, subscription.customerName || subscription.sellerName);
  return {
    userId,
    identity,
    subscriptionType: subscriptionTypeOf(subscription, explicitType),
    id: text(subscription.id, subscription.nombaReference, subscription.reference) || "subscription",
    planName: text(subscription.planName, subscription.packageName) || "SellOnWhatsApp Plan",
    amount: money(subscription.finalPrice ?? subscription.amount ?? subscription.chargeAmount),
    reference: text(subscription.paymentReference, subscription.nombaTransactionId, subscription.nombaReference, subscription.reference),
    startDate: dateText(subscription.startDate || subscription.paidAt),
    expiryDate: dateText(subscription.expiryDate),
    renewalDate: dateText(subscription.renewalDate),
    gracePeriodEnds: dateText(subscription.gracePeriodEnds || subscription.gracePeriodExpiresAt),
  };
}

export async function sendSubscriptionConfirmationEmail(subscription: Data, explicitType?: SubscriptionType): Promise<void> {
  try {
    const context = await subscriptionContext(subscription, explicitType);
    if (!context.identity.email) return;
    await safeSend({
      to: { email: context.identity.email, name: context.identity.name },
      subject: context.subscriptionType === "store_boost" ? "Your Store Boost is now active 🚀" : `Your ${context.planName} subscription is now active 🎉`,
      react: createElement(SubscriptionConfirmation, {
        customerName: context.identity.name,
        subscriptionType: context.subscriptionType,
        planName: context.planName,
        amount: context.amount,
        billingPeriod: text(subscription.billingPeriod, subscription.durationLabel) || undefined,
        startDate: context.startDate,
        expiryDate: context.expiryDate,
        transactionReference: context.reference,
        dashboardUrl: `${appUrl()}/dashboard`,
      }),
      type: "subscription_confirmation",
      idempotencyKey: `subscription_confirmation:${context.subscriptionType}:${context.id}`,
      metadata: { subscriptionId: context.id, subscriptionType: context.subscriptionType, sellerId: context.userId, planName: context.planName, paymentReference: context.reference },
    }, "subscription_confirmation");
  } catch (error) {
    console.error("[EMAIL] Subscription confirmation failed:", error);
  }
}

export async function sendRenewalReminderEmail(subscription: Data, explicitType?: SubscriptionType): Promise<void> {
  try {
    const context = await subscriptionContext(subscription, explicitType);
    if (!context.identity.email || !context.expiryDate) return;
    await safeSend({
      to: { email: context.identity.email, name: context.identity.name },
      subject: `Your ${context.planName} subscription renews soon ⏰`,
      react: createElement(RenewalReminder, {
        customerName: context.identity.name,
        subscriptionType: context.subscriptionType,
        planName: context.planName,
        amount: context.amount,
        billingPeriod: text(subscription.billingPeriod, subscription.durationLabel) || undefined,
        expiryDate: context.expiryDate,
        renewalDate: context.renewalDate,
        dashboardUrl: `${appUrl()}/dashboard`,
      }),
      type: "renewal_reminder",
      idempotencyKey: `renewal_reminder:${context.id}:${text(subscription.expiryDate)}`,
      metadata: { subscriptionId: context.id, subscriptionType: context.subscriptionType, sellerId: context.userId, planName: context.planName, expiryDate: context.expiryDate },
    }, "renewal_reminder");
  } catch (error) {
    console.error("[EMAIL] Renewal reminder failed:", error);
  }
}

export async function sendSubscriptionPaymentFailedEmail(subscription: Data, explicitType?: SubscriptionType): Promise<void> {
  try {
    const context = await subscriptionContext(subscription, explicitType);
    if (!context.identity.email) return;
    const attemptId = text(subscription.renewalAttemptId, subscription.paymentReference, subscription.nombaReference, subscription.expiryDate) || context.id;
    await safeSend({
      to: { email: context.identity.email, name: context.identity.name },
      subject: `Action needed: payment failed for your ${context.planName} subscription`,
      react: createElement(PaymentFailed, {
        customerName: context.identity.name,
        subscriptionType: context.subscriptionType,
        planName: context.planName,
        amount: context.amount,
        failureReason: text(subscription.failureReason) || "Your payment method could not be charged.",
        expiryDate: context.expiryDate,
        gracePeriodEnds: context.gracePeriodEnds,
        attemptDate: dateText(subscription.attemptDate || new Date()),
        paymentUrl: `${appUrl()}/dashboard?tab=partner`,
        dashboardUrl: `${appUrl()}/dashboard`,
      }),
      type: "payment_failed",
      idempotencyKey: `payment_failed:${context.id}:${attemptId}`,
      metadata: { subscriptionId: context.id, subscriptionType: context.subscriptionType, sellerId: context.userId, planName: context.planName, amount: context.amount, expiryDate: context.expiryDate, gracePeriodEnds: context.gracePeriodEnds },
    }, "payment_failed");
  } catch (error) {
    console.error("[EMAIL] Subscription payment-failed email failed:", error);
  }
}

export async function sendWelcomeEmailNotification(user: Data, role: "buyer" | "vendor", storeName?: string): Promise<boolean> {
  try {
    const email = text(user.email);
    if (!email) return false;
    const name = text(user.firstName, user.displayName, user.name) || "there";
    const react = role === "vendor"
      ? createElement(SellerWelcome, { sellerName: name, storeName, dashboardUrl: `${appUrl()}/dashboard` })
      : createElement(BuyerWelcome, { customerName: name, exploreUrl: `${appUrl()}/explore` });
    const result = await safeSend({
      to: { email, name },
      subject: role === "vendor" ? "Welcome to SellOnWhatsApp! 🎉" : "Welcome to SellOnWhatsApp! 👋",
      react,
      type: role === "vendor" ? "seller_welcome" : "buyer_welcome",
      idempotencyKey: `${role === "vendor" ? "seller_welcome" : "buyer_welcome"}:${text(user.uid, user.id, email)}`,
      metadata: { userId: text(user.uid, user.id), role },
    }, role === "vendor" ? "seller_welcome" : "buyer_welcome");
    return result.success;
  } catch (error) {
    console.error("[EMAIL] Welcome email failed:", error);
    return false;
  }
}
