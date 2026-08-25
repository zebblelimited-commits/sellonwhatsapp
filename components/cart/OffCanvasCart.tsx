"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X, Plus, Minus, Trash2, ShoppingBag, ArrowRight } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { Plus_Jakarta_Sans } from "@/lib/fonts";

const font = Plus_Jakarta_Sans({ subsets: ["latin"] });

export default function OffCanvasCart() {
  const { items, isOpen, toggleCart, removeFromCart, updateQuantity, cartTotal, clearCart } = useCart();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm transition-opacity" 
        onClick={toggleCart} 
      />

      {/* Slide-out Panel */}
      <div className={`fixed inset-y-0 right-0 z-[70] w-full max-w-md bg-white shadow-2xl transform transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className={`flex h-full flex-col ${font.className}`}>
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
              <ShoppingBag size={20} className="text-[#00a63e]" />
              Your Cart ({items.length})
            </h2>
            <button onClick={toggleCart} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 rounded-full bg-gray-50 p-4">
                  <ShoppingBag size={40} className="text-gray-300" />
                </div>
                <p className="text-sm font-bold text-gray-900">Your cart is empty</p>
                <p className="mt-1 text-xs text-gray-500">Looks like you haven't added anything yet.</p>
                <button 
                  onClick={toggleCart} 
                  className="mt-6 rounded-xl bg-[#00a63e] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#008c34] transition-colors"
                >
                  Start Shopping
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item) => (
                  <div key={item.productId} className="flex gap-4 rounded-2xl border border-gray-100 bg-gray-50/50 p-3">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white">
                      <Image src={item.image} alt={item.name} fill className="object-cover" />
                    </div>
                    <div className="flex flex-1 flex-col justify-between">
                      <div>
                        <h3 className="line-clamp-1 text-sm font-bold text-gray-900">{item.name}</h3>
                        <p className="text-[10px] font-medium text-gray-500">{item.storeName}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-extrabold text-[#00a63e]">₦{(item.price * item.quantity).toLocaleString()}</p>
                        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white">
                          <button onClick={() => updateQuantity(item.productId, item.quantity - 1)} className="p-1.5 text-gray-500 hover:text-red-500 transition-colors">
                            {item.quantity === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                          </button>
                          <span className="w-6 text-center text-xs font-bold">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.productId, item.quantity + 1)} className="p-1.5 text-gray-500 hover:text-green-600 transition-colors">
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer / Checkout */}
          {items.length > 0 && (
            <div className="border-t border-gray-100 bg-white px-6 py-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-500">Subtotal</span>
                <span className="text-xl font-black text-gray-900">₦{cartTotal.toLocaleString()}</span>
              </div>
              <p className="mb-4 text-[10px] text-gray-400 text-center">Shipping and taxes calculated at checkout.</p>
              
              <Link 
                href="/checkout" 
                onClick={toggleCart}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-black py-3.5 text-sm font-extrabold text-white transition-all hover:bg-[#00a63e] active:scale-[0.98]"
              >
                Proceed to Checkout <ArrowRight size={16} />
              </Link>
              
              <button 
                onClick={clearCart}
                className="mt-3 w-full text-center text-xs font-bold text-gray-400 hover:text-red-500 transition-colors"
              >
                Clear Cart
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}