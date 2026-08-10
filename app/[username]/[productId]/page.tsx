import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { notFound } from "next/navigation";
import ProductPageClient from "@/components/ProductPageClient";

type ProductRecord = {
  id: string;
  storeId?: string;
  vendorId?: string;
  ownerId?: string;
  [key: string]: unknown;
};

async function getProductData(productId: string, username: string) {
  if (!productId) return null;

  const productSnap = await getDoc(doc(db, "products", productId));
  if (!productSnap.exists()) return null;
  const product = { id: productSnap.id, ...productSnap.data() } as ProductRecord;

  const storesRef = collection(db, "stores");
  const q = query(storesRef, where("username", "==", username.toLowerCase()));
  let storeSnap = await getDocs(q);

  // Some older store records preserve the username casing. Try the original
  // route value before resolving the store from the product owner ID.
  if (storeSnap.empty && username !== username.toLowerCase()) {
    storeSnap = await getDocs(query(storesRef, where("username", "==", username)));
  }
  
  if (!storeSnap.empty) {
    return { product, store: { id: storeSnap.docs[0].id, ...storeSnap.docs[0].data() } };
  }

  const productStoreId = product.storeId || product.vendorId || product.ownerId;
  if (productStoreId) {
    const storeById = await getDoc(doc(db, "stores", String(productStoreId)));
    if (storeById.exists()) {
      return { product, store: { id: storeById.id, ...storeById.data() } };
    }
  }

  return { product, store: null };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ username: string; productId: string }>;
}) {
  const { username, productId } = await params;
  const data = await getProductData(productId, username);
  
  if (!data || !data.product) notFound();

  return <ProductPageClient product={data.product} store={data.store} />;
}
