"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/context/cart-context";
import { validateCartAction, type CartValidationResult } from "@/app/actions/cart";
import { formatINR } from "@/lib/domain/money";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  ShoppingCart,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  ShieldCheck,
  Truck,
  RotateCcw,
} from "lucide-react";

export default function CartPage() {
  const { items, updateQuantity, removeItem, clearCart, isHydrated } = useCart();
  const [isPending, startTransition] = useTransition();
  const [validationResult, setValidationResult] = useState<CartValidationResult | null>(null);

  // Trigger server-authoritative pricing & inventory validation whenever items change
  useEffect(() => {
    if (!isHydrated || items.length === 0) return;

    startTransition(async () => {
      const payload = items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      }));
      const res = await validateCartAction(payload);
      setValidationResult(res);
    });
  }, [items, isHydrated]);

  if (!isHydrated) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-20 text-center">
        <div className="inline-block size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="mt-4 text-xs font-mono text-muted-foreground">Hydrating verified cart state...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-24 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border">
          <ShoppingCart className="size-8" />
        </div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground mt-6">
          Your Cart is Empty
        </h1>
        <div className="mt-6">
          <Link
            href="/products"
            id="empty-cart-browse-button"
            className={buttonVariants({ size: "lg", className: "font-mono" })}
          >
            <ArrowLeft className="mr-2 size-4" />
            Explore Catalog
          </Link>
        </div>
      </div>
    );
  }

  const totals = validationResult?.totals;
  const hasStockIssues = validationResult?.hasStockIssues ?? false;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Page Title */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Your Cart
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Prices and stock availability are validated server-side in real time.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={clearCart}
          className="text-xs font-mono text-muted-foreground hover:text-destructive self-start sm:self-auto"
        >
          <Trash2 className="mr-1.5 size-3.5" />
          Clear Cart
        </Button>
      </div>

      {/* Stock Conflict Banner */}
      {hasStockIssues && (
        <div className="mb-8 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="size-5 shrink-0 mt-0.5" />
          <div className="text-xs">
            <strong className="font-semibold block">Warehouse Stock Update</strong>
            One or more items in your cart have limited stock. Quantities have been dynamically adjusted to available warehouse inventory.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        {/* Cart Items List */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {items.map((item) => {
            const validated = validationResult?.items.find((v) => v.productId === item.productId);
            const isReduced = validated && !validated.hasSufficientStock;

            return (
              <div
                key={item.productId}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-border/80 bg-card p-4 transition-all"
              >
                {/* Thumbnail & Title */}
                <div className="flex items-center gap-4">
                  <div className="relative size-20 overflow-hidden rounded-lg border border-border bg-muted/40 shrink-0">
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <Link
                      href={`/products/${item.slug}`}
                      className="font-heading text-sm font-bold text-foreground hover:underline line-clamp-1"
                    >
                      {item.name}
                    </Link>
                    <span className="font-mono text-xs font-semibold text-foreground block mt-1">
                      {formatINR(item.pricePaise)} each
                    </span>

                    {isReduced && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-600 dark:text-amber-400 mt-1">
                        <AlertTriangle className="size-3" />
                        Only {validated?.availableQuantity} available in warehouse
                      </span>
                    )}
                  </div>
                </div>

                {/* Controls & Subtotal */}
                <div className="flex items-center justify-between w-full sm:w-auto sm:gap-6 pt-3 sm:pt-0 border-t border-border/40 sm:border-none">
                  {/* Quantity Stepper */}
                  <div className="flex items-center rounded-lg border border-border bg-background px-2 py-1">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground px-2 text-sm disabled:opacity-30 cursor-pointer"
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-mono text-xs font-bold text-foreground">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground px-2 text-sm disabled:opacity-30 cursor-pointer"
                      disabled={item.quantity >= 10}
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>

                  {/* Line Total */}
                  <div className="text-right">
                    <span className="font-mono text-sm font-bold text-foreground block">
                      {formatINR(item.pricePaise * item.quantity)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(item.productId)}
                      className="text-[11px] font-mono text-muted-foreground hover:text-destructive mt-0.5 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="mt-2">
            <Link
              href="/products"
              className={buttonVariants({
                variant: "ghost",
                size: "sm",
                className: "font-mono text-xs",
              })}
            >
              <ArrowLeft className="mr-1.5 size-3.5" />
              Continue Browsing Catalog
            </Link>
          </div>
        </div>

        {/* Order Summary Card */}
        <div className="lg:col-span-4">
          <div className="sticky top-24 rounded-xl border border-border/80 bg-card p-6 shadow-xs">
            <h2 className="font-heading text-base font-bold text-foreground">
              Order Summary
            </h2>

            {totals ? (
              <div className="mt-4 space-y-4 text-xs">
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="font-mono text-foreground">{formatINR(totals.subtotalPaise)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground items-center">
                    <span>Shipping</span>
                    {totals.shippingPaise === 0 ? (
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">FREE</span>
                    ) : (
                      <span className="font-mono text-foreground">{formatINR(totals.shippingPaise)}</span>
                    )}
                  </div>
                </div>

                <div className="border-t border-border/40 pt-3 flex items-baseline justify-between">
                  <div>
                    <span className="text-sm font-bold text-foreground block">Estimated Total</span>
                  </div>
                  <span className="font-mono text-2xl font-black text-foreground">
                    {formatINR(totals.totalPaise)}
                  </span>
                </div>

                <div className="pt-4">
                  <Link
                    href="/checkout"
                    id="cart-proceed-checkout-button"
                    className={buttonVariants({
                      size: "lg",
                      className: "w-full font-mono cursor-pointer shadow-sm",
                    })}
                  >
                    Proceed to Checkout
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </div>

                <div className="mt-4 pt-4 border-t border-border/40 space-y-2 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Truck className="size-3.5 text-primary shrink-0" />
                    <span>Razorpay Standard Checkout</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground font-mono">
                {isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <RotateCcw className="size-3.5 animate-spin" />
                    Validating live pricing...
                  </span>
                ) : (
                  "Calculating server totals..."
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
