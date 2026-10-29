"use client";

import { useEffect, useState, useTransition } from "react";
import Script from "next/script";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/cart-context";
import { validateCartAction, type CartValidationResult } from "@/app/actions/cart";
import { initiateCheckoutAction } from "@/app/actions/checkout";
import { verifyPaymentAction } from "@/app/actions/payment";
import { formatINR } from "@/lib/domain/money";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ShieldCheck,
  ArrowLeft,
  Lock,
  CreditCard,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";

declare global {
  interface Window {
    Razorpay?: unknown;
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, clearCart, isHydrated } = useCart();
  const [isPending, startTransition] = useTransition();

  const [validation, setValidation] = useState<CartValidationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State with Bangalore, Karnataka delivery defaults
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    line1: "",
    line2: "",
    city: "Bangalore",
    state: "Karnataka",
    postal_code: "",
  });

  // Server-authoritative totals check
  useEffect(() => {
    if (!isHydrated || items.length === 0) return;

    startTransition(async () => {
      const payload = items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      }));
      const res = await validateCartAction(payload);
      setValidation(res);
    });
  }, [items, isHydrated]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const payload = {
        customer: {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          shippingAddress: {
            line1: formData.line1,
            line2: formData.line2 || undefined,
            city: formData.city,
            state: formData.state,
            postal_code: formData.postal_code,
            country: "India",
          },
        },
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
      };

      const session = await initiateCheckoutAction(payload);

      if (!session.success || !session.orderCode || !session.razorpayOrderId) {
        setErrorMessage(session.error || "Failed to initialize payment session.");
        setIsSubmitting(false);
        return;
      }

      // Check if Razorpay script loaded
      const RazorpayConstructor = window.Razorpay as
        | (new (options: unknown) => { open: () => void })
        | undefined;

      if (!RazorpayConstructor || session.keyId?.includes("placeholder")) {
        // Fallback Test Mode Simulator (handles sandbox environments with placeholder keys)
        const mockSignature = `mock_signature_${Date.now()}`;
        const mockPaymentId = `pay_mock_${Date.now()}`;

        const verification = await verifyPaymentAction({
          orderCode: session.orderCode,
          razorpayOrderId: session.razorpayOrderId,
          razorpayPaymentId: mockPaymentId,
          razorpaySignature: mockSignature,
        });

        if (verification.success) {
          clearCart();
          router.push(`/track?code=${session.orderCode}&confirmed=true`);
        } else {
          setErrorMessage(verification.error || "Test payment verification failed.");
          setIsSubmitting(false);
        }
        return;
      }

      // Standard Razorpay Checkout Modal
      const options = {
        key: session.keyId,
        amount: session.amountPaise,
        currency: "INR",
        name: session.storeName || "RoboForge",
        description: `Robotics Hardware Order ${session.orderCode}`,
        order_id: session.razorpayOrderId,
        handler: async function (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) {
          setIsSubmitting(true);
          const verification = await verifyPaymentAction({
            orderCode: session.orderCode,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });

          if (verification.success) {
            clearCart();
            router.push(`/track?code=${session.orderCode}&confirmed=true`);
          } else {
            setErrorMessage(verification.error || "Server signature verification failed.");
            setIsSubmitting(false);
          }
        },
        prefill: {
          name: session.customer?.name,
          email: session.customer?.email,
          contact: session.customer?.phone,
        },
        theme: {
          color: "#000000",
        },
        modal: {
          ondismiss: function () {
            setIsSubmitting(false);
          },
        },
      };

      const rzpInstance = new RazorpayConstructor(options);
      rzpInstance.open();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred.");
      setIsSubmitting(false);
    }
  };

  if (!isHydrated) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-20 text-center">
        <div className="inline-block size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="mt-4 text-xs font-mono text-muted-foreground">Loading checkout security environment...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container mx-auto max-w-md px-4 py-24 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <CreditCard className="size-6" />
        </div>
        <h1 className="font-heading text-xl font-bold tracking-tight text-foreground mt-4">
          No Items to Checkout
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">
          Your cart is currently empty. Add products from the catalog before proceeding to checkout.
        </p>
        <div className="mt-6">
          <Link
            href="/products"
            className={buttonVariants({ size: "default", className: "font-mono text-xs" })}
          >
            Explore Catalog
          </Link>
        </div>
      </div>
    );
  }

  const totals = validation?.totals;

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div className="container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary font-bold">
              <Lock className="size-3.5" /> 256-Bit Encrypted Checkout
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground mt-1">
              Complete Procurement
            </h1>
          </div>

          <Link
            href="/cart"
            className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors self-start sm:self-auto"
          >
            <ArrowLeft className="size-3.5" />
            Back to Cart
          </Link>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mb-8 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
            <AlertCircle className="size-5 shrink-0 mt-0.5" />
            <div className="text-xs">
              <strong className="font-semibold block">Checkout Interrupted</strong>
              {errorMessage}
            </div>
          </div>
        )}

        {/* Delivery Location Notice */}
        <div className="mb-8 flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3.5 text-red-600 dark:text-red-400 shadow-xs">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-xs sm:text-sm font-bold tracking-wide">
            Currently we deliver in Bangalore Karnataka only
          </p>
        </div>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          {/* Left Column: Customer & Shipping Details Form */}
          <div className="lg:col-span-7">
            <form id="checkout-form" onSubmit={handleCheckoutSubmit} className="space-y-6">
              {/* Customer Contact */}
              <div className="rounded-xl border border-border/80 bg-card p-6 shadow-xs">
                <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-foreground mb-4">
                  1. Contact Information
                </h2>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="customer-name" className="block text-xs font-medium text-foreground mb-1.5">
                      Full Name / Lab Representative *
                    </label>
                    <Input
                      id="customer-name"
                      name="name"
                      type="text"
                      required
                      placeholder="e.g. Dr. Priya Sharma"
                      value={formData.name}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="customer-email" className="block text-xs font-medium text-foreground mb-1.5">
                        Email Address (for Invoice) *
                      </label>
                      <Input
                        id="customer-email"
                        name="email"
                        type="email"
                        required
                        placeholder="priya@robolab.ac.in"
                        value={formData.email}
                        onChange={handleInputChange}
                      />
                    </div>

                    <div>
                      <label htmlFor="customer-phone" className="block text-xs font-medium text-foreground mb-1.5">
                        Mobile Phone (+91) *
                      </label>
                      <Input
                        id="customer-phone"
                        name="phone"
                        type="tel"
                        required
                        placeholder="9876543210"
                        value={formData.phone}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Shipping Address */}
              <div className="rounded-xl border border-border/80 bg-card p-6 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-foreground">
                    2. Delivery Address
                  </h2>
                  <span className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle className="size-3.5 shrink-0" />
                    Currently we deliver in Bangalore Karnataka only
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="address-line1" className="block text-xs font-medium text-foreground mb-1.5">
                      Street Address / Department / Facility *
                    </label>
                    <Input
                      id="address-line1"
                      name="line1"
                      type="text"
                      required
                      placeholder="Robotics Lab, Block C, Innovation Campus"
                      value={formData.line1}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div>
                    <label htmlFor="address-line2" className="block text-xs font-medium text-foreground mb-1.5">
                      Landmark / Gate / Room No. (Optional)
                    </label>
                    <Input
                      id="address-line2"
                      name="line2"
                      type="text"
                      placeholder="Near Gate 2 Loading Dock"
                      value={formData.line2}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="address-city" className="block text-xs font-medium text-foreground mb-1.5">
                        City *
                      </label>
                      <Input
                        id="address-city"
                        name="city"
                        type="text"
                        required
                        placeholder="Bangalore"
                        value={formData.city}
                        onChange={handleInputChange}
                      />
                    </div>

                    <div>
                      <label htmlFor="address-state" className="block text-xs font-medium text-foreground mb-1.5">
                        State *
                      </label>
                      <Input
                        id="address-state"
                        name="state"
                        type="text"
                        required
                        placeholder="Karnataka"
                        value={formData.state}
                        onChange={handleInputChange}
                      />
                    </div>

                    <div>
                      <label htmlFor="address-postal" className="block text-xs font-medium text-foreground mb-1.5">
                        6-Digit PIN Code *
                      </label>
                      <Input
                        id="address-postal"
                        name="postal_code"
                        type="text"
                        required
                        maxLength={6}
                        placeholder="560100"
                        value={formData.postal_code}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit CTA */}
              <div className="pt-2">
                <Button
                  id="pay-razorpay-button"
                  type="submit"
                  size="lg"
                  disabled={isSubmitting || isPending || !totals}
                  className="w-full font-mono text-sm font-bold cursor-pointer shadow-md py-6"
                >
                  {isSubmitting ? (
                    "Opening Secure Payment Gateway..."
                  ) : totals ? (
                    `Pay ${formatINR(totals.totalPaise)} via Razorpay`
                  ) : (
                    "Validating Server Totals..."
                  )}
                </Button>

                <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-muted-foreground font-mono">
                  <ShieldCheck className="size-3.5 text-primary" />
                  <span>Razorpay Standard Checkout</span>
                </div>

                <p className="mt-4 text-center text-[11px] text-muted-foreground leading-relaxed">
                  By clicking Pay, you agree to our{" "}
                  <Link href="/terms" target="_blank" className="text-primary hover:underline font-medium">
                    Terms & Conditions
                  </Link>
                  ,{" "}
                  <Link href="/privacy" target="_blank" className="text-primary hover:underline font-medium">
                    Privacy Policy
                  </Link>
                  , and{" "}
                  <Link href="/shipping-cancellation-refund-policy" target="_blank" className="text-primary hover:underline font-medium">
                    Shipping, Cancellation and Refund Policy
                  </Link>
                  .
                </p>
              </div>
            </form>
          </div>

          {/* Right Column: Order Review Summary */}
          <div className="lg:col-span-5">
            <div className="sticky top-24 rounded-xl border border-border/80 bg-card p-6 shadow-xs">
              <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-foreground pb-4 border-b border-border/50">
                Order Review ({items.length} {items.length === 1 ? "Item" : "Items"})
              </h2>

              <div className="divide-y divide-border/40 max-h-72 overflow-y-auto my-3">
                {items.map((item) => (
                  <div key={item.productId} className="py-3 flex items-center justify-between text-xs">
                    <div className="pr-2">
                      <span className="font-semibold text-foreground line-clamp-1">{item.name}</span>
                      <span className="text-[11px] font-mono text-muted-foreground">Qty: {item.quantity}</span>
                    </div>
                    <span className="font-mono font-bold text-foreground shrink-0">
                      {formatINR(item.pricePaise * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              {totals && (
                <div className="border-t border-border/50 pt-4 space-y-2.5 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal (Excl. Tax)</span>
                    <span className="font-mono text-foreground">{formatINR(totals.subtotalPaise)}</span>
                  </div>

                  <div className="flex justify-between text-muted-foreground">
                    <span>18% GST (Calculated Server-Side)</span>
                    <span className="font-mono text-foreground">{formatINR(totals.taxPaise)}</span>
                  </div>

                  <div className="flex justify-between text-muted-foreground items-center">
                    <span>Insured Transit</span>
                    {totals.shippingPaise === 0 ? (
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">FREE</span>
                    ) : (
                      <span className="font-mono text-foreground">{formatINR(totals.shippingPaise)}</span>
                    )}
                  </div>

                  <div className="border-t border-border/60 pt-3 flex items-baseline justify-between font-bold">
                    <span className="text-sm text-foreground">Total (Paise Exact)</span>
                    <span className="font-mono text-xl text-foreground font-black">
                      {formatINR(totals.totalPaise)}
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-6 rounded-lg bg-muted/40 p-3.5 border border-border/50 space-y-2 text-[11px] text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Clock className="size-3.5 text-primary shrink-0 mt-0.5" />
                  <span>
                    Submitting places an atomic 15-minute warehouse reservation on all components.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Sparkles className="size-3.5 text-primary shrink-0 mt-0.5" />
                  <span>
                    Upon payment confirmation, a 128-bit secret order tracking token is generated for instant status tracking.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
