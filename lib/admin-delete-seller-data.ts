import { adminAuth, adminDb } from "@/lib/firebase-admin";

type DocumentReference = FirebaseFirestore.DocumentReference;

function uniqueReferences(references: DocumentReference[]) {
  return [...new Map(references.map((reference) => [reference.path, reference])).values()];
}

export async function getOwnedStoreReferences(ownerId: string) {
  const directStore = adminDb.collection("stores").doc(ownerId);
  const [directSnapshot, vendorStores, ownerStores, uidStores] = await Promise.all([
    directStore.get(),
    adminDb.collection("stores").where("vendorId", "==", ownerId).get(),
    adminDb.collection("stores").where("ownerId", "==", ownerId).get(),
    adminDb.collection("stores").where("uid", "==", ownerId).get(),
  ]);

  return uniqueReferences([
    ...(directSnapshot.exists ? [directStore] : []),
    ...vendorStores.docs.map((item) => item.ref),
    ...ownerStores.docs.map((item) => item.ref),
    ...uidStores.docs.map((item) => item.ref),
  ]);
}

export async function getProductReferences(storeIds: string[], ownerId?: string) {
  const queries = storeIds.flatMap((storeId) => [
    adminDb.collection("products").where("storeId", "==", storeId).get(),
    adminDb.collection("products").where("vendorId", "==", storeId).get(),
    adminDb.collection("products").where("ownerId", "==", storeId).get(),
  ]);
  if (ownerId) {
    queries.push(
      adminDb.collection("products").where("storeId", "==", ownerId).get(),
      adminDb.collection("products").where("vendorId", "==", ownerId).get(),
      adminDb.collection("products").where("ownerId", "==", ownerId).get(),
    );
  }
  const snapshots = await Promise.all(queries);
  return uniqueReferences(snapshots.flatMap((snapshot) => snapshot.docs.map((item) => item.ref)));
}

export async function deleteStoreData(storeReferences: DocumentReference[], ownerId?: string) {
  const storeIds = storeReferences.map((reference) => reference.id);
  const productReferences = await getProductReferences(storeIds, ownerId);
  const verificationReferences = storeIds.map((storeId) => adminDb.collection("store_verifications").doc(storeId));

  await Promise.all([
    ...productReferences.map((reference) => adminDb.recursiveDelete(reference)),
    ...storeReferences.map((reference) => adminDb.recursiveDelete(reference)),
    ...verificationReferences.map((reference) => adminDb.recursiveDelete(reference)),
  ]);

  return { storeCount: storeReferences.length, productCount: productReferences.length };
}

export async function deleteSellerData(userId: string) {
  const storeReferences = await getOwnedStoreReferences(userId);
  const deletedStoreData = await deleteStoreData(storeReferences, userId);
  const profileReferences = [
    adminDb.collection("users").doc(userId),
    adminDb.collection("buyers").doc(userId),
    adminDb.collection("vendors").doc(userId),
  ];

  await Promise.all(profileReferences.map((reference) => adminDb.recursiveDelete(reference)));

  let authDeleted = false;
  try {
    await adminAuth.deleteUser(userId);
    authDeleted = true;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code !== "auth/user-not-found") throw error;
  }

  return { ...deletedStoreData, authDeleted };
}
