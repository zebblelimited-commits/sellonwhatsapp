"use client";

import React, { useRef } from "react";
import Image from "next/image";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ChevronLeft, ChevronRight } from "lucide-react";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// --- REUSABLE MINI STORE CARD COMPONENT ---
const MiniStoreCard = ({ store }) => {
  const filterBlue = "invert(42%) sepia(93%) saturate(1352%) hue-rotate(190deg) brightness(103%) contrast(105%)";
  
  return (
    <div className="min-w-[280px] bg-white border border-gray-100 rounded-[24px] shadow-sm overflow-hidden p-3 hover:shadow-md transition-all group">
      {/* Banner */}
      <div className="relative h-24 w-full rounded-xl overflow-hidden">
        <Image
          src={store.img}
          alt={store.name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
        />
      </div>

      {/* Header with Overlapping Logo */}
      <div className="flex items-start gap-3 px-1 -mt-5 relative z-10">
        <div className="p-0.5 bg-white rounded-full shadow-sm">
          <div className="relative w-12 h-12 rounded-full overflow-hidden border border-gray-50 bg-gray-100">
            <img src={store.logo || store.img} className="w-full h-full object-cover" alt="logo" />
          </div>
        </div>

        <div className="pt-6">
          <div className="flex items-center gap-1">
            <h3 className="font-bold text-sm text-gray-900 leading-tight">{store.name}</h3>
            <Image src="/icons/badge.svg" width={12} height={12} alt="v" style={{ filter: filterBlue }} />
          </div>
          <p className="text-[10px] text-gray-400 font-medium">{store.username}</p>
        </div>
      </div>

      {/* Price & Action */}
      <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
        <div>
          <p className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Starts from</p>
          <span className="text-sm font-bold text-gray-900">{store.price}</span>
        </div>
        <button className="text-[11px] font-bold text-[#00a63e] bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors">
          View Store
        </button>
      </div>
    </div>
  );
};

// --- MAIN NEW STORES SECTION ---
export default function NewStores() {
  const scrollRef = useRef(null);

  const stores = [
    { name: "Bella Fashion", username: "@bellastyle", price: "₦18,000", img: "https://images.unsplash.com/photo-1551218808-94e220e084d2", logo: "https://randomuser.me/api/portraits/women/44.jpg" },
    { name: "Gadget World", username: "@gadgetworld", price: "₦45,000", img: "https://images.unsplash.com/photo-1518779578993-ec3579fee39f", logo: "https://randomuser.me/api/portraits/men/32.jpg" },
    { name: "Yummy Meals", username: "@yummymeals", price: "₦3,500", img: "https://images.unsplash.com/photo-1551218808-94e220e084d2", logo: "https://randomuser.me/api/portraits/men/32.jpg" },
    { name: "Z-Tech", username: "@ztech_ng", price: "₦120,000", img: "https://images.unsplash.com/photo-1518779578993-ec3579fee39f", logo: "https://randomuser.me/api/portraits/women/44.jpg" },
    { name: "Luxe Beauty", username: "@luxebeauty", price: "₦12,500", img: "https://images.unsplash.com/photo-1551218808-94e220e084d2", logo: "https://randomuser.me/api/portraits/men/32.jpg" },
  ];

  const scroll = (direction) => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollTo = direction === "left" ? scrollLeft - clientWidth : scrollLeft + clientWidth;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: "smooth" });
    }
  };

  return (
    <section className={`${font.className} px-6 py-10`} id="new-stores">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">New Stores</h2>
        <div className="flex gap-2">
          <button onClick={() => scroll("left")} className="p-2 border border-gray-200 rounded-full hover:bg-gray-50 text-gray-400 transition-all active:scale-90">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => scroll("right")} className="p-2 border border-gray-200 rounded-full hover:bg-gray-50 text-gray-400 transition-all active:scale-90">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex gap-5 overflow-x-auto pb-4 no-scrollbar scroll-smooth">
        {stores.map((store, i) => (
          <MiniStoreCard key={i} store={store} />
        ))}
      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
}
