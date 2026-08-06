"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import {
  Search, Filter, MapPin, Star, MessageCircle,
  LayoutGrid, SlidersHorizontal, Users,
  Smartphone, Shirt, Utensils, Sparkles, Bike, X,
  Home, Cpu, HeartPulse, Car
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, limit, where } from "firebase/firestore";
import Header from "@/components/layout/Header";
// ✅ Import the new Explore-specific card
import StoreCardExplore from "@/components/sections/StoreCardExplore";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"] });

export default function ExplorePage() {
  const [stores, setStores] = useState<any[]>([]);
  const [recommendedStores, setRecommendedStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommendedLoading, setRecommendedLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState("");
  const [selectedState, setSelectedState] = useState("All Nigeria");
  const [onlyVerified, setOnlyVerified] = useState(false);

  const categories = [
    { name: "All", icon: <LayoutGrid size={16} /> },
    { name: "Fashion", icon: <Shirt size={16} /> },
    { name: "Electronics", icon: <Smartphone size={16} /> },
    { name: "Food", icon: <Utensils size={16} /> },
    { name: "Beauty", icon: <Sparkles size={16} /> },
    { name: "Home", icon: <Home size={16} /> },
    { name: "Tech", icon: <Cpu size={16} /> },
    { name: "Health", icon: <HeartPulse size={16} /> },
    { name: "Auto", icon: <Car size={16} /> },
    { name: "Logistics", icon: <Bike size={16} /> },
  ];

  const nigerianStates = ["Lagos", "Abuja", "Rivers", "Plateau", "Kano", "Oyo", "Enugu", "Delta", "Kaduna"];

  const filteredStates = nigerianStates.filter(state =>
    state.toLowerCase().includes(locationSearch.toLowerCase())
  );

  useEffect(() => {
    const fetchStores = async () => {
      setLoading(true);
      try {
        let q = query(collection(db, "stores"), limit(12));
        if (selectedCategory !== "All") {
          q = query(collection(db, "stores"), where("category", "==", selectedCategory), limit(12));
        }
        const [querySnapshot, recommendedSnapshot] = await Promise.all([
          getDocs(q),
          getDocs(query(collection(db, "stores"), limit(6)))
        ]);
        const storesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const recommendedData = recommendedSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter((store: any) => !["inactive", "banned"].includes(store.status))
          .slice(0, 5);
        setStores(storesData);
        setRecommendedStores(recommendedData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
        setRecommendedLoading(false);
      }
    };
    fetchStores();
  }, [selectedCategory]);

  return (
    <main className={`${jakarta.className} min-h-screen bg-[#FAFAFA]`}>
      <Header />
      <div className="w-full px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">Discover Stores</h1>
            <p className="text-gray-500 font-medium">Explore verified WhatsApp vendors in <span className="text-green-600 font-bold">{selectedState}</span></p>
          </div>
          <button onClick={() => setIsFilterOpen(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-gray-700 bg-white border border-gray-200 hover:border-green-600 transition-all shadow-sm">
            <SlidersHorizontal size={16} /> Advanced Filters
          </button>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto pb-4 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.name}
              onClick={() => setSelectedCategory(cat.name)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border ${selectedCategory === cat.name ? "bg-[#00a63e] text-white border-[#00a63e] shadow-lg shadow-green-100" : "bg-white text-gray-500 border-gray-100 hover:border-gray-300"
                }`}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {loading ? [1, 2, 3, 4, 5, 6].map(i => <StoreSkeleton key={i} />) : stores.map((store) => (
              <StoreCardExplore key={store.id} store={store} />
            ))}
          </div>

          <aside className="h-fit rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm lg:sticky lg:top-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-green-600">Discover more</p>
                <h2 className="mt-1 text-lg font-black text-gray-900">Recommended Stores</h2>
              </div>
              <Star size={18} className="fill-yellow-400 text-yellow-400" />
            </div>

            <div className="space-y-3">
              {recommendedLoading ? (
                [1, 2, 3, 4].map(i => <RecommendedStoreSkeleton key={i} />)
              ) : recommendedStores.length > 0 ? (
                recommendedStores.map(store => <RecommendedStore key={store.id} store={store} />)
              ) : (
                <p className="py-6 text-center text-sm text-gray-400">No recommendations yet.</p>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* FILTER MODAL */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setIsFilterOpen(false)} />
          <div className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-gray-900">Filter Search</h2>
              <X className="cursor-pointer text-gray-400" onClick={() => setIsFilterOpen(false)} />
            </div>
            <div className="mb-6">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Location / State</label>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input type="text" placeholder="Type state name..." value={locationSearch} onChange={(e) => setLocationSearch(e.target.value)} className="w-full bg-gray-50 border border-gray-100 rounded-xl py-2 pl-9 pr-4 text-sm outline-none focus:border-green-600 transition-all" />
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
                {["All Nigeria", ...filteredStates].map(state => (
                  <button key={state} onClick={() => { setSelectedState(state); setIsFilterOpen(false); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${selectedState === state ? "bg-green-600 text-white" : "bg-gray-100 text-gray-500"}`}>
                    {state}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Preferences</label>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <span className="text-sm font-bold text-gray-700">Verified Vendors Only</span>
                <input type="checkbox" checked={onlyVerified} onChange={(e) => setOnlyVerified(e.target.checked)} className="w-4 h-4 accent-green-600" />
              </div>
            </div>
            <button onClick={() => setIsFilterOpen(false)} className="w-full mt-8 py-3 bg-[#00a63e] text-white rounded-2xl font-bold text-sm shadow-lg shadow-green-100">Apply Filters</button>
          </div>
        </div>
      )}

      <footer className="py-12 text-center border-t border-gray-100 bg-white mt-20">
        <p className="text-[10px] uppercase tracking-[0.2em] font-extrabold text-gray-400">Powered by Zebble Technologies LTD</p>
      </footer>
    </main>
  );
}

// Skeleton remains local to the page
function StoreSkeleton() {
  return (
    <div className="bg-white rounded-[32px] border border-gray-100 h-[420px] animate-pulse p-4 flex flex-col">
      <div className="h-36 bg-gray-100 w-full rounded-2xl" />
      <div className="flex items-start gap-4 px-2 -mt-6 relative z-10">
        <div className="w-16 h-16 bg-gray-200 rounded-full border-4 border-white" />
        <div className="flex-1 pt-8 space-y-2">
          <div className="h-4 bg-gray-200 w-3/4 rounded" />
          <div className="h-3 bg-gray-100 w-1/2 rounded" />
        </div>
      </div>
      <div className="mt-6 space-y-3 flex-1 flex flex-col">
        <div className="grid grid-cols-3 gap-2">
          <div className="h-14 bg-gray-50 rounded-xl" />
          <div className="h-14 bg-gray-50 rounded-xl" />
          <div className="h-14 bg-gray-50 rounded-xl" />
        </div>
        <div className="mt-auto space-y-2">
          <div className="h-11 bg-gray-100 rounded-2xl" />
          <div className="h-10 bg-gray-50 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function RecommendedStore({ store }: { store: any }) {
  const storeName = store.storeName || store.name || "Unnamed Store";
  const logo = store.logoUrl || store.logo;
  const initials = storeName.slice(0, 2).toUpperCase();

  return (
    <Link href={store.username ? `/${store.username}` : "#"} className="flex items-center gap-3 rounded-2xl border border-gray-100 p-3 transition hover:border-green-200 hover:bg-green-50/50">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-green-100">
        {logo ? (
          <Image src={logo} alt={storeName} fill className="object-cover" sizes="48px" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-black text-green-700">{initials}</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold text-gray-900">{storeName}</p>
        <p className="mt-0.5 truncate text-[11px] font-medium text-gray-400">@{store.username || "store"}</p>
        <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wide text-green-600">{store.category || "General Store"}</p>
      </div>
    </Link>
  );
}

function RecommendedStoreSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 p-3 animate-pulse">
      <div className="h-12 w-12 shrink-0 rounded-xl bg-gray-100" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-3/4 rounded bg-gray-100" />
        <div className="h-2 w-1/2 rounded bg-gray-100" />
        <div className="h-2 w-2/3 rounded bg-gray-100" />
      </div>
    </div>
  );
}
