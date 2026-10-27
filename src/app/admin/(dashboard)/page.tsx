import Link from "next/link";
import { formatINR } from "@/lib/domain/money";
import { getPublicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { buttonVariants } from "@/components/ui/button";
import {
  Package,
  ShoppingCart,
  TrendingUp,
  Plus,
  ArrowRight,
  Clock,
  CheckCircle2,
} from "lucide-react";

interface OrderSummaryItem {
  id: string;
  order_code: string;
  customer_name: string;
  customer_email: string;
  total_paise: number;
  payment_status: string;
  delivery_status: string;
  created_at: string;
}

export default async function AdminDashboardPage() {
  const publicEnv = getPublicEnv();
  const isPlaceholderDb = publicEnv.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  let totalRevenuePaise = 0;
  let totalOrdersCount = 0;
  let pendingFulfillmentCount = 0;
  let totalProductsCount = 0;
  let lowStockCount = 0;
  let recentOrders: OrderSummaryItem[] = [];

  if (isPlaceholderDb) {
    totalProductsCount = 0;
    lowStockCount = 0;
    totalOrdersCount = 0;
    pendingFulfillmentCount = 0;
    totalRevenuePaise = 0;
    recentOrders = [];
  } else {
    try {
      const admin = createAdminClient();

      // Query products & inventory
      const { data: products } = await admin
        .from("products_catalog")
        .select("id, available_quantity");

      if (products) {
        totalProductsCount = products.length;
        lowStockCount = products.filter((p) => p.available_quantity <= 5).length;
      }

      // Query orders
      const { data: orders } = await admin
        .from("orders")
        .select("id, order_code, customer_name, customer_email, total_paise, payment_status, delivery_status, created_at")
        .order("created_at", { ascending: false })
        .limit(20);

      if (orders) {
        totalOrdersCount = orders.length;
        recentOrders = orders.slice(0, 8);
        totalRevenuePaise = orders
          .filter((o) => o.payment_status === "paid")
          .reduce((sum, o) => sum + Number(o.total_paise), 0);
        pendingFulfillmentCount = orders.filter(
          (o) => o.payment_status === "paid" && o.delivery_status !== "delivered" && o.delivery_status !== "cancelled"
        ).length;
      }
    } catch (err) {
      console.error("Dashboard query error:", err);
    }
  }

  const metrics = [
    {
      label: "Total Gross Revenue",
      value: formatINR(totalRevenuePaise),
      subtext: "Settled via Razorpay",
      icon: TrendingUp,
      accent: "text-emerald-500",
      bg: "bg-emerald-500/10 border-emerald-500/20",
    },
    {
      label: "Total Orders Placed",
      value: totalOrdersCount.toString(),
      subtext: "Possession-based tracking",
      icon: ShoppingCart,
      accent: "text-primary",
      bg: "bg-primary/10 border-primary/20",
    },
    {
      label: "Pending Shipments",
      value: pendingFulfillmentCount.toString(),
      subtext: "Awaiting assembly / freight",
      icon: Clock,
      accent: "text-amber-500",
      bg: "bg-amber-500/10 border-amber-500/20",
    },
    {
      label: "Active Catalog SKUs",
      value: `${totalProductsCount} (${lowStockCount} low)`,
      subtext: "Industrial robotics hardware",
      icon: Package,
      accent: "text-blue-500",
      bg: "bg-blue-500/10 border-blue-500/20",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Operations & Fulfillment Overview
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Real-time telemetry on revenue, stock & dispatch.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/admin/products/new"
            id="admin-new-product-btn"
            className={`${buttonVariants({
              variant: "default",
              size: "sm",
            })} font-mono text-xs gap-1.5`}
          >
            <Plus className="size-3.5" />
            <span>Add Product</span>
          </Link>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.label}
              className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  {m.label}
                </span>
                <div className={`p-2 rounded-xl border ${m.bg}`}>
                  <Icon className={`size-4 ${m.accent}`} />
                </div>
              </div>

              <div className="mt-4">
                <p className="font-mono text-2xl font-black text-foreground">
                  {m.value}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                  {m.subtext}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Orders Section */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/60">
          <div>
            <h2 className="font-heading text-base font-bold text-foreground">
              Recent Orders
            </h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground font-mono text-[11px] uppercase tracking-wider">
                <th className="pb-3 font-semibold">Order Token</th>
                <th className="pb-3 font-semibold">Customer</th>
                <th className="pb-3 font-semibold text-right">Amount</th>
                <th className="pb-3 font-semibold text-center">Payment</th>
                <th className="pb-3 font-semibold text-center">Fulfillment</th>
                <th className="pb-3 font-semibold text-right">Date</th>
                <th className="pb-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono">
              {recentOrders.map((order) => (
                <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3.5 pr-4 font-bold text-foreground">
                    <span className="truncate block max-w-[150px]">
                      {order.order_code}
                    </span>
                  </td>
                  <td className="py-3.5 pr-4">
                    <p className="font-sans font-medium text-foreground">
                      {order.customer_name}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {order.customer_email}
                    </p>
                  </td>
                  <td className="py-3.5 pr-4 text-right font-black text-foreground">
                    {formatINR(order.total_paise)}
                  </td>
                  <td className="py-3.5 pr-4 text-center">
                    {order.payment_status === "paid" && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="size-3" /> Paid
                      </span>
                    )}
                    {order.payment_status === "pending" && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <Clock className="size-3" /> Pending
                      </span>
                    )}
                    {order.payment_status === "refunded" && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        Refunded
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 pr-4 text-center">
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-foreground border border-border capitalize">
                      {order.delivery_status}
                    </span>
                  </td>
                  <td className="py-3.5 pr-4 text-right text-muted-foreground text-[11px]">
                    {new Date(order.created_at).toLocaleDateString("en-IN")}
                  </td>
                  <td className="py-3.5 text-right">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Inspect
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
