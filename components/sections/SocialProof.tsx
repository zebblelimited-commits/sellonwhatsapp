"use client";

import React from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { 
  Wifi, 
  Smartphone, 
  UtensilsCrossed, 
  Box, 
  Shirt, 
  Lightbulb, 
  Briefcase 
} from "lucide-react";

const font = Plus_Jakarta_Sans({ subsets: ["latin"] });

const trendingStores = [
  { name: "Tech Sellers", sales: "₦30k+ sales", icon: <Wifi className="text-green-600" />, bg: "bg-green-50" },
  { name: "Fashion Stores", sales: "₦50k+ sales", icon: <Shirt className="text-purple-600" />, bg: "bg-purple-50" },
  { name: "Food Vendors", sales: "₦20k+ sales", icon: <UtensilsCrossed className="text-orange-600" />, bg: "bg-orange-50" },
  { name: "Digital Products", sales: "₦100k+ sales", icon: <Box className="text-blue-600" />, bg: "bg-blue-50" },
  { name: "Fashion Stores", sales: "₦50k+ sales", icon: <Shirt className="text-purple-600" />, bg: "bg-purple-50" },
];

const categories = [
  { name: "Fashion", icon: <Shirt className="text-pink-500 w-4 h-4" /> },
  { name: "Tech", icon: <Smartphone className="text-blue-500 w-4 h-4" /> },
  { name: "Food", icon: <UtensilsCrossed className="text-orange-500 w-4 h-4" /> },
  { name: "Digital", icon: <Box className="text-blue-500 w-4 h-4" /> },
  { name: "Beauty", icon: <Lightbulb className="text-pink-400 w-4 h-4" /> },
  { name: "Services", icon: <Briefcase className="text-green-500 w-4 h-4" /> },
];

export default function SocialProof() {
  return (
    <section className={`${font.className} px-6 py-10 max-w-7xl mx-auto space-y-12`}>
      
      {/* Trending Stores Section */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">Trending Stores</h2>
          <div className="flex gap-2">
            <button className="p-2 border rounded-full hover:bg-gray-50 text-gray-400">←</button>
            <button className="p-2 border rounded-full hover:bg-gray-50 text-gray-400">→</button>
          </div>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
          {trendingStores.map((item, i) => (
            <div
              key={i}
              className="min-w-[220px] p-5 border border-gray-100 rounded-2xl flex items-center gap-4 bg-white shadow-sm"
            >
              <div className={`p-3 rounded-full ${item.bg}`}>
                {item.icon}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-800 leading-tight">{item.name}</span>
                <span className="text-xs font-semibold text-green-600 mt-1">{item.sales}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Categories Section */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-6">Categories</h2>
        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
          {categories.map((cat, i) => (
            <div
              key={i}
              className="min-w-[160px] p-4 border border-gray-100 rounded-xl flex items-center justify-center gap-3 bg-white hover:shadow-md transition-shadow cursor-pointer"
            >
              {cat.icon}
              <span className="text-sm font-medium text-gray-700">{cat.name}</span>
            </div>
          ))}
        </div>
      </div>

    </section>
  );
}
