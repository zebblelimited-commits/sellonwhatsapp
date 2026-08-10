"use client";

import React, { useEffect, useState } from "react";
import { Plus_Jakarta_Sans } from "@/lib/fonts";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export default function Testimonials() {
  const testimonials = [
    {
      name: "Ada Stores",
      role: "Fashion Vendor",
      text: "I made my first ₦120k in a week!",
      img: "https://i.pravatar.cc/100?img=1",
    },
    {
      name: "Tech Hub NG",
      role: "Electronics Seller",
      text: "Replaced my whole website with this.",
      img: "https://i.pravatar.cc/100?img=2",
    },
    {
      name: "Food Express",
      role: "Food Vendor",
      text: "Orders doubled instantly.",
      img: "https://i.pravatar.cc/100?img=3",
    },
    {
      name: "Bella Style",
      role: "Fashion Brand",
      text: "Easiest way to sell online.",
      img: "https://i.pravatar.cc/100?img=4",
    },
    {
      name: "Zion Gadgets",
      role: "Tech Seller",
      text: "Payments are now stress-free.",
      img: "https://i.pravatar.cc/100?img=5",
    },
    {
      name: "Mama Kitchen",
      role: "Food Business",
      text: "Customers order faster now.",
      img: "https://i.pravatar.cc/100?img=6",
    },
    {
      name: "Digital Plug",
      role: "Digital Seller",
      text: "Selling PDFs is now simple.",
      img: "https://i.pravatar.cc/100?img=7",
    },
    {
      name: "Naija Trends",
      role: "Store Owner",
      text: "Clean UI and real conversions.",
      img: "https://i.pravatar.cc/100?img=8",
    },
  ];

  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % testimonials.length);
    }, 3500);

    return () => clearInterval(interval);
  }, [testimonials.length]);

  const visible = [
    testimonials[index % testimonials.length],
    testimonials[(index + 1) % testimonials.length],
    testimonials[(index + 2) % testimonials.length],
  ];

  return (
    <section className={`${font.className} px-6 py-16 max-w-6xl mx-auto`}>
      {/* Title */}
      <h2 className="text-xl font-bold mb-10 text-center">
        What Vendors Say
      </h2>

      {/* Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        {visible.map((t, i) => (
          <div
            key={i}
            className="bg-white border border-gray-200 rounded-2xl p-6 transition-all cursor-pointer hover:bg-[#f7fee7] hover:border-[#ecfcca] hover:shadow-lg"
          >
            <div className="flex items-center gap-3 mb-4">
              {/* Avatar */}
              <img
                src={t.img}
                alt={t.name}
                className="w-10 h-10 rounded-full object-cover"
              />

              <div>
                <div className="font-semibold text-sm">{t.name}</div>
                <div className="text-xs text-gray-500">{t.role}</div>
              </div>
            </div>

            {/* Text */}
            <p className="text-gray-700 text-sm">"{t.text}"</p>
          </div>
        ))}
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-2 mt-8">
        {testimonials.map((_, i) => (
          <div
            key={i}
            className={`h-2 w-2 rounded-full ${
              i === index ? "bg-green-600" : "bg-gray-300"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
