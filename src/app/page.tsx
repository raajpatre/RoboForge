import Link from "next/link";
import { getCatalogProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/products/product-card";
import { buttonVariants } from "@/components/ui/button";
import { ArrowRight, Search } from "lucide-react";

export default async function HomePage() {
  const products = await getCatalogProducts();
  const featured = products.slice(0, 3);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border/60 bg-radial-[at_50%_0%] from-primary/10 via-background to-background py-20 md:py-28">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-foreground leading-[1.1]">
              High-Precision Robotics & Autonomous Systems
            </h1>

            <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed">
              Procure industrial-grade 6-DOF articulated arms, Time-of-Flight LiDAR scanners, Mecanum mobile AMR bases, and FOC motor controllers. Real-time stock reservations and tamper-proof tracking.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link
                href="/products"
                id="hero-catalog-button"
                className={buttonVariants({ size: "lg", className: "w-full sm:w-auto font-mono" })}
              >
                Browse Catalog
                <ArrowRight className="ml-2 size-4" />
              </Link>

              <Link
                href="/track"
                id="hero-track-button"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "w-full sm:w-auto font-mono border-border",
                })}
              >
                <Search className="mr-2 size-4" />
                Track Order by Code
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Components Section */}
      <section className="py-16 md:py-24 bg-background">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
            <div>
              <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Featured Components
              </h2>
            </div>

            <Link
              href="/products"
              className={buttonVariants({
                variant: "ghost",
                size: "sm",
                className: "self-start sm:self-auto font-mono text-xs",
              })}
            >
              View All {products.length} Products &rarr;
            </Link>
          </div>

          {featured.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 border border-dashed border-border/80 rounded-xl bg-card/40">
              <p className="text-sm text-muted-foreground font-mono">
                No products currently listed. Add new components from the admin dashboard to start fresh.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
