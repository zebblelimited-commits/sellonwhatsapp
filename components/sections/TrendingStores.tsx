"use client";

import React, { useRef } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { 
  Wifi, Shirt, UtensilsCrossed, Box, Gamepad2, 
  Home, Heart, Dumbbell, Palette, BookOpen, 
  ChevronLeft, ChevronRight 
} from "lucide-react";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const trendingData = [
  { name: "Tech Sellers", sales: "₦30k+ sales", icon: <Wifi/>, bg: "bg-green-50", color: "text-green-600" },
  { name: "Fashion Stores", sales: "₦50k+ sales", icon: <Shirt/>, bg: "bg-purple-50", color: "text-purple-600" },
  { name: "Food Vendors", sales: "₦20k+ sales", icon: <UtensilsCrossed/>, bg: "bg-orange-50", color: "text-orange-600" },
  { name: "Digital Products", sales: "₦100k+ sales", icon: <Box/>, bg: "bg-blue-50", color: "text-blue-600" },
  { name: "Gaming Gear", sales: "₦45k+ sales", icon: <Gamepad2/>, bg: "bg-indigo-50", color: "text-indigo-600" },
  { name: "Home Decor", sales: "₦12k+ sales", icon: <Home/>, bg: "bg-yellow-50", color: "text-yellow-600" },
  { name: "Beauty Hub", sales: "₦88k+ sales", icon: <Heart/>, bg: "bg-pink-50", color: "text-pink-600" },
  { name: "Fitness Pros", sales: "₦25k+ sales", icon: <Dumbbell/>, bg: "bg-red-50", color: "text-red-600" },
  { name: "Art Supplies", sales: "₦15k+ sales", icon: <Palette/>, bg: "bg-teal-50", color: "text-teal-600" },
  { name: "Book Haven", sales: "₦60k+ sales", icon: <BookOpen/>, bg: "bg-amber-50", color: "text-amber-600" },
];

export default function TrendingStores() {
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollTo = direction === "left" ? scrollLeft - clientWidth : scrollLeft + clientWidth;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: "smooth" });
    }
  };

  return (
    <section className={`${font.className} px-6 py-10`} id="trending">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">Trending Stores</h2>
        <div className="flex gap-2">
          <button 
            onClick={() => scroll("left")}
            className="p-2 border border-gray-200 rounded-full hover:bg-gray-50 text-gray-400 transition-all active:scale-90"
          >
            <ChevronLeft size={20} />
          </button>
          <button 
            onClick={() => scroll("right")}
            className="p-2 border border-gray-200 rounded-full hover:bg-gray-50 text-gray-400 transition-all active:scale-90"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 no-scrollbar scroll-smooth"
      >
        {trendingData.map((item, i) => (
          <div
            key={i}
            className="min-w-[240px] p-5 border border-gray-100 rounded-2xl flex items-center gap-4 bg-white shadow-sm hover:shadow-md transition-all cursor-pointer group"
          >
            <div className={`p-3.5 rounded-full ${item.bg} ${item.color} group-hover:scale-110 transition-transform`}>
              {React.cloneElement(item.icon, { size: 22 })}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-gray-800 leading-tight">{item.name}</span>
              <span className={`text-xs font-bold mt-1 ${item.color}`}>{item.sales}</span>
            </div>
          </div>
        ))}
      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
}
