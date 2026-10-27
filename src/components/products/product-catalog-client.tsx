"use client";

import { useState, useMemo } from "react";
import type { ProductCatalogItem } from "@/types/domain";
import { ProductCard } from "@/components/products/product-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

interface ProductCatalogClientProps {
  products: ProductCatalogItem[];
}

export function ProductCatalogClient({ products }: ProductCatalogClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<"featured" | "price-asc" | "price-desc">("featured");

  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        // Active check
        if (!p.is_active) return false;

        // Search query (name, description, SKU, or slug)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = p.name.toLowerCase().includes(q);
          const matchDesc = p.description.toLowerCase().includes(q);
          const matchSku = p.sku ? p.sku.toLowerCase().includes(q) : false;
          const matchSlug = p.slug.toLowerCase().includes(q);
          if (!matchName && !matchDesc && !matchSku && !matchSlug) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortOption === "price-asc") {
          return a.price_paise - b.price_paise;
        }
        if (sortOption === "price-desc") {
          return b.price_paise - a.price_paise;
        }
        return 0; // Maintain original featured order
      });
  }, [products, searchQuery, sortOption]);

  const hasActiveFilters = searchQuery !== "" || sortOption !== "featured";

  const handleResetFilters = () => {
    setSearchQuery("");
    setSortOption("featured");
  };

  return (
    <div className="space-y-8">
      {/* Search and Sort Controls */}
      <div className="rounded-xl border border-border/70 bg-card p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              id="catalog-search-input"
              type="text"
              placeholder="Search components by model, SKU, or specifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 bg-background/80 text-sm font-sans"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search query"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Sort By and Reset Controls */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground whitespace-nowrap hidden sm:inline">
                Sort:
              </span>
              <select
                id="catalog-sort-select"
                aria-label="Sort products by price"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as "featured" | "price-asc" | "price-desc")}
                className="rounded-lg border border-border/80 bg-background px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="featured">Featured Order</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="text-xs font-mono text-muted-foreground hover:text-foreground h-9 px-2"
              >
                <X className="mr-1 size-3.5" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Catalog Status Bar */}
      <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
        <span>
          Showing <strong className="text-foreground">{filteredProducts.length}</strong> of {products.length} hardware components
        </span>
        {filteredProducts.length > 0 && (
          <span className="hidden sm:inline text-[11px] text-muted-foreground">
            All prices computed server-side in integer paise
          </span>
        )}
      </div>

      {/* Products Grid or Empty State */}
      {filteredProducts.length > 0 ? (
        <div
          id="products-grid"
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-12 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Search className="size-6" />
          </div>
          <h3 className="font-heading text-lg font-bold text-foreground mt-4">
            No matching robotics components found
          </h3>
          <p className="mt-1.5 text-xs text-muted-foreground max-w-sm mx-auto">
            Try adjusting your search query or clearing active filters to see all available inventory.
          </p>
          <div className="mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="font-mono text-xs"
            >
              Clear All Filters
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
