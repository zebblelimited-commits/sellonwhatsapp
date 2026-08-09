"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { collection, onSnapshot } from "firebase/firestore";
import { Plus_Jakarta_Sans } from "next/font/google";
import StoreCard from "./StoreCard";
import { db } from "@/lib/firebase";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

type HeroSlide = {
  id: string;
  eyebrow: string;
  titleBefore: string;
  highlight: string;
  titleAfter: string;
  description: string;
  imageUrl: string;
  primaryLabel: string;
  primaryUrl: string;
  secondaryLabel: string;
  secondaryUrl: string;
  isActive: boolean;
  sortOrder: number;
};

const fallbackSlides: HeroSlide[] = [
  {
    id: "fallback-1",
    eyebrow: "Join 10,000+ vendors already selling",
    titleBefore: "Sell on",
    highlight: "WhatsApp",
    titleAfter: "like a real online store",
    description: "Create your mini storefront and sell products instantly without a website.",
    imageUrl: "",
    primaryLabel: "Start Selling",
    primaryUrl: "/register",
    secondaryLabel: "See Demo",
    secondaryUrl: "/how-it-works",
    isActive: true,
    sortOrder: 1,
  },
  {
    id: "fallback-2",
    eyebrow: "Everything you need to grow",
    titleBefore: "Turn",
    highlight: "WhatsApp",
    titleAfter: "into your business engine",
    description: "Manage products, orders, and customers directly from your phone.",
    imageUrl: "",
    primaryLabel: "Start Selling",
    primaryUrl: "/register",
    secondaryLabel: "See Demo",
    secondaryUrl: "/how-it-works",
    isActive: true,
    sortOrder: 2,
  },
  {
    id: "fallback-3",
    eyebrow: "Your store is minutes away",
    titleBefore: "Start selling in",
    highlight: "under 2 minutes",
    titleAfter: "",
    description: "No coding, no setup stress. Just create and share your store link.",
    imageUrl: "",
    primaryLabel: "Create Store",
    primaryUrl: "/register",
    secondaryLabel: "See Demo",
    secondaryUrl: "/how-it-works",
    isActive: true,
    sortOrder: 3,
  },
];

const stores = [
  {
    id: "ada-store",
    name: "Ada Store",
    username: "adastore",
    category: "Fashion",
    price: "₦25,000",
    coverImage: "https://images.unsplash.com/photo-1521334884684-d80222895322",
    logo: "https://randomuser.me/api/portraits/women/44.jpg",
  },
  {
    id: "tech-hub",
    name: "Tech Hub",
    username: "techhub",
    category: "Gadgets",
    price: "₦45,000",
    coverImage: "https://images.unsplash.com/photo-1518770660439-4636190af475",
    logo: "https://randomuser.me/api/portraits/men/32.jpg",
  },
  {
    id: "food-express",
    name: "Food Express",
    username: "foodexpress",
    category: "Food",
    price: "₦3,500",
    coverImage: "https://images.unsplash.com/photo-1504674900247-0877df9cc836",
    logo: "https://randomuser.me/api/portraits/men/65.jpg",
  },
];

const features = [
  { icon: "/icons/globe.svg", text: "No website needed" },
  { icon: "/icons/flash.svg", text: "Instant payments" },
  { icon: "/icons/mobilephone.svg", text: "Mobile optimized" },
  { icon: "/icons/headphones.svg", text: "24/7 support" },
];

function normalizeSlide(id: string, data: Record<string, unknown>): HeroSlide {
  return {
    id,
    eyebrow: typeof data.eyebrow === "string" ? data.eyebrow : fallbackSlides[0].eyebrow,
    titleBefore: typeof data.titleBefore === "string" ? data.titleBefore : fallbackSlides[0].titleBefore,
    highlight: typeof data.highlight === "string" ? data.highlight : fallbackSlides[0].highlight,
    titleAfter: typeof data.titleAfter === "string" ? data.titleAfter : fallbackSlides[0].titleAfter,
    description: typeof data.description === "string" ? data.description : fallbackSlides[0].description,
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
    primaryLabel: typeof data.primaryLabel === "string" ? data.primaryLabel : "Start Selling",
    primaryUrl: typeof data.primaryUrl === "string" ? data.primaryUrl : "/register",
    secondaryLabel: typeof data.secondaryLabel === "string" ? data.secondaryLabel : "See Demo",
    secondaryUrl: typeof data.secondaryUrl === "string" ? data.secondaryUrl : "/how-it-works",
    isActive: data.isActive !== false,
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
  };
}

