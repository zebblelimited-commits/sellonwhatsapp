import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { notFound } from "next/navigation";
import ProductPageClient from "@/components/ProductPageClient";
import { db } from "@/lib/firebase";

type ProductRecord = Record<string, unknown> & {
  id: string;
  storeId?: string;
  vendorId?: string;
  ownerId?: string;
  username?: string;
  storeUsername?: string;
};

async function loadProduct(id: string) {
  const productSnapshot = await getDoc(doc(db, "products", id));
  if (!productSnapshot.exists()) return null;

  const product = { id: productSnapshot.id, ...productSnapshot.data() } as ProductRecord;
  const storeId = product.storeId || product.vendorId || product.ownerId;

  if (storeId) {
    const storeSnapshot = await getDoc(doc(db, "stores", String(storeId)));
    if (storeSnapshot.exists()) {
      return { product, store: { id: storeSnapshot.id, ...storeSnapshot.data() } };
    }
  }

  const username = product.username || product.storeUsername;
  if (username) {
    const storeSnapshot = await getDocs(query(collection(db, "stores"), where("username", "==", String(username).toLowerCase())));
    if (!storeSnapshot.empty) {
      return { product, store: { id: storeSnapshot.docs[0].id, ...storeSnapshot.docs[0].data() } };
    }
  }

  return { product, store: null };
}

export default async function ProductByIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadProduct(id);
  if (!data) notFound();

  return <ProductPageClient product={data.product} store={data.store} />;
}
