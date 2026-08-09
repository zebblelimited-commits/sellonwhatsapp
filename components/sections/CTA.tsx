"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus_Jakarta_Sans } from "next/font/google";
import { MessageSquare, ShieldCheck, BarChart3, TrendingUp } from "lucide-react";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const features = [
  {
    title: "WhatsApp Native",
    description: "Run your entire business from WhatsApp",
    icon: <MessageSquare className="h-6 w-6 text-[#00d95f]" />,
  },
  {
    title: "Secure Payments",
    description: "Get paid securely with escrow protection",
    icon: <ShieldCheck className="h-6 w-6 text-[#00d95f]" />,
  },
  {
    title: "Powerful Dashboard",
    description: "Manage products, orders & customers with ease",
    icon: <BarChart3 className="h-6 w-6 text-[#00d95f]" />,
  },
  {
    title: "Grow & Scale",
    description: "Boost your store and reach more customers",
    icon: <TrendingUp className="h-6 w-6 text-[#00d95f]" />,
  },
];

export default function CTA() {
  return (
    <section className={`${font.className} mx-auto w-full max-w-[1800px] space-y-6 px-4 py-8 sm:px-6 lg:px-8`}>
      {/* Top Container: Why SellOnWhatsApp? */}
      <div className="rounded-2xl border border-gray-100 bg-[#fbfdfb] p-6 text-center sm:p-10">
        <h2 className="text-xl font-extrabold text-gray-900 sm:text-2xl">
          Why SellOnWhatsApp?
        </h2>
        <p className="mt-1.5 text-xs font-medium text-gray-500 sm:text-sm">
          Everything you need to grow your business on WhatsApp
        </p>

        {/* Feature Grid */}
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, idx) => (
            <div key={idx} className="flex items-start gap-4 text-left">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50/80 border border-emerald-100">
                {feature.icon}
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  {feature.title}
                </h3>
                <p className="mt-1 text-xs font-medium text-gray-500 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Container: Ready to grow banner */}
      <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-[#053c23] p-6 sm:p-8 md:flex-row md:items-center">
        {/* Left Content: Graphic & Text */}
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          {/* Store Illustration Graphic */}
          <div className="relative h-16 w-16 shrink-0 sm:h-20 sm:w-20">
            <Image
              src="/images/cta-store-icon.svg"
              alt="Store Front Graphic"
              fill
              className="object-contain"
            />
          </div>

          <div>
            <h3 className="text-xl font-extrabold text-white sm:text-2xl">
              Ready to grow your business?
            </h3>
            <p className="mt-1 text-xs font-medium text-emerald-100/80 sm:text-sm">
              Join thousands of sellers already growing with SellOnWhatsApp.
            </p>
          </div>
        </div>

        {/* Right Content: Action Buttons */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row md:mt-0 md:items-center">
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-xl bg-[#00d95f] px-6 py-3 text-xs font-extrabold text-white transition-all hover:bg-[#00a63e] active:scale-95 sm:text-sm"
          >
            Start Selling Now
          </Link>
          <Link
            href="/explore"
            className="inline-flex items-center justify-center rounded-xl border border-white/30 bg-transparent px-6 py-3 text-xs font-bold text-white transition-all hover:bg-white/10 active:scale-95 sm:text-sm"
          >
            Learn More
          </Link>
        </div>
      </div>
    </section>
  );
}