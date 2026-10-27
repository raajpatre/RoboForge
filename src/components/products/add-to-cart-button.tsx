"use client";

import { useState } from "react";
import { useCart } from "@/context/cart-context";
import { useToast } from "@/components/ui/toast";
import type { ProductCatalogItem } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Check, AlertCircle } from "lucide-react";
import { cn } from "cn";

interface AddToCartButtonProps {
  product: ProductCatalogItem;
  size?: "default" | "sm" | "lg";
  showQuantity?: boolean;
  className?: string;
}

export function AddToCartButton({
  product,
  size = "default",
  showQuantity = false,
  className,
}: AddToCartButtonProps) {
  const { addItem, items } = useCart();
  const { toast } = useToast();
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const cartItem = items.find((i) => i.productId === product.id);
  const inCartQty = cartItem ? cartItem.quantity : 0;
  const isOutOfStock = !product.in_stock || product.available_quantity <= 0;
  const reachedMaxAvailable = inCartQty >= product.available_quantity;

  const handleAdd = () => {
    if (isOutOfStock || reachedMaxAvailable) return;
    addItem(product, quantity);
    setJustAdded(true);
    toast({
      title: "Added to Cart",
      description: `${quantity}x ${product.name} allocated to your cart.`,
      variant: "success",
    });
    setTimeout(() => setJustAdded(false), 1800);
  };

  if (isOutOfStock) {
    return (
      <Button
        disabled
        variant="outline"
        size={size}
        className={cn(
          "w-full text-xs font-mono text-muted-foreground border-border/80",
          className
        )}
      >
        <AlertCircle className="mr-1.5 size-3.5" />
        Out of Stock
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 w-full">
      {showQuantity && (
        <div className={cn("flex items-center rounded-lg border border-border bg-card px-2 shrink-0", size === "lg" ? "h-9" : "h-8")}>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground px-1.5 text-sm disabled:opacity-30 cursor-pointer"
            disabled={quantity <= 1}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            aria-label="Decrease quantity"
          >
            -
          </button>
          <span className="w-8 text-center font-mono text-xs font-bold text-foreground">
            {quantity}
          </span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground px-1.5 text-sm disabled:opacity-30 cursor-pointer"
            disabled={quantity >= Math.min(10, product.available_quantity - inCartQty)}
            onClick={() => setQuantity((q) => Math.min(10, q + 1))}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      )}

      <Button
        id={`add-to-cart-${product.slug}`}
        type="button"
        size={size}
        variant={justAdded ? "secondary" : "default"}
        onClick={handleAdd}
        disabled={reachedMaxAvailable}
        className={cn(
          "flex-1 min-w-0 transition-all duration-200 cursor-pointer shrink",
          justAdded ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : "",
          className
        )}
      >
        {justAdded ? (
          <>
            <Check className="mr-1.5 size-4 text-emerald-500" />
            Added to Cart
          </>
        ) : reachedMaxAvailable ? (
          "Max in Cart"
        ) : (
          <>
            <ShoppingCart className="mr-1.5 size-4" />
            Add to Cart
          </>
        )}
      </Button>
    </div>
  );
}
