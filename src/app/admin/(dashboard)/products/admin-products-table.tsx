"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { formatINR } from "@/lib/domain/money";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit3, Package, AlertCircle, Search, Eye, X, Loader2 } from "lucide-react";
import { toggleProductActiveAction } from "@/app/actions/admin";

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  sku?: string;
  category?: string;
  price_paise: number;
  image_url: string;
  hsn_code: string;
  tax_rate_bps: number;
  is_active: boolean;
  stock_on_hand: number;
  stock_reserved: number;
  available_quantity: number;
}

interface AdminProductsTableProps {
  products: AdminProductRow[];
}

export function AdminProductsTable({ products }: AdminProductsTableProps) {
  const router = useRouter();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [sortField, setSortField] = useState<"name" | "price" | "stock" | "available">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const handleToggleStatus = async (product: AdminProductRow) => {
    setTogglingId(product.id);
    await toggleProductActiveAction(product.id, !product.is_active);
    setTogglingId(null);
    router.refresh();
  };

  const filteredAndSorted = useMemo(() => {
    return products
      .filter((p) => {
        // Status filter
        if (statusFilter === "active" && !p.is_active) return false;
        if (statusFilter === "inactive" && p.is_active) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = p.name.toLowerCase().includes(q);
          const matchSlug = p.slug.toLowerCase().includes(q);
          const matchSku = p.sku ? p.sku.toLowerCase().includes(q) : false;
          if (!matchName && !matchSlug && !matchSku) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === "name") {
          diff = a.name.localeCompare(b.name);
        } else if (sortField === "price") {
          diff = a.price_paise - b.price_paise;
        } else if (sortField === "stock") {
          diff = a.stock_on_hand - b.stock_on_hand;
        } else if (sortField === "available") {
          diff = a.available_quantity - b.available_quantity;
        }
        return sortDirection === "asc" ? diff : -diff;
      });
  }, [products, searchQuery, statusFilter, sortField, sortDirection]);

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pb-4 border-b border-border/40">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search by name, SKU, or slug..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-8 h-9 text-xs font-sans"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
            aria-label="Filter products by status"
            className="h-9 rounded-lg border border-border/80 bg-background px-2.5 text-xs font-mono text-foreground"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>

          <select
            value={`${sortField}-${sortDirection}`}
            onChange={(e) => {
              const [field, dir] = e.target.value.split("-") as [
                "name" | "price" | "stock" | "available",
                "asc" | "desc"
              ];
              setSortField(field);
              setSortDirection(dir);
            }}
            aria-label="Sort products by column"
            className="h-9 rounded-lg border border-border/80 bg-background px-2.5 text-xs font-mono text-foreground"
          >
            <option value="name-asc">Sort: Name (A-Z)</option>
            <option value="name-desc">Sort: Name (Z-A)</option>
            <option value="price-asc">Sort: Price (Low-High)</option>
            <option value="price-desc">Sort: Price (High-Low)</option>
            <option value="stock-desc">Sort: Stock on Hand (High-Low)</option>
            <option value="available-desc">Sort: Available to Sell (High-Low)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border/60 text-muted-foreground font-mono text-[11px] uppercase tracking-wider">
              <th className="pb-3 font-semibold">SKU / Hardware Product</th>
              <th className="pb-3 font-semibold">Category</th>
              <th className="pb-3 font-semibold text-right">Unit Price</th>
              <th className="pb-3 font-semibold text-center">Stock On Hand</th>
              <th className="pb-3 font-semibold text-center">Reserved</th>
              <th className="pb-3 font-semibold text-center">Available</th>
              <th className="pb-3 font-semibold text-center">Status</th>
              <th className="pb-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 font-mono">
            {filteredAndSorted.map((product) => (
              <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                {/* Product Name & Visual */}
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-3">
                    <div className="relative size-10 rounded-lg overflow-hidden bg-muted/60 shrink-0 border border-border/60">
                      {product.image_url ? (
                        <Image
                          src={product.image_url}
                          alt={product.name}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      ) : (
                        <div className="size-full flex items-center justify-center text-muted-foreground">
                          <Package className="size-5" />
                        </div>
                      )}
                    </div>
                    <div>
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="font-sans font-bold text-sm text-foreground hover:underline"
                      >
                        {product.name}
                      </Link>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                        <span>{product.sku || "NO-SKU"}</span>
                        <span>•</span>
                        <span>/{product.slug}</span>
                      </div>
                    </div>
                  </div>
                </td>

                {/* Category */}
                <td className="py-4 pr-4 text-muted-foreground capitalize">
                  {product.category || "robotics"}
                </td>

                {/* Unit Price */}
                <td className="py-4 pr-4 text-right font-black text-foreground text-sm">
                  {formatINR(product.price_paise)}
                </td>

                {/* Stock On Hand */}
                <td className="py-4 pr-4 text-center font-bold text-foreground">
                  {product.stock_on_hand}
                </td>

                {/* Reserved */}
                <td className="py-4 pr-4 text-center text-amber-500 font-semibold">
                  {product.stock_reserved > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <AlertCircle className="size-3" />
                      {product.stock_reserved}
                    </span>
                  ) : (
                    "0"
                  )}
                </td>

                {/* Available */}
                <td className="py-4 pr-4 text-center font-black">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                      product.available_quantity > 5
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : product.available_quantity > 0
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {product.available_quantity} units
                  </span>
                </td>

                {/* Status */}
                <td className="py-4 pr-4 text-center">
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(product)}
                    disabled={togglingId === product.id}
                    title={
                      product.is_active
                        ? "Active on public store. Click to make Inactive (hidden)."
                        : "Inactive draft. Click to make Active (publish to store)."
                    }
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono cursor-pointer transition-colors border ${
                      product.is_active
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                        : "bg-muted text-muted-foreground border-border/80 hover:bg-muted/80 hover:text-foreground"
                    }`}
                  >
                    {togglingId === product.id ? (
                      <Loader2 className="size-2.5 animate-spin mr-1" />
                    ) : (
                      <span
                        className={`inline-block size-1.5 rounded-full mr-1.5 ${
                          product.is_active ? "bg-emerald-500" : "bg-muted-foreground"
                        }`}
                      />
                    )}
                    <span className="uppercase font-semibold">
                      {product.is_active ? "Active" : "Inactive"}
                    </span>
                  </button>
                </td>

                {/* Actions */}
                <td className="py-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link
                      href={`/admin/products/${product.id}`}
                      title="Inspect Product Details"
                      className={`${buttonVariants({
                        variant: "ghost",
                        size: "sm",
                      })} h-8 w-8 p-0 text-muted-foreground hover:text-foreground`}
                    >
                      <Eye className="size-3.5" />
                    </Link>

                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className={`${buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })} h-8 px-2.5 text-xs font-mono gap-1`}
                    >
                      <Edit3 className="size-3" />
                      <span>Edit</span>
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredAndSorted.length === 0 && (
        <div className="py-10 text-center text-xs text-muted-foreground font-mono">
          No hardware products matching current query or filters.
        </div>
      )}
    </div>
  );
}