export default function Hero() {
  const [slides, setSlides] = useState<HeroSlide[]>(fallbackSlides);
  const [slideIndex, setSlideIndex] = useState(0);
  const [storeIndex, setStoreIndex] = useState(0);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "hero_slides"),
      (snapshot) => {
        const activeSlides = snapshot.docs
          .map((item) => normalizeSlide(item.id, item.data()))
          .filter((slide) => slide.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        if (activeSlides.length > 0) setSlides(activeSlides);
      },
      (error) => {
        console.warn("Homepage hero slides could not be loaded; using fallback content.", error);
      },
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setSlideIndex((current) => (current + 1) % slides.length), 6000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  useEffect(() => {
    const timer = window.setInterval(() => setStoreIndex((current) => (current + 1) % stores.length), 6000);
    return () => window.clearInterval(timer);
  }, []);

  const activeSlideIndex = slideIndex % slides.length;
  const slide = slides[activeSlideIndex] || slides[0];
  const store = stores[storeIndex];

  return (
    <section className={`${jakarta.className} relative min-h-0 w-full max-w-none overflow-hidden px-4 pb-8 pt-3 sm:px-8 sm:pb-12 sm:pt-5 md:min-h-[680px] md:pb-16 md:pt-8 lg:px-12 lg:pt-10 xl:px-20`}>
      <div className="mx-auto grid min-h-0 w-full max-w-none grid-cols-1 items-center gap-10 sm:gap-12 lg:min-h-[600px] lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="flex w-full min-w-0 flex-col items-center md:items-start">
          <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#e0f2e9] bg-[#f0f9f4] px-3 py-2 text-center">
            <Image src="/icons/group.svg" width={14} height={14} alt="vendors" />
            <span className="text-[11px] font-bold text-[#00a63e]">{slide.eyebrow}</span>
          </div>

          <h1 className="mt-5 w-full max-w-4xl text-center text-3xl font-extrabold leading-[1.08] tracking-tight text-gray-900 sm:mt-6 sm:text-4xl md:text-left lg:text-5xl xl:text-6xl">
            {slide.titleBefore}{" "}
            <span className="text-[#00a63e]">{slide.highlight}</span>{" "}
            {slide.titleAfter}
          </h1>

          <p className="mt-5 w-full max-w-xl text-center text-sm leading-relaxed text-gray-500 sm:mt-6 sm:text-base md:text-left">{slide.description}</p>

          <div className="mt-7 flex w-full flex-col justify-center gap-3 sm:mt-8 sm:w-auto sm:flex-row md:justify-start">
            <Link href={slide.primaryUrl} className="flex w-full items-center justify-center rounded-2xl bg-[#00a63e] px-8 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[#008f35] sm:w-auto">{slide.primaryLabel}</Link>
            <Link href={slide.secondaryUrl} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white px-8 py-3 text-sm font-bold text-gray-900 shadow-sm transition-all hover:bg-gray-50 sm:w-auto">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-900"><span className="ml-0.5 h-0 w-0 border-b-[3px] border-l-[6px] border-t-[3px] border-b-transparent border-l-gray-900 border-t-transparent" /></span>
              {slide.secondaryLabel}
            </Link>
          </div>

          <div className="mt-7 flex gap-2 sm:mt-8" aria-label="Hero slides">
            {slides.map((item, index) => <button key={item.id} type="button" onClick={() => setSlideIndex(index)} aria-label={`Show hero slide ${index + 1}`} className={`h-1.5 rounded-full transition-all ${index === activeSlideIndex ? "w-8 bg-[#00a63e]" : "w-1.5 bg-gray-200"}`} />)}
          </div>

          <div className="mt-10 grid w-full grid-cols-2 gap-3 sm:mt-12 sm:flex sm:gap-x-5 md:overflow-visible">
            {features.map((item) => <div key={item.text} className="flex min-w-0 items-center gap-2"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f0f9f4]"><Image src={item.icon} width={14} height={14} alt="" style={{ filter: "invert(41%) sepia(98%) saturate(1450%) hue-rotate(118deg) brightness(95%) contrast(101%)" }} /></div><p className="truncate text-[10px] font-bold leading-[1.2] text-gray-500">{item.text}</p></div>)}
          </div>
        </div>

        <div className="relative flex min-h-0 w-full items-center justify-center px-0 pb-8 pt-2 sm:min-h-[420px] sm:pb-0 sm:pt-0">
          {slide.imageUrl && <div className="absolute inset-0 rounded-[48px] bg-cover bg-center opacity-10" style={{ backgroundImage: `url(${slide.imageUrl})` }} aria-hidden="true" />}
          <div className="relative w-full max-w-[520px]"><StoreCard store={store} /></div>
          <div className="absolute bottom-0 flex gap-2 sm:-bottom-4">
            {stores.map((item, index) => <button key={item.id} type="button" onClick={() => setStoreIndex(index)} aria-label={`Show ${item.name}`} className={`h-1.5 rounded-full transition-all ${index === storeIndex ? "w-6 bg-[#00a63e]" : "w-1.5 bg-gray-200"}`} />)}
          </div>
        </div>
      </div>
    </section>
  );
}
