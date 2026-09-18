import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// These collections contain user, marketplace, payment-test, and shipping-test data.
// System collections such as admins, couriers, plans, hero_slides, sponsored_stores,
// and auditLogs are intentionally excluded.
const RESET_COLLECTIONS = [
  "users",
  "buyers",
  "vendors",
  "stores",
  "products",
  "orders",
  "shipments",
  "payouts",
  "escrow",
  "escrow_transactions",
  "subscriptions",
  "boosts",
  "analytics",
  "follows",
  "reviews",
  "notifications",
  "disputes",
  "dispute_settlements",
  "refunds",
  "store_verifications",
  "support_chats",
  "messages",
  "transactions",
] as const;

const BASIC_CONFIRMATION = "DELETE TEST DATA";
const AUTH_CONFIRMATION = "DELETE TEST DATA AND AUTH USERS";

function isSuperAdminRole(role: unknown) {
  return ["super_admin", "superadmin"].includes(String(role || "").trim().toLowerCase().replace(/[\s-]+/g, "_"));
}

function selectedCollectionNames(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const requested = new Set(value.filter((item): item is string => typeof item === "string"));
  if ([...requested].some((name) => !RESET_COLLECTIONS.includes(name as (typeof RESET_COLLECTIONS)[number]))) return null;
  return RESET_COLLECTIONS.filter((name) => requested.has(name));
}

type CollectionPreview = {
  name: string;
  count: number;
};

async function getProtectedAdminIds() {
  const snapshot = await adminDb.collection("admins").get();
  return new Set(snapshot.docs.map((item) => item.id));
}

async function listAuthUsers() {
  const users: Array<{ uid: string; email?: string }> = [];
  let pageToken: string | undefined;

  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    users.push(...page.users.map((user) => ({ uid: user.uid, email: user.email })));
    pageToken = page.pageToken;
  } while (pageToken);

  return users;
}

async function getPreview() {
  const protectedAdminIds = await getProtectedAdminIds();
  const [collectionSnapshots, authUsers] = await Promise.all([
    Promise.all(RESET_COLLECTIONS.map((name) => adminDb.collection(name).get())),
    listAuthUsers(),
  ]);

  const collections: CollectionPreview[] = collectionSnapshots.map((snapshot, index) => {
    const name = RESET_COLLECTIONS[index];
    const count = name === "users"
      ? snapshot.docs.filter((item) => !protectedAdminIds.has(item.id)).length
      : snapshot.size;
    return { name, count };
  });

  const removableAuthUsers = authUsers.filter((user) => !protectedAdminIds.has(user.uid));

  return {
    collections,
    totalDocuments: collections.reduce((total, item) => total + item.count, 0),
    authUsers: removableAuthUsers.length,
    protectedAdminIds: protectedAdminIds.size,
  };
}

async function requireSuperAdmin(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;
  if (!isSuperAdminRole(access.admin.role)) {
    return NextResponse.json({ error: "Only a super admin can reset test data." }, { status: 403 });
  }
  return access;
}

export async function GET(request: NextRequest) {
  const access = await requireSuperAdmin(request);
  if (!("admin" in access)) return access;

  try {
    return NextResponse.json(await getPreview());
  } catch (error) {
    console.error("Admin test-data preview failed:", error);
    return NextResponse.json({ error: "Test-data preview could not be generated." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireSuperAdmin(request);
  if (!("admin" in access)) return access;

  let body: { confirmation?: unknown; deleteAuthUsers?: unknown; collections?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A confirmation payload is required." }, { status: 400 });
  }

  const deleteAuthUsers = body.deleteAuthUsers === true;
  const selectedCollections = selectedCollectionNames(body.collections);
  if (!selectedCollections) {
    return NextResponse.json({ error: "Select at least one data collection to reset." }, { status: 400 });
  }
  if (deleteAuthUsers && !selectedCollections.includes("users")) {
    return NextResponse.json({ error: "Select the users collection before deleting Authentication users." }, { status: 400 });
  }
  const expectedConfirmation = deleteAuthUsers ? AUTH_CONFIRMATION : BASIC_CONFIRMATION;
  if (body.confirmation !== expectedConfirmation) {
    return NextResponse.json({ error: `Type ${expectedConfirmation} exactly to continue.` }, { status: 400 });
  }

  try {
    const protectedAdminIds = await getProtectedAdminIds();
    const deletedCollections: CollectionPreview[] = [];

    for (const name of selectedCollections) {
      const collectionRef = adminDb.collection(name);
      if (name === "users") {
        const snapshot = await collectionRef.get();
        const removableDocs = snapshot.docs.filter((item) => !protectedAdminIds.has(item.id));
        await Promise.all(removableDocs.map((item) => adminDb.recursiveDelete(item.ref)));
        deletedCollections.push({ name, count: removableDocs.length });
      } else {
        const snapshot = await collectionRef.get();
        await adminDb.recursiveDelete(collectionRef);
        deletedCollections.push({ name, count: snapshot.size });
      }
    }

    let deletedAuthUsers = 0;
    if (deleteAuthUsers) {
      const authUsers = await listAuthUsers();
      const removableUserIds = authUsers
        .map((user) => user.uid)
        .filter((uid) => !protectedAdminIds.has(uid));

      for (let index = 0; index < removableUserIds.length; index += 1000) {
        const result = await adminAuth.deleteUsers(removableUserIds.slice(index, index + 1000));
        deletedAuthUsers += result.successCount;
        if (result.failureCount > 0) {
          console.warn("Some Firebase Authentication test users could not be deleted:", result.errors);
        }
      }
    }

    await adminDb.collection("auditLogs").add({
      action: "RESET_TEST_DATA",
      actorUid: access.admin.uid,
      actorEmail: access.admin.email,
      deletedCollections,
      selectedCollections,
      deletedAuthUsers,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      deletedCollections,
      deletedAuthUsers,
      message: "Test data reset completed. System configuration was preserved.",
    });
  } catch (error) {
    console.error("Admin test-data reset failed:", error);
    return NextResponse.json({ error: "The reset could not be completed. Some records may already have been removed." }, { status: 500 });
  }
}
