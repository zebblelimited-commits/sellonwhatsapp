"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { 
  Search, MapPin, Star, MessageCircle, 
  LayoutGrid, Users,
  Smartphone, Shirt, Utensils, Sparkles, Bike, X,
  Home, Cpu, HeartPulse, Car
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, limit, where } from "firebase/firestore";
import FollowButton from "@/components/store/FollowButton";

// Accept isFilterOpen and setIsFilterOpen as props from Dashboard
export function ExploreTab({ isFilterOpen, setIsFilterOpen }) {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  
  const [locationSearch, setLocationSearch] = useState("");
  const [selectedState, setSelectedState] = useState("All Nigeria");
  const [onlyVerified, setOnlyVerified] = useState(false);

  const categories = [
    { name: "All", icon: <LayoutGrid size={16}/> },
    { name: "Fashion", icon: <Shirt size={16}/> },
    { name: "Electronics", icon: <Smartphone size={16}/> },
    { name: "Food", icon: <Utensils size={16}/> },
    { name: "Beauty", icon: <Sparkles size={16}/> },
    { name: "Home", icon: <Home size={16}/> },
    { name: "Tech", icon: <Cpu size={16}/> },
    { name: "Health", icon: <HeartPulse size={16}/> },
    { name: "Auto", icon: <Car size={16}/> },
    { name: "Logistics", icon: <Bike size={16}/> },
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
        
        // Apply Category Filter
        if (selectedCategory !== "All") {
          q = query(collection(db, "stores"), where("category", "==", selectedCategory), limit(12));
        }

        const querySnapshot = await getDocs(q);
        const storesData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setStores(storesData);
      } catch (err) {
        console.error("Explore Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStores();
  }, [selectedCategory]);

  return (
    <div className="w-full">
      {/* Category Header - Filters Button Removed from here */}
      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-2 mb-8">
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

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {loading ? [1,2,3,4].map(i => <StoreSkeleton key={i} />) : stores.map((store) => (
          <StoreCard key={store.id} store={store} />
        ))}
      </div>

      {/* FILTER MODAL - Controls linked to props */}
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
                  <input type="text" placeholder="Type state name..." value={locationSearch} onChange={(e) => setLocationSearch(e.target.value)} className="w-full bg-gray-50 border border-gray-100 rounded-xl py-2 pl-9 pr-4 text-sm outline-none focus:border-green-600 transition-all" />
                </div>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1 no-scrollbar">
                   {["All Nigeria", ...filteredStates].map(state => (
                     <button key={state} onClick={() => {setSelectedState(state); setIsFilterOpen(false);}} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedState === state ? "bg-green-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                       {state}
                     </button>
                   ))}
                </div>
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Preferences</label>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="text-sm font-bold text-gray-700">Verified Vendors Only</span>
                  <input type="checkbox" checked={onlyVerified} onChange={(e) => setOnlyVerified(e.target.checked)} className="w-4 h-4 accent-green-600 cursor-pointer" />
                </div>
              </div>
              <button onClick={() => setIsFilterOpen(false)} className="w-full mt-8 py-3 bg-[#00a63e] text-white rounded-2xl font-bold text-sm shadow-lg shadow-green-100 hover:bg-[#008c34] transition-all">Apply Filters</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StoreCard({ store }) {
  const blueFilter = {
    filter: 'invert(48%) sepia(79%) saturate(2476%) hue-rotate(190deg) brightness(100%) contrast(105%)'
  };

  const displayItemCount = store.productCount || 0;  

  return (
    <div className="group bg-white rounded-[32px] border border-gray-100 overflow-hidden hover:shadow-2xl hover:shadow-gray-200/50 transition-all duration-500 flex flex-col">
      <Link href={`/${store.username}`} className="relative h-32 w-full bg-gray-100">
        {store.bannerUrl ? (
          <Image src={store.bannerUrl} fill className="object-cover" alt="banner" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-green-50 to-green-100" />
        )}
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
           <Star size={12} className="fill-yellow-400 text-yellow-400" />
           <span className="text-[10px] font-extrabold text-gray-700">4.8</span>
        </div>
      </Link>

      <div className="px-5 pb-6 flex-1 flex flex-col items-center text-center">
        <Link href={`/${store.username}`} className="relative w-20 h-20 rounded-2xl border-4 border-white overflow-hidden bg-white shadow-xl -mt-10 mb-3 group-hover:rotate-3 transition-transform duration-500">
          <img 
            src={store.logoUrl || `https://ui-avatars.com/api/?name=${store.storeName}&background=00a63e&color=fff`} 
            className="w-full h-full object-cover"
            alt="logo"
          />
        </Link>
        
        <div className="flex items-center gap-1.5 mb-0.5">
           <h3 className="font-extrabold text-gray-900">{store.storeName}</h3>
           <Image src="/icons/badge.svg" width={14} height={14} alt="verified" style={blueFilter} />
        </div>
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-tight mb-4">@{store.username}</p>
        
        <div className="grid grid-cols-3 w-full gap-2 border-y border-gray-50 py-3 mb-6">
           <div className="flex flex-col items-center">
             <span className="flex items-center gap-1 text-[#00a63e] font-bold text-xs"><Users size={12}/> {store.followerCount || 0}</span>
             <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Followers</span>
           </div>
           
           <div className="flex flex-col items-center border-x border-gray-50">
             <span className="flex items-center gap-1 text-gray-700 font-bold text-xs">
               <LayoutGrid size={12}/> {displayItemCount}
             </span>
             <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Items</span>
           </div>

           <div className="flex flex-col items-center">
             <span className="flex items-center gap-1 text-gray-700 font-bold text-xs truncate max-w-[60px]"><MapPin size={12}/> {store.state || "N/A"}</span>
             <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Location</span>
           </div>
        </div>

        <div className="w-full space-y-2">
          <Link href={`/${store.username}`} className="w-full py-3 bg-[#00a63e] hover:bg-[#008c34] rounded-2xl text-[11px] font-extrabold text-white transition-all flex items-center justify-center gap-2 shadow-sm">
            <MessageCircle size={16} /> View WhatsApp Shop
          </Link>
          
          <div className="w-full follow-button-wrapper">
             <FollowButton vendorId={store.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StoreSkeleton() {
  return (
    <div className="bg-white rounded-[32px] border border-gray-100 h-[400px] animate-pulse">
       <div className="h-32 bg-gray-100 w-full" />
       <div className="flex flex-col items-center px-5">
          <div className="w-20 h-20 bg-gray-200 rounded-2xl -mt-10 mb-4" />
          <div className="h-4 bg-gray-200 w-32 rounded mb-2" />
          <div className="h-3 bg-gray-100 w-20 rounded mb-6" />
          <div className="w-full h-12 bg-gray-50 rounded-2xl mb-2" />
          <div className="w-full h-10 bg-gray-50 rounded-xl" />
       </div>
    </div>
  );
}
