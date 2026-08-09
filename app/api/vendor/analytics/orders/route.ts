import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

type CustomerDetails = {
  name: string;
  email: string;
  phone: string;
};

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() || "";
}

function profileDetails(profile: Record<string, unknown>, authUser?: { displayName?: string | null; email?: string | null; phoneNumber?: string | null }): CustomerDetails {
  const email = firstString(profile.email, profile.emailAddress, authUser?.email);
  const phone = firstString(
    profile.whatsappNumber,
    profile.whatsappPhone,
    profile.phoneNumber,
    profile.phone,
    profile.contactPhone,
    authUser?.phoneNumber,
  );
  const name = firstString(
    profile.displayName,
    profile.fullName,
    profile.name,
    profile.username,
    profile.firstName && profile.lastName ? `${profile.firstName} ${profile.lastName}` : profile.firstName,
    authUser?.displayName,
    email ? email.split("@")[0] : "",
  );
  return { name, email, phone };
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(authorization.slice("Bearer ".length).trim());
    const body = await request.json().catch(() => ({})) as { orderIds?: unknown };
    const orderIds = Array.isArray(body.orderIds)
      ? Array.from(new Set(body.orderIds.filter((id): id is string => typeof id === "string" && id.trim()).map((id) => id.trim()))).slice(0, 100)
      : [];

    if (orderIds.length === 0) return NextResponse.json({ customers: {} });

    const orderSnapshots = await Promise.all(orderIds.map((orderId) => adminDb.collection("orders").doc(orderId).get()));
    const ownedOrders = orderSnapshots.filter((snapshot) => snapshot.exists && snapshot.data()?.vendorId === decoded.uid);
    const buyerIds = Array.from(new Set(ownedOrders.map((snapshot) => snapshot.data()?.buyerId).filter((id): id is string => typeof id === "string" && id.length > 0)));

    const customerByBuyerId = new Map<string, CustomerDetails>();
    await Promise.all(buyerIds.map(async (buyerId) => {
      const [buyerSnapshot, userSnapshot, authUser] = await Promise.all([
        adminDb.collection("buyers").doc(buyerId).get(),
        adminDb.collection("users").doc(buyerId).get(),
        adminAuth.getUser(buyerId).catch(() => null),
      ]);
      const buyerProfile = buyerSnapshot.exists ? buyerSnapshot.data() || {} : {};
      const userProfile = userSnapshot.exists ? userSnapshot.data() || {} : {};
      customerByBuyerId.set(buyerId, profileDetails({ ...userProfile, ...buyerProfile }, authUser || undefined));
    }));

    const customers = Object.fromEntries(ownedOrders.map((snapshot) => {
      const data = snapshot.data() || {};
      const buyerId = typeof data.buyerId === "string" ? data.buyerId : "";
      const profile = buyerId ? customerByBuyerId.get(buyerId) : undefined;
      return [snapshot.id, {
        name: firstString(data.customerName, data.buyerName, profile?.name),
        email: firstString(data.customerEmail, data.buyerEmail, profile?.email),
        phone: firstString(data.customerPhone, data.buyerPhone, data.whatsappNumber, data.phone, profile?.phone),
      } satisfies CustomerDetails];
    }));

    return NextResponse.json({ customers });
  } catch (error) {
    console.error("Vendor analytics customer lookup failed:", error);
    return NextResponse.json({ error: "Customer details could not be loaded" }, { status: 500 });
  }
}
