"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import StoreCard from "./StoreCard";
import { Plus_Jakarta_Sans } from "next/font/google";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export default function Hero() {
  const slides = [
    {
      title: <>Sell on <span className="text-[#00a63e]">WhatsApp</span> <br/> like a real online store</>,
      desc: "Create your mini storefront and sell products instantly without a website.",
    },
    {
      title: <>Turn <span className="text-[#00a63e]">WhatsApp</span> into <br/>your business engine</>,
      desc: "Manage products, orders, and customers directly from your phone.",
    },
    {
      title: <>Start selling in <br/>under 2 minutes</>,
      desc: "No coding, no setup stress. Just create and share your store link.",
    },
  ];

  const stores = [
    {
      name: "Ada Store",
      username: "@adastore",
      category: "Fashion",
      price: "₦25,000",
      img: "https://images.unsplash.com/photo-1521334884684-d80222895322",
      logo: "https://randomuser.me/api/portraits/women/44.jpg",
    },
    {
      name: "Tech Hub",
      username: "@techhub",
      category: "Gadgets",
      price: "₦45,000",
      img: "https://images.unsplash.com/photo-1518770660439-4636190af475",
      logo: "https://randomuser.me/api/portraits/men/32.jpg",
    },
    {
      name: "Food Express",
      username: "@foodexpress",
      category: "Food",
      price: "₦3,500",
      img: "https://images.unsplash.com/photo-1504674900247-0877df9cc836",
      logo: "https://randomuser.me/api/portraits/men/65.jpg",
    },
  ];

  const [slideIndex, setSlideIndex] = useState(0);
  const [storeIndex, setStoreIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSlideIndex((p) => (p + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setStoreIndex((p) => (p + 1) % stores.length), 6000);
    return () => clearInterval(t);
  }, []);

  const features = [
    { icon: "/icons/globe.svg", text: "No website needed" },
    { icon: "/icons/flash.svg", text: "Instant payments" },
    { icon: "/icons/mobilephone.svg", text: "Mobile optimized" },
    { icon: "/icons/headphones.svg", text: "24/7 support" },
  ];

  const slide = slides[slideIndex];
  const store = stores[storeIndex];

  return (
    <section className={`${jakarta.className} px-6 py-6 md:py-12 max-w-5xl mx-auto`}>
      <div className="grid md:grid-cols-2 gap-10 items-center">
        
        {/* LEFT HERO TEXT */}
        <div className="flex flex-col items-center md:items-start max-w-[440px]">
          
          {/* Top Pill Badge */}
          <div className="inline-flex items-center gap-2 bg-[#f0f9f4] px-2.5 py-1.5 rounded-full mb-6 border border-[#e0f2e9]">
            <Image src="/icons/group.svg" width={14} height={14} alt="vendors" />
            <span className="text-[11px] font-bold text-[#00a63e]">Join 10,000+ vendors already selling</span>
          </div>

          <h1 className="text-3xl md:text-[42px] font-extrabold leading-[1.1] tracking-tight text-gray-900 text-center md:text-left">
            {slide.title}
          </h1>

          <p className="mt-5 text-gray-500 text-sm md:text-[15px] max-w-[340px] leading-relaxed text-center md:text-left">
            {slide.desc}
          </p>

          <div className="mt-8 flex flex-wrap gap-3 justify-center md:justify-start w-full">
            <button className="px-8 py-3 bg-[#00a63e] hover:bg-[#008f35] text-white rounded-2xl font-bold text-sm transition-all shadow-md">
              Start Selling
            </button>

            <button className="px-8 py-3 border border-gray-100 text-gray-900 rounded-2xl font-bold text-sm flex items-center gap-2 hover:bg-gray-50 bg-white transition-all shadow-sm">
              <div className="w-5 h-5 rounded-full border border-gray-900 flex items-center justify-center">
                <div className="w-0 h-0 border-t-[3px] border-t-transparent border-l-[6px] border-l-gray-900 border-b-[3px] border-b-transparent ml-0.5" />
              </div>
              See Demo
            </button>
          </div>

          {/* Feature Row - Compact and Constrained */}
          {/* Feature Row - Single Horizontal Line */}
          <div className="mt-12 flex flex-row items-center justify-between w-full md:max-w-none overflow-x-auto md:overflow-visible pb-4 md:pb-0 gap-x-4 no-scrollbar">
            {features.map((item, i) => (
              <div key={i} className="flex items-center gap-2.5 shrink-0">
                {/* Icon Container */}
                <div className="w-8 h-8 rounded-full bg-[#f0f9f4] flex items-center justify-center shrink-0">
                  <Image 
                    src={item.icon} 
                    width={14} 
                    height={14} 
                    alt="icon" 
                    style={{ filter: "invert(41%) sepia(98%) saturate(1450%) hue-rotate(118deg) brightness(95%) contrast(101%)" }}
                  />
                </div>
                
                {/* Stacked Text */}
                <p className="text-[10px] font-bold text-gray-500 leading-[1.2] whitespace-pre">
                  {item.text.split(' ').slice(0, 1)} {"\n"} 
                  {item.text.split(' ').slice(1).join(' ')}
                </p>
              </div>
            ))}
          </div>


        </div>

        {/* RIGHT STORE CAROUSEL */}
        <div className="flex flex-col items-center">
          <div className="w-full max-w-[420px]">
            <StoreCard store={store} />
          </div>

          <div className="flex gap-2 mt-8">
            {stores.map((_, i) => (
              <button
                key={i}
                onClick={() => setStoreIndex(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === storeIndex ? "w-6 bg-[#00a63e]" : "w-1.5 bg-gray-200"
                }`}
              />
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
