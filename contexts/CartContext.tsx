"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { auth } from "@/lib/firebase"; // ✅ Ensure this path matches your firebase config
import { onAuthStateChanged } from "firebase/auth";

export type CartItem = {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  storeId: string;
  storeName: string;
  username?: string;
};

type CartContextType = {
  items: CartItem[];
  isOpen: boolean;
  cartCount: number;
  cartTotal: number;
  toggleCart: () => void;
  addToCart: (item: Omit<CartItem, "quantity">) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // 1. Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem("sellonwhatsapp_cart");
    if (savedCart) {
      try {
        setItems(JSON.parse(savedCart));
      } catch (e) {
        console.error("Failed to parse cart", e);
      }
    }
  }, []);

  // 2. Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("sellonwhatsapp_cart", JSON.stringify(items));
  }, [items]);

  // ✅ 3. NEW: Clear cart when user logs out or switches accounts
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // User logged out, clear the cart state and storage
        setItems([]);
        localStorage.removeItem("sellonwhatsapp_cart");
      }
    });
    return () => unsubscribe();
  }, []);

  const toggleCart = () => setIsOpen((prev) => !prev);

  const addToCart = (newItem: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.productId === newItem.productId);
      if (existing) {
        return prev.map((item) =>
          item.productId === newItem.productId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...newItem, quantity: 1 }];
    });
    setIsOpen(true); // Auto-open cart when item is added
  };

  const removeFromCart = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => setItems([]);

  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, isOpen, cartCount, cartTotal, toggleCart, addToCart, removeFromCart, updateQuantity, clearCart }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
}