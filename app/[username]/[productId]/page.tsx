import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { notFound } from "next/navigation";
import ProductPageClient from "@/components/ProductPageClient";

async function getProductData(productId: string, username: string) {
  if (!productId) return null;

  const productSnap = await getDoc(doc(db, "products", productId));
  if (!productSnap.exists()) return null;
  const product = { id: productSnap.id, ...productSnap.data() };

  const storesRef = collection(db, "stores");
  const q = query(storesRef, where("username", "==", username.toLowerCase()));
  const storeSnap = await getDocs(q);
  
  if (storeSnap.empty) return { product, store: null };
  const store = { id: storeSnap.docs[0].id, ...storeSnap.docs[0].data() };

  return { product, store };
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