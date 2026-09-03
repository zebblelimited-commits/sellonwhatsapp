"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import { 
  Search, LayoutGrid, Smartphone, Shirt, Utensils, Sparkles, Bike, X,
  Home, Cpu, HeartPulse, Car, SlidersHorizontal, Star, MapPin
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, limit, where } from "firebase/firestore";
import StoreCardExplore from "@/components/sections/StoreCardExplore";
import ProductSection from "@/components/sections/ProductSection";
import { trackMetric } from "@/lib/analytics";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"] });

export interface ExploreTabProps {
  isFilterOpen: boolean;
  setIsFilterOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface ExploreStore {
  id: string;
  [key: string]: unknown;
}

type Coordinates = { latitude: number; longitude: number };

function storeCoordinates(store: ExploreStore): Coordinates | null {
  const record = store as Record<string, unknown>;
  const location = record.location && typeof record.location === "object"
    ? record.location as Record<string, unknown>
    : {};
  const latitude = Number(record.latitude ?? record.lat ?? location.latitude ?? location.lat);
  const longitude = Number(record.longitude ?? record.lng ?? location.longitude ?? location.lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    ? { latitude, longitude }
    : null;
}

function distanceInKm(from: Coordinates, to: Coordinates) {
  const radians = (value: number) => value * Math.PI / 180;
  const earthRadius = 6371;
  const deltaLatitude = radians(to.latitude - from.latitude);
  const deltaLongitude = radians(to.longitude - from.longitude);
  const a = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function ExploreTab({ isFilterOpen, setIsFilterOpen }: ExploreTabProps) {
  const [stores, setStores] = useState<ExploreStore[]>([]);
  const [recommendedStores, setRecommendedStores] = useState<ExploreStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommendedLoading, setRecommendedLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [locationSearch, setLocationSearch] = useState("");
  const [selectedState, setSelectedState] = useState("All Nigeria");
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "ready" | "denied">("idle");

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
  const filteredStates = nigerianStates.filter(state => state.toLowerCase().includes(locationSearch.toLowerCase()));

  const requestUserLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("denied");
      return;
    }
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationStatus("ready");
      },
      () => setLocationStatus("denied"),
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 },
    );
  };

  useEffect(() => {
    const fetchStores = async () => {
      setLoading(true);
      setRecommendedLoading(true);
      try {
        let q = query(collection(db, "stores"), limit(100));
        if (selectedCategory !== "All") {
          q = query(collection(db, "stores"), where("category", "==", selectedCategory), limit(100));
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
        console.error("Explore Fetch Error:", err);
      } finally {
        setLoading(false);
        setRecommendedLoading(false);
      }
    };
    fetchStores();
  }, [selectedCategory]);

  const visibleStores = stores.filter((store) => {
    const record = store as Record<string, unknown>;
    const location = record.location && typeof record.location === "object" ? record.location as Record<string, unknown> : {};
    const state = String(record.state || location.state || "").toLowerCase();
    const status = String(record.status || "").toLowerCase();
    return !["inactive", "banned"].includes(status)
      && (selectedState === "All Nigeria" || state === selectedState.toLowerCase())
      && (!onlyVerified || record.isVerified === true);
  });

  const nearbyStores = useMemo(() => {
    const withCoordinates = visibleStores
      .map((store) => {
        const coordinates = storeCoordinates(store);
        return userLocation && coordinates
          ? { ...store, distanceKm: distanceInKm(userLocation, coordinates) }
          : store;
      })
      .filter((store) => storeCoordinates(store) !== null);

    if (userLocation) {
      return withCoordinates
        .sort((a, b) => Number(a.distanceKm ?? Number.POSITIVE_INFINITY) - Number(b.distanceKm ?? Number.POSITIVE_INFINITY))
        .slice(0, 4);
    }

    // Without permission, show sellers that have a saved map location. The
    // selected state still applies through visibleStores above.
    return withCoordinates.slice(0, 4);
  }, [userLocation, visibleStores]);

  return (
    <div className={`w-full ${jakarta.className}`}>
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">Discover Stores</h1>
          <p className="text-gray-500 font-medium">Explore verified WhatsApp vendors in <span className="text-[#00a63e] font-bold">{selectedState}</span></p>
        </div>
        <button onClick={() => setIsFilterOpen(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-gray-700 bg-white border border-gray-200 hover:border-[#00a63e] transition-all shadow-sm">
          <SlidersHorizontal size={16} /> Advanced Filters
        </button>
      </div>

      {/* Categories */}
      <div className="flex items-center gap-3 overflow-x-auto pb-4 no-scrollbar mb-8">
        {categories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => setSelectedCategory(cat.name)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border ${
              selectedCategory === cat.name ? "bg-[#00a63e] text-white border-[#00a63e] shadow-lg shadow-green-100" : "bg-white text-gray-500 border-gray-100 hover:border-gray-300"
            }`}
          >
            {cat.icon} {cat.name}
          </button>
        ))}
      </div>

      {/* Main Grid + Sidebar */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {loading ? [1, 2, 3, 4, 5, 6].map(i => <StoreSkeleton key={i} />) : visibleStores.map((store) => (
            <StoreCardExplore key={store.id} store={store} />
          ))}
          {!loading && visibleStores.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm font-semibold text-gray-500">No stores match the selected filters.</div>}
        </div>

        <aside className="h-fit rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm lg:sticky lg:top-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#00a63e]">Discover more</p>
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

      {/* Stores Near You */}
      <section className="mt-20 pt-10 border-t border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Stores Near You</h2>
            <p className="text-gray-500 font-medium mt-1">{userLocation ? "Closest sellers based on your current location." : selectedState !== "All Nigeria" ? `Sellers in ${selectedState} with saved map locations.` : "Discover local sellers in your area."}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={requestUserLocation} disabled={locationStatus === "loading"} className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-bold text-[#00a63e] transition hover:bg-green-100 disabled:opacity-60">
              <MapPin size={14} /> {locationStatus === "loading" ? "Locating…" : userLocation ? "Refresh location" : "Use my location"}
            </button>
            <Link href="/stores" className="hidden items-center gap-1 text-sm font-bold text-[#00a63e] hover:text-[#008f35] transition-colors sm:flex">
              View all stores <span className="text-lg">›</span>
            </Link>
          </div>
        </div>
        {locationStatus === "denied" && <p className="mb-4 text-xs font-semibold text-amber-700">Location access was unavailable. Showing stores with saved coordinates instead.</p>}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {loading ? (
            [1, 2, 3, 4].map(i => <StoreSkeleton key={`near-${i}`} />)
          ) : nearbyStores.length > 0 ? nearbyStores.map((store) => (
            <div key={`near-${store.id}`} className="relative">
              <StoreCardExplore store={store} />
              {typeof store.distanceKm === "number" && <span className="absolute right-4 top-4 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-green-700 shadow-sm">{store.distanceKm.toFixed(1)} km</span>}
            </div>
          )) : (
            <div className="col-span-full rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm font-semibold text-gray-500">No stores have a saved map location yet.</div>
          )}
        </div>
      </section>

      {/* Product Sections (Adjusted to maxItems={5}) */}
      <div className="mt-20 pt-10 border-t border-gray-200 space-y-8">
        <ProductSection 
          title="Trending Products" 
          description="Most viewed and clicked products this week." 
          viewAllLink="/products?sort=trending" 
          maxItems={5} 
          sectionType="trending" 
        />
        <ProductSection 
          title="New Arrivals" 
          description="Fresh products just added to the marketplace." 
          viewAllLink="/products?sort=newest" 
          maxItems={5} 
          sectionType="newest" 
        />
        <ProductSection 
          title="Popular Products" 
          description="Best-selling and highly rated products." 
          viewAllLink="/products?sort=popular" 
          maxItems={5} 
          sectionType="popular" 
        />
        <ProductSection 
          title="Recommended for You" 
          description="Handpicked products you might love." 
          viewAllLink="/products?sort=recommended" 
          maxItems={5} 
          sectionType="recommended" 
        />
      </div>

      {/* Filter Modal */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setIsFilterOpen(false)} />
          <div className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-gray-900">Filter Search</h2>
              <X className="cursor-pointer text-gray-400 hover:text-gray-600 transition-colors" onClick={() => setIsFilterOpen(false)} />
            </div>
            <div className="mb-6">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Location / State</label>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input type="text" placeholder="Type state name..." value={locationSearch} onChange={(e) => setLocationSearch(e.target.value)} className="w-full bg-gray-50 border border-gray-100 rounded-xl py-2 pl-9 pr-4 text-sm outline-none focus:border-[#00a63e] transition-all" />
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1 no-scrollbar">
                {["All Nigeria", ...filteredStates].map(state => (
                  <button key={state} onClick={() => {setSelectedState(state); setIsFilterOpen(false);}} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedState === state ? "bg-[#00a63e] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                    {state}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Preferences</label>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="text-sm font-bold text-gray-700">Verified Vendors Only</span>
                <input type="checkbox" checked={onlyVerified} onChange={(e) => setOnlyVerified(e.target.checked)} className="w-4 h-4 accent-[#00a63e] cursor-pointer" />
              </div>
            </div>
            <button onClick={() => setIsFilterOpen(false)} className="w-full mt-8 py-3 bg-[#00a63e] text-white rounded-2xl font-bold text-sm shadow-lg shadow-green-100 hover:bg-[#008c34] transition-all">Apply Filters</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// LOCAL COMPONENTS
// ==========================================
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
    <Link href={store.username ? `/${store.username}` : "#"} onClick={() => void trackMetric(store.id, "click")} className="flex items-center gap-3 rounded-2xl border border-gray-100 p-3 transition hover:border-green-200 hover:bg-green-50/50">
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
        <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wide text-[#00a63e]">{store.category || "General Store"}</p>
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
