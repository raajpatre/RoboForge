"use server";

import { z } from "zod";
import { getProductById } from "@/lib/catalog";
import { calculateOrderTotals, type CalculatedOrderTotals } from "@/lib/domain/money";
import { getBusinessConfig } from "@/lib/domain/business-config";

const cartValidationInputSchema = z.array(
  z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(10),
  })
);

export interface ValidatedCartItem {
  productId: string;
  name: string;
  slug: string;
  imageUrl: string;
  unitPricePaise: number;
  taxRateBps: number;
  requestedQuantity: number;
  availableQuantity: number;
  hasSufficientStock: boolean;
  effectiveQuantity: number;
}

export interface CartValidationResult {
  isValid: boolean;
  hasStockIssues: boolean;
  items: ValidatedCartItem[];
  totals: CalculatedOrderTotals | null;
  errorMessage?: string;
}

/**
 * Server-authoritative cart validation and pricing calculator.
 * All pricing, taxes, and shipping are computed strictly from database records.
 */
export async function validateCartAction(rawItems: unknown): Promise<CartValidationResult> {
  const parseResult = cartValidationInputSchema.safeParse(rawItems);

  if (!parseResult.success) {
    return {
      isValid: false,
      hasStockIssues: false,
      items: [],
      totals: null,
      errorMessage: "Invalid cart data provided.",
    };
  }

  const requestedItems = parseResult.data;

  if (requestedItems.length === 0) {
    return {
      isValid: true,
      hasStockIssues: false,
      items: [],
      totals: null,
    };
  }

  const validatedItems: ValidatedCartItem[] = [];
  let hasStockIssues = false;

  for (const req of requestedItems) {
    const product = await getProductById(req.productId);

    if (!product || !product.is_active) {
      hasStockIssues = true;
      continue;
    }

    const available = product.available_quantity;
    const sufficient = available >= req.quantity;

    if (!sufficient) {
      hasStockIssues = true;
    }

    const effectiveQuantity = Math.min(req.quantity, Math.max(0, available));

    validatedItems.push({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      imageUrl: product.image_url,
      unitPricePaise: product.price_paise,
      taxRateBps: product.tax_rate_bps,
      requestedQuantity: req.quantity,
      availableQuantity: available,
      hasSufficientStock: sufficient,
      effectiveQuantity,
    });
  }

  // Filter items that have at least 1 unit available for calculation
  const purchasableItems = validatedItems
    .filter((item) => item.effectiveQuantity > 0)
    .map((item) => ({
      unitPricePaise: item.unitPricePaise,
      quantity: item.effectiveQuantity,
      taxRateBps: item.taxRateBps,
    }));

  let totals: CalculatedOrderTotals | null = null;

  if (purchasableItems.length > 0) {
    const rawSubtotal = purchasableItems.reduce(
      (acc, curr) => acc + curr.unitPricePaise * curr.quantity,
      0
    );

    // Shipping Policy: ₹200 shipping charge for cart value ₹500 and below (<= 50,000 paise), free shipping above ₹500
    const FREE_SHIPPING_THRESHOLD_PAISE = 50000;
    const STANDARD_SHIPPING_PAISE = 20000;
    const shippingPaise =
      rawSubtotal > FREE_SHIPPING_THRESHOLD_PAISE ? 0 : STANDARD_SHIPPING_PAISE;

    const businessConfig = getBusinessConfig();
    const isGst = businessConfig.taxMode.isGstRegistered;

    const calculationItems = purchasableItems.map((item) => ({
      ...item,
      taxRateBps: isGst ? item.taxRateBps : 0,
    }));

    totals = calculateOrderTotals(calculationItems, shippingPaise);
  }

  return {
    isValid: true,
    hasStockIssues,
    items: validatedItems,
    totals,
  };
}
