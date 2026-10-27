import { requireAdminUser } from "@/lib/auth/admin-guard";
import { getPublicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllMockOrders, getMockRefundsByOrderId } from "@/lib/domain/mock-store";
import { OrdersTableClient, type AdminOrderRow } from "./orders-table-client";
import { ShoppingCart } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Order Fulfillment & Management | RoboForge Admin",
  description: "Administrative order ledger, delivery transitions, and authorized refund management.",
};

export default async function AdminOrdersPage() {
  // 1. Strict Server-side Authentication & Allowlist Guard
  await requireAdminUser();

  const publicEnv = getPublicEnv();
  const isPlaceholderDb = publicEnv.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  let orders: AdminOrderRow[] = [];

  if (isPlaceholderDb) {
    const mockOrders = getAllMockOrders();
    orders = mockOrders.map((order) => {
      const refunds = getMockRefundsByOrderId(order.id);
      let refundStatus: "pending" | "processed" | "failed" | null = null;
      if (order.refund_status) {
        refundStatus = order.refund_status;
      } else if (refunds.length > 0) {
        refundStatus = refunds[refunds.length - 1].status;
      }

      return {
        id: order.id,
        order_code: order.order_code,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        customer_phone: order.customer_phone,
        shipping_address: order.shipping_address as {
          line1?: string;
          city?: string;
          state?: string;
          postal_code?: string;
        },
        total_paise: order.total_paise,
        payment_status: order.payment_status,
        delivery_status: order.delivery_status,
        refund_status: refundStatus,
        items: order.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          totalPaise: item.totalPaise,
        })),
        created_at: order.created_at,
      };
    });
  } else {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("orders")
        .select(`
          id,
          order_code,
          customer_name,
          customer_email,
          customer_phone,
          shipping_address,
          total_paise,
          payment_status,
          delivery_status,
          created_at,
          order_items (
            product_name_snapshot,
            quantity,
            total_paise_snapshot
          ),
          refunds (
            status
          )
        `)
        .order("created_at", { ascending: false });

      interface DbOrderRow {
        id: string;
        order_code: string;
        customer_name: string;
        customer_email: string;
        customer_phone: string;
        shipping_address: Record<string, unknown> | null;
        total_paise: number;
        payment_status: string;
        delivery_status: string;
        created_at: string;
        order_items?: Array<{
          product_name_snapshot: string;
          quantity: number;
          total_paise_snapshot: number;
        }>;
        refunds?: Array<{
          status: "pending" | "processed" | "failed";
        }>;
      }

      if (!error && data) {
        const rows = data as unknown as DbOrderRow[];
        orders = rows.map((row) => {
          const refunds = row.refunds || [];
          let refundStatus: "pending" | "processed" | "failed" | null = null;
          if (refunds.length > 0) {
            refundStatus = refunds[refunds.length - 1].status;
          }

          return {
            id: row.id,
            order_code: row.order_code,
            customer_name: row.customer_name,
            customer_email: row.customer_email,
            customer_phone: row.customer_phone,
            shipping_address: row.shipping_address || {},
            total_paise: Number(row.total_paise),
            payment_status: row.payment_status,
            delivery_status: row.delivery_status,
            refund_status: refundStatus,
            items: (row.order_items || []).map((item) => ({
              name: item.product_name_snapshot,
              quantity: Number(item.quantity),
              totalPaise: Number(item.total_paise_snapshot),
            })),
            created_at: row.created_at,
          };
        });
      }
    } catch (err) {
      console.error("Failed to query admin orders:", err);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/60">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Customer Orders & Fulfillment
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Track decoupled payment settlement, update hardware freight status, and issue tax credit notes.
          </p>
        </div>
      </div>

      {/* Searchable, Filterable, Paginated Table */}
      <OrdersTableClient initialOrders={orders} />
    </div>
  );
}
