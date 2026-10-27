import Link from "next/link";
import Image from "next/image";
import type { ProductCatalogItem } from "@/types/domain";
import { formatINR } from "@/lib/domain/money";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddToCartButton } from "./add-to-cart-button";

interface ProductCardProps {
  product: ProductCatalogItem;
}

export function ProductCard({ product }: ProductCardProps) {
  const isAvailable = product.in_stock && product.available_quantity > 0;

  // Extract key technical spec attributes from metadata
  const specEntries = Object.entries(product.metadata).slice(0, 3);

  return (
    <Card className="group flex h-full flex-col justify-between overflow-hidden !rounded-none border border-border/80 bg-card/90 transition-all duration-300 hover:border-foreground/30 hover:shadow-lg hover:shadow-primary/5 [&_img]:!rounded-none">
      <div>
        {/* Hardware Visual */}
        <div className="relative aspect-4/3 w-full overflow-hidden bg-muted/60 border-b border-border/50">
          <Link href={`/products/${product.slug}`} tabIndex={-1} className="relative block h-full w-full">
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </Link>

          {!isAvailable && (
            <div className="absolute top-2.5 right-2.5">
              <Badge
                variant="destructive"
                className="!rounded-none text-[11px] font-medium backdrop-blur-sm"
              >
                Sold Out
              </Badge>
            </div>
          )}
        </div>

        {/* Content */}
        <CardHeader className="p-4 pb-2 !rounded-none">
          <Link href={`/products/${product.slug}`} className="hover:underline">
            <h3 className="font-heading text-base font-bold text-foreground line-clamp-1">
              {product.name}
            </h3>
          </Link>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        </CardHeader>

        {/* Specs Badges */}
        {specEntries.length > 0 && (
          <CardContent className="px-4 py-2 !rounded-none">
            <div className="flex flex-wrap gap-1.5">
              {specEntries.map(([key, val]) => (
                <span
                  key={key}
                  className="!rounded-none bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border/40"
                >
                  <span className="capitalize">{key.replace(/_/g, " ")}</span>:{" "}
                  <strong className="text-foreground">{String(val)}</strong>
                </span>
              ))}
            </div>
          </CardContent>
        )}
      </div>

      {/* Footer & Pricing */}
      <CardFooter className="flex flex-col gap-3 p-4 pt-3 border-t border-border/40 bg-muted/20 !rounded-none">
        <div className="flex w-full items-baseline justify-between">
          <span className="font-mono text-lg font-extrabold text-foreground tracking-tight">
            {formatINR(product.price_paise)}
          </span>
          <Link
            href={`/products/${product.slug}`}
            className="text-xs text-primary hover:underline font-medium font-mono"
          >
            Specs &rarr;
          </Link>
        </div>

        <AddToCartButton
          product={product}
          className="h-10 text-sm font-semibold !rounded-none"
        />
      </CardFooter>
    </Card>
  );
}
