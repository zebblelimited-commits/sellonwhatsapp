"use client";

import React from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { 
  Globe, 
  MessageCircle, 
  Zap, 
  Smartphone, 
  Layout, 
  BarChart3 
} from "lucide-react";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function Features() {
  const features = [
    {
      title: "No Website Needed",
      desc: "Run your full store directly on WhatsApp without complex setups.",
      icon: <Globe/>,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      title: "WhatsApp-First",
      desc: "Sell where your customers already are. Turn chats into conversions.",
      icon: <MessageCircle/>,
      iconBg: "bg-green-50",
      iconColor: "text-green-600",
    },
    {
      title: "Instant Payments",
      desc: "Get paid fast with a seamless, automated checkout process.",
      icon: <Zap/>,
      iconBg: "bg-orange-50",
      iconColor: "text-orange-600",
    },
    {
      title: "Mobile Optimized",
      desc: "Built for phone-first business owners. Manage everything on the go.",
      icon: <Smartphone/>,
      iconBg: "bg-purple-50",
      iconColor: "text-purple-600",
    },
    {
      title: "Store Builder",
      desc: "Create your professional store in minutes with zero coding skills.",
      icon: <Layout/>,
      iconBg: "bg-pink-50",
      iconColor: "text-pink-600",
    },
    {
      title: "Track Sales",
      desc: "Monitor your orders, inventory, and revenue in real time.",
      icon: <BarChart3/>,
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
    },
  ];

  return (
    <section className={`${font.className} px-6 py-20 max-w-7xl mx-auto`} id="features">
      <div className="text-center mb-16">
        <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
          Powerful Features
        </h2>
        <p className="text-gray-500 mt-3 max-w-lg mx-auto">
          Everything you need to scale your business on WhatsApp.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {features.map((feature, i) => (
          <div
            key={i}
            style={{ "--hover-bg": "#f7fee7" }} // Custom color variable
            className="p-8 bg-white border border-gray-100 rounded-[32px] transition-all duration-300 cursor-pointer group hover:bg-[#ecfcca] hover:border-[#d9e8b5] hover:shadow-xl hover:-translate-y-2"
          >
            {/* Icon Bubble */}
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-110 group-hover:bg-white ${feature.iconBg} ${feature.iconColor}`}>
              {React.cloneElement(feature.icon, { size: 28 })}
            </div>

            {/* Content */}
            <h3 className="font-bold text-xl text-gray-900 mb-3">
              {feature.title}
            </h3>
            <p className="text-gray-500 leading-relaxed text-sm group-hover:text-gray-800 transition-colors">
              {feature.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
