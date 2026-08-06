"use client";

import React, { useRef } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { 
  Shirt, Smartphone, UtensilsCrossed, Box, 
  Sparkles, Briefcase, Heart, Book, 
  Gamepad2, Camera, ChevronLeft, ChevronRight 
} from "lucide-react";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const categoryList = [
  { name: "Fashion", icon: <Shirt className="text-pink-500" /> },
  { name: "Tech", icon: <Smartphone className="text-blue-500" /> },
  { name: "Food", icon: <UtensilsCrossed className="text-orange-500" /> },
  { name: "Digital", icon: <Box className="text-indigo-500" /> },
  { name: "Beauty", icon: <Sparkles className="text-pink-400" /> },
  { name: "Services", icon: <Briefcase className="text-green-500" /> },
  { name: "Health", icon: <Heart className="text-red-500" /> },
  { name: "Education", icon: <Book className="text-amber-500" /> },
  { name: "Gaming", icon: <Gamepad2 className="text-purple-500" /> },
  { name: "Photography", icon: <Camera className="text-slate-500" /> },
];

export default function Categories() {
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      // Scrolls by one full view width
      const scrollTo = direction === "left" ? scrollLeft - clientWidth : scrollLeft + clientWidth;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: "smooth" });
    }
  };

  return (
    <section className={`${font.className} px-6 py-10`} id="categories">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">Categories</h2>
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
        {categoryList.map((cat, i) => (
          <div
            key={i}
            className="min-w-[160px] p-4 bg-white border border-gray-100 rounded-xl flex items-center justify-center gap-3 hover:shadow-md transition-all cursor-pointer group"
          >
            <span className="group-hover:scale-110 transition-transform">
              {React.cloneElement(cat.icon, { size: 18 })}
            </span>
            <span className="text-sm font-medium text-gray-700">{cat.name}</span>
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
