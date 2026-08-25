// /components/sections/StoresNear.tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import { MapPin, Store as StoreIcon } from "lucide-react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

type Store = {
  id: string;
  storeName: string;
  username?: string;
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  location?: string;
  city?: string;
  state?: string;
  productCount?: number;
  followersCount?: number;
};

export default function StoresNear() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStores() {
      try {
        const storesQuery = query(
          collection(db, "stores"),
          where("isActive", "==", true),
          limit(6)
        );
        const snapshot = await getDocs(storesQuery);
        const storesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Store[];

        setStores(storesData);
      } catch (error) {
        console.error("Stores could not be loaded:", error);
      } finally {
        setLoading(false);
      }
    }

    void loadStores();
  }, []);

  return (
    <section className={`${font.className} mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6 lg:px-8`}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 sm:text-xl">Stores Near You</h2>
          <p className="mt-1 text-sm font-medium text-gray-500">Discover local sellers in your area.</p>
        </div>
        <Link href="/stores" className="flex items-center gap-1 text-xs font-semibold text-[#00d95f] transition-colors hover:text-[#00a63e] sm:text-sm">
          View all <span className="text-sm">›</span>
        </Link>
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div key={item} className="min-w-[280px] h-48 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : stores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center">
          <StoreIcon className="mx-auto text-gray-300" size={28} />
          <p className="mt-3 text-sm font-bold text-gray-700">No stores are available yet.</p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar scroll-smooth md:grid md:grid-cols-6 md:overflow-visible">
          {stores.map((store) => (
            <Link
              key={store.id}
              href={store.username ? `/${store.username}` : `/stores/${store.id}`}
              className="min-w-[280px] flex-1 md:min-w-0 group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="relative h-24 w-full overflow-hidden bg-gray-100">
                {store.coverImageUrl ? (
                  <Image
                    src={store.coverImageUrl}
                    alt={store.storeName}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#00d95f]/20 to-[#00a63e]/20">
                    <StoreIcon size={32} className="text-[#00d95f]" />
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-white bg-gray-100 shadow-sm">
                    {store.logoUrl ? (
                      <Image
                        src={store.logoUrl}
                        alt={store.storeName}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#00d95f]">
                        <StoreIcon size={20} className="text-white" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-1 text-sm font-bold text-gray-900 group-hover:text-[#00a63e]">
                      {store.storeName}
                    </h3>
                    {(store.city || store.state) && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-gray-500">
                        <MapPin size={10} />
                        <span className="truncate">{store.city || store.state}</span>
                      </div>
                    )}
                  </div>
                </div>

                {store.description && (
                  <p className="mt-3 line-clamp-2 text-xs font-medium text-gray-600">
                    {store.description}
                  </p>
                )}

                <div className="mt-3 flex items-center gap-3 text-xs font-semibold text-gray-500">
                  <span>{store.productCount || 0} products</span>
                  <span>•</span>
                  <span>{store.followersCount || 0} followers</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <style jsx global>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
    </section>
  );
}