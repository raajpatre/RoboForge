import type { Metadata } from "next";
import { getCatalogProducts } from "@/lib/catalog";
import { ProductCatalogClient } from "@/components/products/product-catalog-client";
import { Cpu } from "lucide-react";

export const metadata: Metadata = {
  title: "Robotics Components Catalog | RoboForge",
  description:
    "Browse electronic components intended for learning, hobby, prototyping and general project use.",
};

export default async function ProductsPage() {
  const products = await getCatalogProducts();

  return (
    <div className="container mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary font-bold">
          <Cpu className="size-4" /> Catalog
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-2">
          Robotics Components
        </h1>
      </div>

      {/* Interactive Filterable Catalog */}
      <ProductCatalogClient products={products} />
    </div>
  );
}
