import { adminDb } from "@/lib/firebase-admin";

/**
 * Updates subscription/payment flags without creating a public store profile
 * when the vendor has not completed store onboarding.
 */
export async function updateExistingStore(
  storeId: string,
  data: Record<string, any>,
  source: string,
): Promise<boolean> {
  const storeRef = adminDb.collection("stores").doc(storeId);
  const storeSnapshot = await storeRef.get();

  if (!storeSnapshot.exists) {
    console.warn(`[STORE SYNC] Skipped ${source}: store profile ${storeId} does not exist.`);
    return false;
  }

  await storeRef.update(data);
  return true;
}
