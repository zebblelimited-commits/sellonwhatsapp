"use client";
import React from "react";

export default function BuyerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="min-h-screen bg-[#FAFAFA]">
      {/* This layout will wrap your dashboard, orders, and settings tabs */}
      <main>{children}</main>
      
      {/* You can also move a persistent Bottom Nav here if you want it 
          to stay visible even when navigating to orders/[id] */}
    </section>
  );
}