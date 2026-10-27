import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getPublicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { FALLBACK_DEMO_PRODUCTS } from "@/lib/demo-products";
import { formatINR } from "@/lib/domain/money";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit3, ExternalLink } from "lucide-react";

interface ProductDetailsAdminPageProps {
  params: Promise<{
    id: string;
  }>;
}

export const metadata = {
  title: "Product Overview | RoboForge Admin",
};

export default async function ProductDetailsAdminPage({ params }: ProductDetailsAdminPageProps) {
  const { id } = await params;
  const publicEnv = getPublicEnv();
  const isPlaceholderDb = publicEnv.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  let product: {
    id: string;
    name: string;
    slug: string;
    sku?: string;
    category?: string;
    description: string;
    price_paise: number;
    image_url: string;
    hsn_code: string;
    tax_rate_bps: number;
    is_active: boolean;
    stock_on_hand: number;
    stock_reserved: number;
    created_at?: string;
    updated_at?: string;
  } | null = null;

  if (isPlaceholderDb) {
    const demo = FALLBACK_DEMO_PRODUCTS.find((p) => p.id === id);
    if (demo) {
      product = {
        id: demo.id,
        name: demo.name,
        slug: demo.slug,
        sku: demo.sku || "RBF-ARM-6DOF",
        category: demo.category || "manipulators",
        description: demo.description,
        price_paise: demo.price_paise,
        image_url: demo.image_url,
        hsn_code: demo.hsn_code,
        tax_rate_bps: demo.tax_rate_bps,
        is_active: demo.is_active,
        stock_on_hand: demo.available_quantity + 2,
        stock_reserved: 2,
        created_at: "2026-10-26T00:00:00.000Z",
        updated_at: "2026-10-26T00:00:00.000Z",
      };
    }
  } else {
    try {
      const admin = createAdminClient();
      const { data: prod, error } = await admin
        .from("products")
        .select("*, inventory(stock_on_hand, stock_reserved)")
        .eq("id", id)
        .maybeSingle();

      if (!error && prod) {
        const inv = Array.isArray(prod.inventory) ? prod.inventory[0] : prod.inventory;
        product = {
          id: prod.id,
          name: prod.name,
          slug: prod.slug,
          sku: prod.sku,
          category: prod.category,
          description: prod.description || "",
          price_paise: Number(prod.price_paise),
          image_url: prod.image_url || "",
          hsn_code: prod.hsn_code,
          tax_rate_bps: Number(prod.tax_rate_bps),
          is_active: prod.is_active,
          stock_on_hand: inv?.stock_on_hand || 0,
          stock_reserved: inv?.stock_reserved || 0,
          created_at: prod.created_at,
          updated_at: prod.updated_at,
        };
      }
    } catch (err) {
      console.error("Failed to fetch product for admin details view:", err);
    }
  }

  if (!product) {
    notFound();
  }

  const availableToSell = Math.max(0, product.stock_on_hand - product.stock_reserved);

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300 max-w-5xl">
      {/* Breadcrumb & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/60">
        <div>
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to Products</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
              {product.name}
            </h1>
            {product.is_active ? (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs font-mono">
                Active / Published
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-xs font-mono">
                Inactive / Hidden
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground mt-1">
            <span>SKU: <strong className="text-foreground">{product.sku || "N/A"}</strong></span>
            <span>Category: <strong className="text-foreground">{product.category || "robotics"}</strong></span>
            <span>Slug: <strong className="text-foreground">{product.slug}</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/products/${product.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="size-3.5" />
            <span>View in Storefront</span>
          </Link>

          <Link
            href={`/admin/products/${product.id}/edit`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-mono font-medium hover:bg-primary/90 transition-colors shadow-xs"
          >
            <Edit3 className="size-3.5" />
            <span>Edit Product</span>
          </Link>
        </div>
      </div>

      {/* Grid: Overview & Specs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Image & Core Details */}
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-4 overflow-hidden">
            <div className="relative aspect-4/3 w-full rounded-xl overflow-hidden bg-muted/60 border border-border/50">
              {product.image_url ? (
                <Image
                  src={product.image_url}
                  alt={product.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-xs font-mono">
                  No Image Provided
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-border/40 text-xs font-mono text-muted-foreground space-y-2">
              <div className="flex justify-between">
                <span>HSN Code:</span>
                <span className="font-bold text-foreground">{product.hsn_code}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax Rate:</span>
                <span className="font-bold text-foreground">{(product.tax_rate_bps / 100).toFixed(2)}% GST</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Inventory & Commercial Matrix */}
        <div className="lg:col-span-2 space-y-6">
          {/* Inventory Breakdown Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-[11px] font-mono uppercase text-muted-foreground block">
                Stock On Hand
              </span>
              <span className="font-mono text-2xl font-bold text-foreground mt-1 block">
                {product.stock_on_hand}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono mt-0.5 block">
                Physical warehouse units
              </span>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-[11px] font-mono uppercase text-muted-foreground block">
                Reserved Holds
              </span>
              <span className="font-mono text-2xl font-bold text-amber-500 mt-1 block">
                {product.stock_reserved}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono mt-0.5 block">
                15-min checkout locks
              </span>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-[11px] font-mono uppercase text-muted-foreground block">
                Available to Sell
              </span>
              <span className={`font-mono text-2xl font-bold mt-1 block ${
                availableToSell > 0 ? "text-emerald-500" : "text-destructive"
              }`}>
                {availableToSell}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono mt-0.5 block">
                Net customer quota
              </span>
            </div>
          </div>

          {/* Pricing Details */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-heading text-sm font-bold text-foreground uppercase tracking-wider">
              Commercial Pricing
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs font-mono text-muted-foreground block">Unit Price</span>
                <span className="font-mono text-2xl font-bold text-foreground mt-0.5 block">
                  {formatINR(product.price_paise)}
                </span>
                <span className="text-[11px] font-mono text-muted-foreground">
                  ({product.price_paise} paise)
                </span>
              </div>
              <div>
                <span className="text-xs font-mono text-muted-foreground block">Estimated Tax (18% GST)</span>
                <span className="font-mono text-2xl font-bold text-foreground mt-0.5 block">
                  {formatINR(Math.round((product.price_paise * product.tax_rate_bps) / 10000))}
                </span>
                <span className="text-[11px] font-mono text-muted-foreground">
                  Statutory invoice line item
                </span>
              </div>
            </div>
          </div>

          {/* Technical Description */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-2">
            <h3 className="font-heading text-sm font-bold text-foreground uppercase tracking-wider">
              Technical Description
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
              {product.description || "No detailed engineering description provided."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
