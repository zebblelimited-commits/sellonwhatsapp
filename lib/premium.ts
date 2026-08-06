// lib/premium.ts
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

export type FeatureKey = 
  | 'chat_support'
  | 'verified_badge'
  | 'advanced_analytics'
  | 'priority_support'
  | 'custom_branding'
  | 'bulk_upload'
  | 'api_access';

export interface Plan {
  id: string;
  name: string;
  price: number;
  features: FeatureKey[];
  limits: Record<string, number>;
}

// ✅ Check if user has a specific feature
export async function hasFeature(userId: string, feature: FeatureKey): Promise<boolean> {
  try {
    // 1. Get user's active subscription
    const subsRef = collection(db, "subscriptions");
    const q = query(
      subsRef, 
      where("userId", "==", userId),
      where("status", "==", "active"),
      where("currentPeriodEnd", ">", new Date())
    );
    const snap = await getDocs(q);
    
    if (snap.empty) return false;
    
    const sub = snap.docs[0].data();
    
    // 2. Get plan details
    const planDoc = await getDoc(doc(db, "plans", sub.planId));
    if (!planDoc.exists()) return false;
    
    const plan = planDoc.data() as Plan;
    
    // 3. Check if feature is included
    return plan.features.includes(feature);
    
  } catch (error) {
    console.error("Feature check failed:", error);
    return false; // Fail closed for security
  }
}

// ✅ Check if store is verified (for badge display)
export async function isStoreVerified(storeId: string): Promise<boolean> {
  try {
    const storeDoc = await getDoc(doc(db, "stores", storeId));
    if (!storeDoc.exists()) return false;
    return storeDoc.data()?.isVerified === true;
  } catch {
    return false;
  }
}

// ✅ Get user's current plan
export async function getUserPlan(userId: string): Promise<Plan | null> {
  try {
    const subsRef = collection(db, "subscriptions");
    const q = query(
      subsRef, 
      where("userId", "==", userId),
      where("status", "==", "active"),
      where("currentPeriodEnd", ">", new Date())
    );
    const snap = await getDocs(q);
    
    if (snap.empty) return null;
    
    const sub = snap.docs[0].data();
    const planDoc = await getDoc(doc(db, "plans", sub.planId));
    
    return planDoc.exists() ? (planDoc.data() as Plan) : null;
  } catch {
    return null;
  }
}