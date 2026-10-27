"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatINR } from "@/lib/domain/money";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicOrderTrackingResult } from "@/types/domain";
import {
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  Package,
  Truck,
  Check,
  Copy,
  FileText,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Lock,
  Download,
  Loader2,
} from "lucide-react";

interface TrackOrderClientProps {
  initialCode: string;
  initialConfirmed: boolean;
}

const DELIVERY_STEPS = [
  {
    key: "pending",
    label: "Order Placed",
    desc: "Order token verified & inventory locked",
    icon: Package,
  },

  {
    key: "shipped",
    label: "Dispatched",
    desc: "Handed over to specialized freight logistics",
    icon: Truck,
  },
  {
    key: "delivered",
    label: "Delivered",
    desc: "Package delivered and verified at destination",
    icon: CheckCircle2,
  },
];

export function TrackOrderClient({
  initialCode,
  initialConfirmed,
}: TrackOrderClientProps) {
  const [codeInput, setCodeInput] = useState(initialCode);
  const [order, setOrder] = useState<PublicOrderTrackingResult | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(initialCode));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCelebration, setShowCelebration] = useState(initialConfirmed);
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Initial lookup if code was present in URL query
  useEffect(() => {
    if (!initialCode) return;

    let active = true;
    async function fetchInitial() {
      try {
        const res = await fetch("/api/orders/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderCode: initialCode }),
        });
        const data = await res.json();
        if (!active) return;

        if (res.ok && data.success) {
          setOrder(data.order);
          // Scrub token from address bar to prevent bearer credential leakage
          window.history.replaceState(null, "", "/track");
        } else {
          setErrorMessage(data.error || "Order not found. Check your tracking key.");
        }
      } catch {
        if (!active) return;
        setErrorMessage("Network error while looking up order. Please retry.");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    fetchInitial();

    return () => {
      active = false;
    };
  }, [initialCode]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = codeInput.trim().toUpperCase();
    if (!trimmed) {
      setErrorMessage("Please enter an order tracking key.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setShowCelebration(false);

    try {
      const res = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderCode: trimmed }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setOrder(data.order);
        // Never place high-entropy secret bearer token in query string
        window.history.replaceState(null, "", "/track");
      } else {
        setOrder(null);
        setErrorMessage(data.error || "Order not found. Check your tracking key.");
      }
    } catch {
      setOrder(null);
      setErrorMessage("Network error while connecting to tracking service.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleDownloadInvoice = async (code: string) => {
    setIsDownloadingInvoice(true);
    setDownloadError(null);
    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        let msg = "Failed to download invoice.";
        try {
          const data = await res.json();
          msg = data.error || msg;
        } catch {
          // ignore parse error
        }
        setDownloadError(msg);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Invoice-${code}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setDownloadError("Network error while downloading invoice.");
    } finally {
      setIsDownloadingInvoice(false);
    }
  };

  const getDeliveryStepIndex = (status: string) => {
    switch (status) {
      case "pending":
        return 0;
      case "processing":
      case "shipped":
        return 1;
      case "delivered":
        return 2;
      default:
        return 0;
    }
  };

  const getStepTimestamp = (stepKey: string) => {
    if (!order || !order.status_history) return null;
    const match = order.status_history.find((h) => h.status === stepKey);
    return match ? match.timestamp : null;
  };

  const currentStepIndex = order ? getDeliveryStepIndex(order.delivery_status) : 0;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          Track Your Order
        </h1>
        <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
          Enter your order key below to
          know your order status.
        </p>
      </div>

      {/* Manual Input Search Box */}
      <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-6 shadow-sm mb-10">
        <form onSubmit={handleLookup} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Input
              id="track-order-code-input"
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="RBF-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
              className="font-mono text-xs sm:text-sm tracking-wider uppercase pl-3.5 pr-10 h-12 bg-background border-border/70 focus-visible:ring-1 focus-visible:ring-primary"
              disabled={isLoading}
              required
            />
            {codeInput && (
              <button
                type="button"
                onClick={() => setCodeInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
          <button
            id="track-order-submit-btn"
            type="submit"
            disabled={isLoading}
            className={`${buttonVariants({
              variant: "default",
            })} h-12 px-6 font-mono font-semibold gap-2 transition-all shrink-0 cursor-pointer`}
          >
            {isLoading ? (
              <>
                <div className="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <Search className="size-4" />
                <span>Track Order</span>
              </>
            )}
          </button>
        </form>

      </div>

      {/* Error Notice */}
      {errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive flex items-start gap-3 mb-8">
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Lookup Failed</p>
            <p className="text-xs mt-0.5 opacity-90">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Order Results */}
      {order && (
        <div className="space-y-8 animate-in fade-in-50 duration-300">
          {/* Post-Checkout Celebration Banner */}
          {showCelebration && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Sparkles className="size-24 text-emerald-500" />
              </div>
              <div className="flex items-start gap-3.5">
                <div className="size-9 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="size-5" />
                </div>
                <div className="flex-1">
                  <h2 className="font-heading text-lg font-bold text-foreground">
                    Order Placed & Secured!
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
                    RoboForge is zero-account. Your order is secured by a 128-bit
                    cryptographic token. Possession of this key is your sole proof of
                    ownership. Save or bookmark this page now.
                  </p>
                  <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleCopyCode(order.order_code)}
                      className={`${buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })} font-mono text-xs gap-1.5 border-emerald-500/30 bg-background hover:bg-emerald-500/10 cursor-pointer`}
                    >
                      {copied ? (
                        <>
                          <Check className="size-3.5 text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            Copied Key!
                          </span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" />
                          <span>Copy Secret Key</span>
                        </>
                      )}
                    </button>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      Key: <code className="text-foreground">{order.order_code}</code>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top Info Bar */}
          <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/60">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Order Token
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-sm sm:text-base font-bold text-foreground break-all">
                    {order.order_code}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(order.order_code)}
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy Code"
                  >
                    {copied ? (
                      <Check className="size-4 text-emerald-500" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Placed on {new Date(order.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
                </p>
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-2 shrink-0">
                {/* Payment Badge */}
                {order.payment_status === "paid" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" />
                    Payment: Successful
                  </span>
                )}
                {order.payment_status === "pending" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    <Clock className="size-3.5" />
                    Payment: Pending
                  </span>
                )}
                {order.payment_status === "failed" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                    <XCircle className="size-3.5" />
                    Payment: Failed
                  </span>
                )}
                {order.payment_status === "refunded" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                    <RotateCcw className="size-3.5" />
                    Payment: Refunded
                  </span>
                )}

                {/* Delivery Badge */}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-foreground capitalize">
                  <Package className="size-3.5 text-muted-foreground" />
                  Delivery: {order.delivery_status}
                </span>
              </div>
            </div>

            {/* One-time token warning */}
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/8 px-4 py-3">
              <AlertCircle className="size-4.5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-600 dark:text-rose-400 leading-relaxed">
                <span className="font-semibold">Save this token</span> — it&apos;s only shown once. Use it anytime to track your order. You can also download your invoice below.
              </p>
            </div>
          </div>

          {/* Delivery Timeline Stepper */}
          {order.delivery_status === "cancelled" ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
              <XCircle className="size-8 text-rose-500 mx-auto mb-2" />
              <h3 className="font-heading text-lg font-bold text-foreground">
                Order Cancelled
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                This order was cancelled. Reserved inventory was atomically returned to stock.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
              <h3 className="font-heading text-base font-bold text-foreground mb-6 flex items-center gap-2">
                <Truck className="size-4 text-primary" />
                Fulfillment Timeline
              </h3>

              <div className="relative">
                {/* Horizontal progress bar for desktop */}
                <div className="hidden md:block absolute top-6 left-8 right-8 h-0.5 bg-border -z-0">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{
                      width: `${(currentStepIndex / (DELIVERY_STEPS.length - 1)) * 100}%`,
                    }}
                  />
                </div>

                {/* Step Items */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
                  {DELIVERY_STEPS.map((step, idx) => {
                    const isDone = idx < currentStepIndex;
                    const isCurrent = idx === currentStepIndex;
                    const StepIcon = step.icon;

                    return (
                      <div
                        key={step.key}
                        className="flex md:flex-col items-start md:items-center text-left md:text-center gap-4 md:gap-2.5"
                      >
                        {/* Circle Indicator */}
                        <div
                          className={`size-12 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                            isDone
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : isCurrent
                              ? "bg-card text-primary border-primary ring-4 ring-primary/10 font-bold"
                              : "bg-muted/40 text-muted-foreground border-border/60"
                          }`}
                        >
                          {isDone ? (
                            <Check className="size-5" />
                          ) : (
                            <StepIcon className="size-5" />
                          )}
                        </div>

                        {/* Text */}
                        <div>
                          <p
                            className={`text-sm font-semibold ${
                              isCurrent
                                ? "text-foreground font-bold"
                                : isDone
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {step.label}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {step.desc}
                          </p>
                          {(() => {
                            const ts = getStepTimestamp(step.key);
                            if (!ts) return null;
                            return (
                              <p className="text-[10px] font-mono text-primary font-medium mt-1">
                                {new Date(ts).toLocaleString("en-IN", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                  timeZone: "Asia/Kolkata",
                                })} IST
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Recorded Status History Audit Trail */}
                {order.status_history && order.status_history.length > 0 && (
                  <div className="mt-8 pt-5 border-t border-border/60">
                    <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Clock className="size-3.5 text-primary" />
                      Current Status
                    </h4>
                    <div className="space-y-2">
                      {order.status_history.map((entry, idx) => (
                        <div
                          key={`${entry.status}-${entry.timestamp}-${idx}`}
                          className="flex flex-col sm:flex-row sm:items-center justify-between text-xs p-2.5 rounded-lg bg-muted/30 border border-border/40 gap-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-primary shrink-0" />
                            <span className="font-semibold uppercase text-foreground">{entry.status}</span>
                            {entry.notes && (
                              <span className="text-muted-foreground text-[11px]">— {entry.notes}</span>
                            )}
                          </div>
                          <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                            {new Date(entry.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Items Summary & Financial Breakdown */}
          <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
            <h3 className="font-heading text-base font-bold text-foreground mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Package className="size-4 text-primary" />
                Items In This Order
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                {order.items.length} {order.items.length === 1 ? "Product" : "Products"}
              </span>
            </h3>

            <div className="divide-y divide-border/60">
              {order.items.map((item, index) => (
                <div
                  key={`${item.product_name}-${index}`}
                  className="py-3 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-muted/60 flex items-center justify-center text-xs font-mono font-bold text-muted-foreground shrink-0">
                      #{index + 1}
                    </div>
                    <span className="font-medium text-sm text-foreground">
                      {item.product_name}
                    </span>
                  </div>
                  <span className="text-xs font-mono bg-muted px-2.5 py-1 rounded-md text-foreground shrink-0 font-medium">
                    Qty: {item.quantity}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                  Total Order Amount
                </span>

              </div>
              <span className="font-mono text-xl sm:text-2xl font-black text-foreground">
                {formatINR(order.total_paise)}
              </span>
            </div>
          </div>

          {/* Tax Invoice & Customer Actions */}
          <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h4 className="font-heading text-sm font-bold text-foreground flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                Invoice
              </h4>
            </div>

            {order.payment_status === "paid" ? (
              <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
                <button
                  id="download-tax-invoice-btn"
                  type="button"
                  onClick={() => handleDownloadInvoice(order.order_code)}
                  disabled={isDownloadingInvoice}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 shadow-sm transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-50"
                >
                  {isDownloadingInvoice ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>Generating PDF...</span>
                    </>
                  ) : (
                    <>
                      <Download className="size-4" />
                      <span>Download PDF Invoice</span>
                    </>
                  )}
                </button>
                {downloadError && (
                  <span className="text-xs font-mono text-destructive">
                    {downloadError}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-xs font-mono text-muted-foreground italic">
                Awaiting Payment Capture
              </span>
            )}
          </div>

          {/* Zero-PII Privacy Seal */}
          <div className="rounded-2xl border border-border/40 bg-muted/20 p-5 flex items-start gap-3.5">
            <Lock className="size-4.5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">Zero-PII Privacy Guarantee</p>
              <p className="mt-1 leading-relaxed text-sm text-muted-foreground">
                To safeguard our customers against identity leaks, RoboForge strictly
                omits personal names, email addresses, phone numbers, and physical street
                addresses from public order lookup endpoints. Anyone who holds this secret
                order key can verify delivery and invoice records without revealing who purchased it.
              </p>
            </div>
          </div>

          {/* Navigation link */}
          <div className="text-center pt-2">
            <Link
              href="/products"
              className="text-xs font-mono text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
            >
              <span>Explore More Robotics Components</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
