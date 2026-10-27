import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductBySlug, getCatalogProducts } from "@/lib/catalog";
import { formatINR } from "@/lib/domain/money";
import { AddToCartButton } from "@/components/products/add-to-cart-button";
import { ArrowLeft } from "lucide-react";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const products = await getCatalogProducts();
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return { title: "Product Not Found | RoboForge" };
  }

  return {
    title: `${product.name} | RoboForge`,
    description: product.description,
  };
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }


  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb Navigation */}
      <nav className="mb-6 flex items-center gap-2 text-xs text-muted-foreground font-mono">
        <Link href="/products" className="hover:text-foreground flex items-center gap-1 transition-colors">
          <ArrowLeft className="size-3.5" />
          Catalog
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium truncate max-w-xs">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        {/* Left Column: Visual Hardware Preview */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl border border-border/80 bg-muted/40 shadow-sm">
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 60vw"
              className="object-cover"
            />

          </div>

        </div>

        {/* Right Column: Hardware Specifications & Purchase */}
        <div className="lg:col-span-5 flex flex-col justify-between">
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {product.name}
            </h1>

            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              {product.description}
            </p>

            {/* Price Card */}
            <div className="mt-6 rounded-xl border border-border/80 bg-card p-5 shadow-xs">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block">
                  Unit Price (Integer Paise)
                </span>
                <span className="font-mono text-3xl font-black text-foreground tracking-tight mt-0.5 block">
                  {formatINR(product.price_paise)}
                </span>
              </div>

              <div className="mt-6 border-t border-border/40 pt-5">
                <AddToCartButton product={product} size="lg" showQuantity={true} />
              </div>

              <p className="mt-3 text-center text-[11px] text-muted-foreground font-mono">
                Stock is reserved for 15 minutes upon proceeding to checkout.
              </p>
            </div>


          </div>
        </div>
      </div>
    </div>
  );
}
