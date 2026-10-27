"use server";

import { headers } from "next/headers";
import { checkoutRequestSchema } from "@/lib/domain/validation";
import { generateOrderCode } from "@/lib/domain/crypto";
import { calculateOrderTotals } from "@/lib/domain/money";
import { getProductById } from "@/lib/catalog";
import { reserveInventory, releaseInventory } from "@/lib/domain/inventory";
import { createRazorpayOrder } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { saveMockOrder } from "@/lib/domain/mock-store";
import { getBusinessConfig, assertLiveLaunchSafety } from "@/lib/domain/business-config";

export interface CheckoutSessionResult {
  success: boolean;
  orderCode?: string;
  orderId?: string;
  razorpayOrderId?: string;
  amountPaise?: number;
  currency?: string;
  keyId?: string;
  storeName?: string;
  customer?: {
    name: string;
    email: string;
    phone: string;
  };
  error?: string;
}

/**
 * Initiates order checkout:
 * 1. Validates inputs and enforces rate limiting.
 * 2. Fetches authoritative prices and checks live stock.
 * 3. Generates >= 128-bit cryptographic order code.
 * 4. Transactionally reserves inventory for 15 minutes.
 * 5. Creates Razorpay order server-side.
 */
export async function initiateCheckoutAction(rawInput: unknown): Promise<CheckoutSessionResult> {
  // 1. Rate Limiting Check
  let clientIp = "127.0.0.1";
  try {
    const headerList = await headers();
    clientIp =
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headerList.get("x-real-ip") ||
      "127.0.0.1";
  } catch {
    // headers() might not be available in synthetic test runners
  }

  const rateCheck = checkRateLimit(`checkout_${clientIp}`, { limit: 10, windowMs: 60000 });
  if (!rateCheck.success) {
    return {
      success: false,
      error: "Too many checkout attempts. Please wait a minute before retrying.",
    };
  }

  // 2. Validate Input Payload
  const parseResult = checkoutRequestSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues[0]?.message || "Invalid checkout details provided.",
    };
  }

  const { customer, items } = parseResult.data;

  // 3. Server-Authoritative Price & Inventory Validation
  const verifiedItems: Array<{
    productId: string;
    name: string;
    slug: string;
    unitPricePaise: number;
    taxRateBps: number;
    quantity: number;
    availableQuantity: number;
  }> = [];

  for (const item of items) {
    const product = await getProductById(item.productId);

    if (!product || !product.is_active) {
      return {
        success: false,
        error: `Product is unavailable or no longer active.`,
      };
    }

    if (product.available_quantity < item.quantity) {
      return {
        success: false,
        error: `Insufficient stock for "${product.name}". Only ${product.available_quantity} available.`,
      };
    }

    verifiedItems.push({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      unitPricePaise: product.price_paise,
      taxRateBps: product.tax_rate_bps,
      quantity: item.quantity,
      availableQuantity: product.available_quantity,
    });
  }

  // Fail-closed live launch verification
  if (process.env.PAYMENT_MODE === "live") {
    try {
      assertLiveLaunchSafety();
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Live launch fail-closed guard triggered.",
      };
    }
  }

  // 4. Calculate Server Totals
  const rawSubtotal = verifiedItems.reduce(
    (acc, curr) => acc + curr.unitPricePaise * curr.quantity,
    0
  );

  const FREE_SHIPPING_THRESHOLD_PAISE = 50000;
  const STANDARD_SHIPPING_PAISE = 20000;
  const shippingPaise = rawSubtotal > FREE_SHIPPING_THRESHOLD_PAISE ? 0 : STANDARD_SHIPPING_PAISE;

  const businessConfig = getBusinessConfig();
  const isGst = businessConfig.taxMode.isGstRegistered;

  const totals = calculateOrderTotals(
    verifiedItems.map((i) => ({
      unitPricePaise: i.unitPricePaise,
      quantity: i.quantity,
      taxRateBps: isGst ? i.taxRateBps : 0,
    })),
    shippingPaise
  );

  // 5. Generate Cryptographically Unpredictable Tracking Code (>= 128 bits)
  const orderCode = generateOrderCode();

  const publicEnv = getPublicEnv();
  const isPlaceholderDb = publicEnv.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  let orderId = `mock_order_${Date.now()}`;

  // 6. Database Persistence & Stock Reservation
  if (!isPlaceholderDb) {
    const admin = createAdminClient();

    // Insert Order Record
    const { data: orderData, error: orderError } = await admin
      .from("orders")
      .insert({
        order_code: orderCode,
        order_number: orderCode,
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
        shipping_address: customer.shippingAddress as unknown as import("@/types/database").Json,
        subtotal_paise: totals.subtotalPaise,
        tax_paise: totals.taxPaise,
        shipping_paise: totals.shippingPaise,
        total_paise: totals.totalPaise,
        currency: "INR",
        payment_status: "pending",
        delivery_status: "pending",
      })
      .select("id")
      .single();

    if (orderError || !orderData) {
      return {
        success: false,
        error: `Failed to initiate order in database: ${orderError?.message || "Unknown error"}`,
      };
    }

    orderId = orderData.id;

    // Insert Historical Order Items Snapshots
    const orderItemsRows = totals.items.map((calcItem, idx) => ({
      order_id: orderId,
      product_id: verifiedItems[idx].productId,
      product_name_snapshot: verifiedItems[idx].name,
      product_slug_snapshot: verifiedItems[idx].slug,
      unit_price_paise_snapshot: calcItem.unitPricePaise,
      tax_rate_bps_snapshot: calcItem.taxRateBps,
      quantity: calcItem.quantity,
      total_paise_snapshot: calcItem.totalPaise,
    }));

    const { error: itemsError } = await admin.from("order_items").insert(orderItemsRows);
    if (itemsError) {
      return {
        success: false,
        error: `Failed to record order item snapshots: ${itemsError.message}`,
      };
    }

    // 7. Transactional Inventory Reservation with 15-Minute TTL
    try {
      await reserveInventory(
        admin,
        orderId,
        verifiedItems.map((i) => ({
          product_id: i.productId,
          quantity: i.quantity,
        })),
        15
      );
    } catch (invErr) {
      return {
        success: false,
        error: invErr instanceof Error ? invErr.message : "Inventory reservation failed.",
      };
    }
  }

  // 8. Create Razorpay Order Server-Side
  let razorpayOrder;
  try {
    razorpayOrder = await createRazorpayOrder({
      amountPaise: totals.totalPaise,
      currency: "INR",
      receipt: orderCode,
      notes: {
        order_code: orderCode,
        customer_email: customer.email,
      },
    });

    // Update order with razorpay_order_id in DB if not in placeholder mode
    if (!isPlaceholderDb) {
      const admin = createAdminClient();
      await admin
        .from("orders")
        .update({ razorpay_order_id: razorpayOrder.id })
        .eq("id", orderId);
    } else {
      saveMockOrder({
        id: orderId,
        order_code: orderCode,
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
        shipping_address: customer.shippingAddress as Record<string, unknown>,
        subtotal_paise: totals.subtotalPaise,
        tax_paise: totals.taxPaise,
        shipping_paise: totals.shippingPaise,
        total_paise: totals.totalPaise,
        currency: "INR",
        payment_status: "pending",
        delivery_status: "pending",
        razorpay_order_id: razorpayOrder.id,
        items: verifiedItems.map((i) => ({
          productId: i.productId,
          name: i.name,
          slug: i.slug,
          unitPricePaise: i.unitPricePaise,
          taxRateBps: i.taxRateBps,
          quantity: i.quantity,
          totalPaise: i.unitPricePaise * i.quantity,
        })),
        reservation_expires_at: Date.now() + 15 * 60 * 1000,
        reservation_status: "reserved",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  } catch (rzpErr) {
    // Release inventory hold immediately if payment order creation fails
    if (!isPlaceholderDb) {
      const admin = createAdminClient();
      await releaseInventory(admin, orderId).catch(() => {});
    }

    return {
      success: false,
      error: rzpErr instanceof Error ? rzpErr.message : "Failed to create payment session.",
    };
  }

  return {
    success: true,
    orderCode,
    orderId,
    razorpayOrderId: razorpayOrder.id,
    amountPaise: totals.totalPaise,
    currency: "INR",
    keyId: publicEnv.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    storeName: getBusinessConfig().tradeName,
    customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    },
  };
}
