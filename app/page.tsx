import { font } from "@/lib/fonts";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

import Hero from "@/components/sections/Hero";
import TrendingStores from "@/components/sections/TrendingStores";
import Categories from "@/components/sections/Categories";
import NewStores from "@/components/sections/NewStores";
import Features from "@/components/sections/Features";
import Testimonials from "@/components/sections/Testimonials";
import CTA from "@/components/sections/CTA";

export default function Page() {
  return (
    <main className={`${font.className} bg-gradient-to-b from-white to-gray-50 text-gray-900`}>
      <Header/>
      <Hero/>
      <TrendingStores/>
      <Categories/>
      <NewStores/>
      <Features/>
      <Testimonials/>
      <CTA/>
      <Footer/>
    </main>
  );
}