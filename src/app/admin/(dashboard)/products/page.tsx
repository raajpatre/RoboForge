import Link from "next/link";
import { getPublicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { buttonVariants } from "@/components/ui/button";
import { Plus, Package } from "lucide-react";
import { AdminProductsTable, type AdminProductRow } from "./admin-products-table";

export default async function AdminProductsPage() {
  const publicEnv = getPublicEnv();
  const isPlaceholderDb = publicEnv.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  let products: AdminProductRow[] = [];

  if (isPlaceholderDb) {
    products = [];
  } else {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("products")
        .select("*, inventory(stock_on_hand, stock_reserved)")
        .order("name", { ascending: true });

      if (!error && data) {
        products = data.map((d) => {
          const inv = Array.isArray(d.inventory) ? d.inventory[0] : d.inventory;
          const onHand = inv?.stock_on_hand || 0;
          const reserved = inv?.stock_reserved || 0;
          return {
            id: d.id,
            name: d.name,
            slug: d.slug,
            sku: d.sku,
            category: d.category,
            price_paise: Number(d.price_paise),
            image_url: d.image_url,
            hsn_code: d.hsn_code,
            tax_rate_bps: Number(d.tax_rate_bps),
            is_active: d.is_active,
            stock_on_hand: onHand,
            stock_reserved: reserved,
            available_quantity: Math.max(0, onHand - reserved),
          };
        });
      }
    } catch (err) {
      console.error("Failed to query admin products:", err);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/60">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Inventory
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Real-time tracking of stock on hand, checkout reservations, and unit pricing.
          </p>
        </div>

        <Link
          href="/admin/products/new"
          id="admin-add-product-btn"
          className={`${buttonVariants({
            variant: "default",
          })} font-mono text-xs gap-1.5`}
        >
          <Plus className="size-4" />
          <span>Add New Hardware SKU</span>
        </Link>
      </div>

      {/* Interactive Products Table with Search & Sorting */}
      <AdminProductsTable products={products} />
    </div>
  );
}
