"use client";

import React, { createContext, useContext, useSyncExternalStore } from "react";
import type { CartItem, ProductCatalogItem } from "@/types/domain";

const STORAGE_KEY = "roboshop_forge_cart_v1";

let cartState: CartItem[] = [];
let isInitialized = false;
let listeners: Array<() => void> = [];

import { FALLBACK_DEMO_PRODUCTS } from "@/lib/demo-products";

function initCart() {
  if (isInitialized || typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Hydrate from stored ID and quantity only; never trust or persist client prices
        cartState = parsed
          .filter(
            (item) =>
              item &&
              typeof item.productId === "string" &&
              typeof item.quantity === "number" &&
              item.quantity > 0
          )
          .map((item) => {
            const preview = FALLBACK_DEMO_PRODUCTS.find((p) => p.id === item.productId);
            return {
              productId: item.productId,
              slug: preview?.slug || "",
              name: preview?.name || "Hardware Component",
              pricePaise: preview?.price_paise || 0,
              imageUrl: preview?.image_url || "",
              quantity: Math.min(10, Math.max(1, item.quantity)),
              availableQuantity: preview?.available_quantity || 1,
            };
          });
      }
    }
  } catch (e) {
    console.warn("Failed to read cart from localStorage:", e);
  }
  isInitialized = true;
}

function notify() {
  if (typeof window !== "undefined") {
    try {
      // Strictly persist ONLY product IDs and quantities — never trust saved prices!
      const storageItems = cartState.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storageItems));
    } catch (e) {
      console.warn("Failed to write cart to localStorage:", e);
    }
  }
  for (const listener of listeners) {
    listener();
  }
}

const EMPTY_CART_ITEMS: CartItem[] = [];

export const cartStore = {
  subscribe(listener: () => void) {
    initCart();
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
  getSnapshot(): CartItem[] {
    initCart();
    return cartState;
  },
  getServerSnapshot(): CartItem[] {
    return EMPTY_CART_ITEMS;
  },
  addItem(product: ProductCatalogItem, quantity = 1) {
    initCart();
    const existingIndex = cartState.findIndex((item) => item.productId === product.id);

    if (existingIndex > -1) {
      const updated = [...cartState];
      const newQty = Math.min(10, updated[existingIndex].quantity + quantity);
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: newQty,
        availableQuantity: product.available_quantity,
      };
      cartState = updated;
    } else {
      cartState = [
        ...cartState,
        {
          productId: product.id,
          slug: product.slug,
          name: product.name,
          pricePaise: product.price_paise,
          imageUrl: product.image_url,
          quantity: Math.min(10, Math.max(1, quantity)),
          availableQuantity: product.available_quantity,
        },
      ];
    }
    notify();
  },
  updateQuantity(productId: string, quantity: number) {
    initCart();
    if (quantity <= 0) {
      cartStore.removeItem(productId);
      return;
    }

    cartState = cartState.map((item) =>
      item.productId === productId
        ? { ...item, quantity: Math.min(10, Math.max(1, quantity)) }
        : item
    );
    notify();
  },
  removeItem(productId: string) {
    initCart();
    cartState = cartState.filter((item) => item.productId !== productId);
    notify();
  },
  clearCart() {
    cartState = [];
    notify();
  },
};

interface CartContextType {
  items: CartItem[];
  addItem: (product: ProductCatalogItem, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  totalCount: number;
  subtotalPaise: number;
  isHydrated: boolean;
}

let isHydratedState = false;
const hydrationListeners = new Set<() => void>();

function subscribeHydration(onStoreChange: () => void) {
  hydrationListeners.add(onStoreChange);
  if (!isHydratedState && typeof window !== "undefined") {
    isHydratedState = true;
    queueMicrotask(() => {
      hydrationListeners.forEach((l) => l());
    });
  }
  return () => {
    hydrationListeners.delete(onStoreChange);
  };
}

function getHydrationSnapshot() {
  return isHydratedState;
}

function getHydrationServerSnapshot() {
  return false;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const isHydrated = useSyncExternalStore(
    subscribeHydration,
    getHydrationSnapshot,
    getHydrationServerSnapshot
  );

  const rawItems = useSyncExternalStore(
    cartStore.subscribe,
    cartStore.getSnapshot,
    cartStore.getServerSnapshot
  );

  // During SSR and initial hydration pass, items is empty to guarantee HTML parity.
  // After hydration completes, real items from localStorage are seamlessly populated.
  const items = isHydrated ? rawItems : EMPTY_CART_ITEMS;
  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalPaise = items.reduce((sum, item) => sum + item.pricePaise * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem: cartStore.addItem,
        updateQuantity: cartStore.updateQuantity,
        removeItem: cartStore.removeItem,
        clearCart: cartStore.clearCart,
        totalCount,
        subtotalPaise,
        isHydrated,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
