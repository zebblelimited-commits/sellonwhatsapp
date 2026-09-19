"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { auth } from "@/lib/firebase"; // ✅ Ensure this path matches your firebase config
import { db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { productCheckoutAttributes } from "@/lib/product-checkout-attributes";

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
  description?: string;
  category?: string;
  productType?: string;
  weightKg?: number;
  weight?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  stockCount?: number;
  stock?: number;
};

type CartContextType = {
  items: CartItem[];
  isOpen: boolean;
  cartCount: number;
  cartTotal: number;
  toggleCart: () => void;
  addToCart: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
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
    let active = true;

    const hydrateCart = async () => {
      const savedCart = localStorage.getItem("sellonwhatsapp_cart");
      if (!savedCart) return;

      try {
        const parsed = JSON.parse(savedCart);
        if (!Array.isArray(parsed)) return;

        const hydrated = await Promise.all(parsed.map(async (item) => {
          if (!item || typeof item !== "object" || !item.productId) return item;
          try {
            const productSnapshot = await getDoc(doc(db, "products", String(item.productId)));
            if (!productSnapshot.exists()) return item;
            const product = productSnapshot.data() || {};
            const productType = String(product.productType || item.productType || "physical").toLowerCase();
            const tracksInventory = !["service", "utility", "booking"].includes(productType);
            const stockCount = Number(product.stockCount ?? product.stock);
            const quantity = tracksInventory && Number.isFinite(stockCount)
              ? Math.min(Number(item.quantity) || 1, Math.max(0, stockCount))
              : Number(item.quantity) || 1;
            return quantity > 0
              ? { ...item, ...productCheckoutAttributes(product), productType, stockCount, stock: stockCount, quantity }
              : null;
          } catch {
            return item;
          }
        }));

        if (active) setItems(hydrated.filter(Boolean) as CartItem[]);
      } catch (error) {
        console.error("Failed to parse cart", error);
      }
    };

    void hydrateCart();
    return () => { active = false; };
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

  const addToCart = async (newItem: Omit<CartItem, "quantity"> & { quantity?: number }) => {
    const requestedQuantity = Math.max(1, Math.floor(Number(newItem.quantity) || 1));
    const itemWithoutQuantity = { ...newItem };
    delete itemWithoutQuantity.quantity;
    // Refresh inventory before increasing the cart so a stale product page
    // cannot keep adding units after a seller changes the stock count.
    let latestItem = itemWithoutQuantity;
    try {
      const productSnapshot = await getDoc(doc(db, "products", String(newItem.productId)));
      if (productSnapshot.exists()) {
        const product = productSnapshot.data() || {};
        const stockCount = Number(product.stockCount ?? product.stock);
        latestItem = {
          ...itemWithoutQuantity,
          ...(Number.isFinite(stockCount) ? { stockCount, stock: stockCount } : {}),
          ...(typeof product.productType === "string" ? { productType: product.productType } : {}),
        };
      }
    } catch (error) {
      console.warn("Could not refresh product inventory before adding to cart", error);
    }

    setItems((prev) => {
      const existing = prev.find((item) => item.productId === latestItem.productId);
      const productType = String(latestItem.productType || "physical").toLowerCase();
      const tracksInventory = !["service", "utility", "booking"].includes(productType);
      const latestStock = Number(latestItem.stockCount ?? latestItem.stock);
      if (tracksInventory && Number.isFinite(latestStock) && latestStock <= 0) return prev;

      if (existing) {
        const existingStock = Number(existing.stockCount ?? existing.stock);
        if (tracksInventory && (!Number.isFinite(existingStock) || existing.quantity + requestedQuantity > existingStock)) return prev;
        return prev.map((item) =>
          item.productId === latestItem.productId
            ? { ...item, ...latestItem, quantity: item.quantity + requestedQuantity }
            : item
        );
      }
      if (tracksInventory && Number.isFinite(latestStock) && requestedQuantity > latestStock) return prev;
      return [...prev, { ...latestItem, quantity: requestedQuantity }];
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
    setItems((prev) => prev.flatMap((item) => {
      if (item.productId !== productId) return [item];
      const productType = String(item.productType || "physical").toLowerCase();
      const tracksInventory = !["service", "utility", "booking"].includes(productType);
      const stockCount = Number(item.stockCount ?? item.stock);
      const cappedQuantity = tracksInventory && Number.isFinite(stockCount)
        ? Math.min(quantity, Math.max(0, stockCount))
        : quantity;
      return cappedQuantity > 0 ? [{ ...item, quantity: cappedQuantity }] : [];
    }));
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
