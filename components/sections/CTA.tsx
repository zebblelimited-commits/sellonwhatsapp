"use client";

import { useState } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";

const font = Plus_Jakarta_Sans({ subsets: ["latin"] });
const headingFont = font;

export default function CTA() {
  const [email, setEmail] = useState("");

  return (
    <section className={`${font.className} px-6 py-16`}>
      <div className="max-w-4xl mx-auto bg-lime-100 rounded-2xl p-10 text-center border border-lime-200">

        <h2 className={`${headingFont.className} text-3xl md:text-4xl font-bold`}>
          Start selling smarter on WhatsApp today
        </h2>

        <p className="mt-3 text-gray-700">
          Join thousands of vendors already growing their sales with SellOnWhatsApp
        </p>

        {/* Email form */}
        <div className="mt-6 flex flex-col md:flex-row gap-3 justify-center">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email address"
            className="w-full md:w-[320px] px-4 py-3 rounded-xl border border-gray-300 outline-none focus:ring-2 focus:ring-lime-500 bg-white"
          />

          <button className="px-6 py-3 rounded-xl bg-lime-600 hover:bg-lime-700 text-white font-medium transition">
            Get Early Access
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          No spam. Just updates about your store growth tools.
        </p>
      </div>
    </section>
  );
}