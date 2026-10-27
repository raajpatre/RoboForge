import Link from "next/link";
import { notFound } from "next/navigation";
import { formatINR } from "@/lib/domain/money";
import { getPublicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { buttonVariants } from "@/components/ui/button";
import { OrderActions } from "./order-actions";
import type { DeliveryStatus, ShippingAddress } from "@/types/domain";
import {
  ArrowLeft,
  Package,
  CreditCard,
  FileText,
  User,
} from "lucide-react";

import { requireAdminUser } from "@/lib/auth/admin-guard";
import { getMockOrderById, getMockOrderByCode, getMockRefundsByOrderId } from "@/lib/domain/mock-store";

interface OrderDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export const metadata = {
  title: "Inspect Order | RoboForge Admin",
};

export default async function AdminOrderDetailPage({ params }: OrderDetailPageProps) {
  // Strict admin authorization guard
  await requireAdminUser();

  const { id } = await params;
  const publicEnv = getPublicEnv();
  const isPlaceholderDb = publicEnv.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  let orderData: {
    id: string;
    order_code: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    shipping_address: ShippingAddress;
    subtotal_paise: number;
    tax_paise: number;
    shipping_paise: number;
    total_paise: number;
    payment_status: string;
    delivery_status: DeliveryStatus;
    refund_status?: "pending" | "processed" | "failed" | null;
    razorpay_order_id: string | null;
    razorpay_payment_id: string | null;
    created_at: string;
    items: Array<{
      product_name: string;
      unit_price_paise: number;
      tax_rate_bps: number;
      quantity: number;
      total_paise: number;
    }>;
  } | null = null;

  if (isPlaceholderDb) {
    const mock = getMockOrderById(id) || getMockOrderByCode(id);
    if (mock) {
      const mockRefunds = getMockRefundsByOrderId(mock.id);
      orderData = {
        id: mock.id,
        order_code: mock.order_code,
        customer_name: mock.customer_name,
        customer_email: mock.customer_email,
        customer_phone: mock.customer_phone,
        shipping_address: mock.shipping_address as unknown as ShippingAddress,
        subtotal_paise: mock.subtotal_paise,
        tax_paise: mock.tax_paise,
        shipping_paise: mock.shipping_paise,
        total_paise: mock.total_paise,
        payment_status: mock.payment_status,
        delivery_status: mock.delivery_status as DeliveryStatus,
        refund_status: mock.refund_status || (mockRefunds.length > 0 ? mockRefunds[mockRefunds.length - 1].status : null),
        razorpay_order_id: mock.razorpay_order_id || null,
        razorpay_payment_id: mock.razorpay_payment_id || null,
        created_at: mock.created_at,
        items: mock.items.map((item) => ({
          product_name: item.name,
          unit_price_paise: item.unitPricePaise,
          tax_rate_bps: item.taxRateBps,
          quantity: item.quantity,
          total_paise: item.totalPaise,
        })),
      };
    }
  } else {
    try {
      const admin = createAdminClient();
      const { data: order, error } = await admin
        .from("orders")
        .select("*, order_items(*), refunds(*)")
        .eq("id", id)
        .maybeSingle();

      if (!error && order) {
        interface DbRefund {
          status: "pending" | "processed" | "failed";
        }
        interface DbOrderItem {
          product_name_snapshot: string;
          unit_price_paise_snapshot: number;
          tax_rate_bps_snapshot: number;
          quantity: number;
          total_paise_snapshot: number;
        }

        const rawRefunds = (order as unknown as { refunds?: DbRefund[] }).refunds || [];
        let refundStatus: "pending" | "processed" | "failed" | null = null;
        if (rawRefunds.length > 0) {
          refundStatus = rawRefunds[rawRefunds.length - 1].status;
        }

        const rawItems = (order as unknown as { order_items?: DbOrderItem[] }).order_items || [];

        orderData = {
          id: order.id,
          order_code: order.order_code,
          customer_name: order.customer_name,
          customer_email: order.customer_email,
          customer_phone: order.customer_phone,
          shipping_address: order.shipping_address as unknown as ShippingAddress,
          subtotal_paise: Number(order.subtotal_paise),
          tax_paise: Number(order.tax_paise),
          shipping_paise: Number(order.shipping_paise),
          total_paise: Number(order.total_paise),
          payment_status: order.payment_status,
          delivery_status: order.delivery_status as DeliveryStatus,
          refund_status: refundStatus,
          razorpay_order_id: order.razorpay_order_id,
          razorpay_payment_id: order.razorpay_payment_id,
          created_at: order.created_at,
          items: rawItems.map((item) => ({
            product_name: item.product_name_snapshot,
            unit_price_paise: Number(item.unit_price_paise_snapshot),
            tax_rate_bps: Number(item.tax_rate_bps_snapshot),
            quantity: Number(item.quantity),
            total_paise: Number(item.total_paise_snapshot),
          })),
        };
      }
    } catch (err) {
      console.error("Failed to query order inspector:", err);
    }
  }

  if (!orderData) {
    notFound();
  }

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/60">
        <div>
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to All Orders</span>
          </Link>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Order Inspection: <code className="font-mono text-lg font-bold">{orderData.order_code}</code>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Placed on {new Date(orderData.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(orderData.payment_status === "paid" || orderData.delivery_status === "delivered") && (
            <a
              href={`/api/admin/orders/${orderData.id}/invoice`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${buttonVariants({
                variant: "outline",
                size: "sm",
              })} font-mono text-xs gap-1.5`}
            >
              <FileText className="size-3.5 text-primary" />
              <span>Download Tax Invoice (PDF)</span>
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Columns: Customer, Items, Financial Breakdown */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer & Shipping Card */}
          <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
            <h2 className="font-heading text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <User className="size-4 text-primary" />
              Customer Identity & Consignee Destination
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <span className="text-[11px] uppercase text-muted-foreground">Full Name</span>
                <p className="font-sans font-bold text-sm text-foreground mt-0.5">
                  {orderData.customer_name}
                </p>
              </div>
              <div>
                <span className="text-[11px] uppercase text-muted-foreground">Phone Number</span>
                <p className="text-foreground mt-0.5">{orderData.customer_phone}</p>
              </div>
              <div>
                <span className="text-[11px] uppercase text-muted-foreground">Email Address</span>
                <p className="text-foreground mt-0.5">{orderData.customer_email}</p>
              </div>
              <div>
                <span className="text-[11px] uppercase text-muted-foreground">Destination State</span>
                <p className="text-foreground mt-0.5">
                  {orderData.shipping_address.state} (PIN: {orderData.shipping_address.postal_code})
                </p>
              </div>
              <div className="sm:col-span-2 pt-2 border-t border-border/60">
                <span className="text-[11px] uppercase text-muted-foreground">Delivery Street Address</span>
                <p className="font-sans text-foreground mt-0.5 leading-relaxed">
                  {orderData.shipping_address.line1}
                  {orderData.shipping_address.line2 ? `, ${orderData.shipping_address.line2}` : ""}
                  <br />
                  {orderData.shipping_address.city}, {orderData.shipping_address.state} - {orderData.shipping_address.postal_code}
                </p>
              </div>
            </div>
          </div>

          {/* Ordered Line Items Card */}
          <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
            <h2 className="font-heading text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <Package className="size-4 text-primary" />
              Hardware Line Items Snapshot
            </h2>

            <div className="divide-y divide-border/60">
              {orderData.items.map((item, idx) => (
                <div key={idx} className="py-3 flex items-center justify-between text-xs font-mono">
                  <div>
                    <p className="font-sans font-bold text-sm text-foreground">
                      {item.product_name}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Rate: {formatINR(item.unit_price_paise)} • GST: {item.tax_rate_bps / 100}%
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-foreground text-sm">
                      {formatINR(item.total_paise)}
                    </span>
                    <p className="text-[11px] text-muted-foreground">Qty: {item.quantity}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Financial Totals */}
            <div className="mt-4 pt-4 border-t border-border/60 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-muted-foreground">
                <span>Taxable Subtotal:</span>
                <span>{formatINR(orderData.subtotal_paise)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>GST (18%):</span>
                <span>{formatINR(orderData.tax_paise)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Freight Logistics:</span>
                <span>{formatINR(orderData.shipping_paise)}</span>
              </div>
              <div className="flex justify-between text-sm font-black text-foreground pt-2 border-t border-border/60">
                <span>Grand Total:</span>
                <span>{formatINR(orderData.total_paise)}</span>
              </div>
            </div>
          </div>

          {/* Gateway Settlement Card */}
          <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
            <h2 className="font-heading text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <CreditCard className="size-4 text-primary" />
              Payment Gateway Telemetry
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <span className="text-[11px] uppercase text-muted-foreground">Razorpay Order ID</span>
                <p className="text-foreground mt-0.5 break-all">
                  {orderData.razorpay_order_id || "N/A"}
                </p>
              </div>
              <div>
                <span className="text-[11px] uppercase text-muted-foreground">Razorpay Payment ID</span>
                <p className="text-foreground mt-0.5 break-all">
                  {orderData.razorpay_payment_id || "Awaiting Capture"}
                </p>
              </div>
              <div>
                <span className="text-[11px] uppercase text-muted-foreground">Payment State</span>
                <p className="mt-0.5 capitalize font-bold text-emerald-500">
                  {orderData.payment_status}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Actions (Status Update & Refund) */}
        <div>
          <OrderActions
            orderId={orderData.id}
            orderCode={orderData.order_code}
            currentDeliveryStatus={orderData.delivery_status}
            currentPaymentStatus={orderData.payment_status}
            refundStatus={orderData.refund_status}
            totalPaise={orderData.total_paise}
          />
        </div>
      </div>
    </div>
  );
}
