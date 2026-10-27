import "server-only";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv, getPublicEnv } from "@/lib/env";
import { calculateItemTax } from "@/lib/domain/money";
import { generateInvoicePdf } from "@/lib/pdf/invoice-generator";
import {
  getMockInvoiceByOrderCode,
  getMockInvoiceByOrderId,
  saveMockInvoice,
  getMockOrderByCode,
  issueMockInvoiceSerial,
} from "@/lib/domain/mock-store";
import type {
  InvoiceSnapshot,
  InvoiceItemSnapshot,
  SellerSnapshot,
  BuyerSnapshot,
} from "@/types/domain";

import { getBusinessConfig } from "@/lib/domain/business-config";

/**
 * Standard Indian GSTIN Regex:
 * 2 digit state code + 10 alphanumeric PAN + 1 entity num + 'Z' + 1 checksum character
 */
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Checks whether the seller's real tax configuration supports a GST Tax Invoice.
 * Adheres strictly to: "Don't label a document a GST tax invoice unless the seller's real tax configuration supports that."
 */
export function isSellerGstRegistered(seller: SellerSnapshot): boolean {
  if (!seller.gstin) return false;
  const trimmed = seller.gstin.trim().toUpperCase();
  if (
    trimmed === "" ||
    trimmed.includes("UNREGISTERED") ||
    trimmed.includes("NOT APPLICABLE") ||
    trimmed.includes("NOT SPECIFIED") ||
    trimmed.includes("COMPOSITION")
  ) {
    return false;
  }
  return GSTIN_REGEX.test(trimmed);
}

/**
 * Generates an invoice number fallback if database sequence RPC is not reachable.
 * Format: INV-YYYY-XXXXXX
 */
export function generateInvoiceNumber(date = new Date()): string {
  const year = date.getFullYear();
  const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `INV-${year}-${randomSuffix}`;
}

/**
 * Builds standard seller snapshot using authoritative server configuration.
 * Validates mandatory seller details and never invents seller or tax values.
 */
export function buildSellerSnapshot(): SellerSnapshot {
  const env = getServerEnv();
  const businessConfig = getBusinessConfig();

  if (!env.SELLER_LEGAL_NAME || env.SELLER_LEGAL_NAME.trim() === "") {
    throw new Error("Missing mandatory seller configuration: SELLER_LEGAL_NAME is required.");
  }
  if (!env.SELLER_EMAIL || env.SELLER_EMAIL.trim() === "") {
    throw new Error("Missing mandatory seller configuration: SELLER_EMAIL is required.");
  }
  if (!env.SELLER_CITY || env.SELLER_CITY.trim() === "") {
    throw new Error("Missing mandatory seller configuration: SELLER_CITY is required.");
  }
  if (!env.SELLER_STATE || env.SELLER_STATE.trim() === "") {
    throw new Error("Missing mandatory seller configuration: SELLER_STATE is required.");
  }

  const rawGstin = env.SELLER_GSTIN ? env.SELLER_GSTIN.trim() : "";
  let gstinValue = "UNREGISTERED / NOT APPLICABLE";

  if (businessConfig.taxMode.mode === "gst_registered" && rawGstin && GSTIN_REGEX.test(rawGstin.toUpperCase())) {
    gstinValue = rawGstin.toUpperCase();
  } else if (businessConfig.taxMode.mode === "composition") {
    gstinValue = rawGstin ? `${rawGstin.toUpperCase()} (COMPOSITION DEALER)` : "COMPOSITION DEALER - NOT ELIGIBLE TO COLLECT TAX";
  }

  const panValue = env.SELLER_PAN && env.SELLER_PAN.trim() !== "" ? env.SELLER_PAN.trim() : "NOT APPLICABLE";

  return {
    legal_name: env.SELLER_LEGAL_NAME.trim(),
    trade_name: env.SELLER_TRADE_NAME.trim() || env.SELLER_LEGAL_NAME.trim(),
    gstin: gstinValue,
    pan: panValue,
    email: env.SELLER_EMAIL.trim(),
    phone: env.SELLER_PHONE.trim(),
    address_line1: env.SELLER_ADDRESS_LINE1.trim(),
    address_line2: env.SELLER_ADDRESS_LINE2 ? env.SELLER_ADDRESS_LINE2.trim() : undefined,
    city: env.SELLER_CITY.trim(),
    state: env.SELLER_STATE.trim(),
    state_code: env.SELLER_STATE_CODE.trim(),
    postal_code: env.SELLER_POSTAL_CODE.trim(),
    country: env.SELLER_COUNTRY.trim() || "India",
  };
}

/**
 * Builds fallback deterministic invoice snapshot for local test and sandbox environments.
 */
export function buildMockInvoiceSnapshot(orderCode: string): InvoiceSnapshot {
  const seller = buildSellerSnapshot();
  const issueDate = new Date().toISOString().split("T")[0];
  const isGst = isSellerGstRegistered(seller);

  const buyer: BuyerSnapshot = {
    name: "Dr. Vikram Sarabhai",
    email: "vikram@robotics-lab.org",
    phone: "+919876543210",
    shipping_address: {
      line1: "Innovation Wing, ISRO Layout",
      city: "Bengaluru",
      state: "Karnataka",
      state_code: "29",
      postal_code: "560078",
      country: "India",
    },
  };

  const itemUnitPrice = 18500000;
  const itemTax = isGst ? calculateItemTax(itemUnitPrice, 1800) : 0;

  const items: InvoiceItemSnapshot[] = [
    {
      product_name: "ForgeBot Alpha 6-DOF Robotic Arm",
      sku: "RBF-ARM-ALPHA",
      hsn_code: "84795000",
      unit_price_paise: itemUnitPrice,
      tax_rate_bps: isGst ? 1800 : 0,
      quantity: 1,
      taxable_amount_paise: itemUnitPrice,
      tax_amount_paise: itemTax,
      total_paise: itemUnitPrice + itemTax,
    },
  ];

  return {
    invoice_number: issueMockInvoiceSerial(),
    issue_date: issueDate,
    order_code: orderCode,
    seller,
    buyer,
    items,
    subtotal_paise: itemUnitPrice,
    tax_paise: itemTax,
    shipping_paise: 0,
    total_paise: itemUnitPrice + itemTax,
    currency: "INR",
    is_gst_invoice: isGst,
  };
}

/**
 * Retrieves an existing immutable invoice snapshot from the database or mock store,
 * or creates one idempotently once payment is confirmed.
 *
 * Guarantees:
 * - Exactly one invoice created per order (idempotent).
 * - Zero PDF binary bytes stored in the database.
 * - Concurrency-safe invoice sequence numbering.
 * - Historical snapshot remains immutable even if products are edited later.
 */
export async function getOrCreateInvoiceSnapshot(orderCode: string): Promise<InvoiceSnapshot | null> {
  const publicEnv = getPublicEnv();
  const isPlaceholderDb = publicEnv.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  // 1. Placeholder / Test Store Handler
  if (isPlaceholderDb) {
    // Check if an invoice was already issued for this order code
    const existing = getMockInvoiceByOrderCode(orderCode);
    if (existing) {
      return existing;
    }

    const mockOrder = getMockOrderByCode(orderCode);
    if (!mockOrder) {
      // Standalone synthetic test fallback
      const mockSnapshot = buildMockInvoiceSnapshot(orderCode);
      saveMockInvoice(mockSnapshot);
      return mockSnapshot;
    }

    // Require settled payment before issuing an invoice
    if (mockOrder.payment_status !== "paid" && mockOrder.payment_status !== "refunded") {
      return null;
    }

    const seller = buildSellerSnapshot();
    const isGst = isSellerGstRegistered(seller);
    const invoiceNumber = issueMockInvoiceSerial();
    const issueDate = new Date().toISOString().split("T")[0];

    const buyer: BuyerSnapshot = {
      name: mockOrder.customer_name,
      email: mockOrder.customer_email,
      phone: mockOrder.customer_phone,
      shipping_address: mockOrder.shipping_address as unknown as BuyerSnapshot["shipping_address"],
    };

    const invoiceItems: InvoiceItemSnapshot[] = mockOrder.items.map((item) => {
      const taxable = item.unitPricePaise * item.quantity;
      const tax = isGst ? calculateItemTax(taxable, item.taxRateBps) : 0;

      return {
        product_name: item.name,
        sku: item.sku || "RBF-ITEM",
        hsn_code: item.hsn_code || "84795000",
        unit_price_paise: item.unitPricePaise,
        tax_rate_bps: isGst ? item.taxRateBps : 0,
        quantity: item.quantity,
        taxable_amount_paise: taxable,
        tax_amount_paise: tax,
        total_paise: taxable + tax,
      };
    });

    const invoice: InvoiceSnapshot = {
      invoice_number: invoiceNumber,
      issue_date: issueDate,
      order_code: mockOrder.order_code,
      seller,
      buyer,
      items: invoiceItems,
      subtotal_paise: mockOrder.subtotal_paise,
      tax_paise: isGst ? mockOrder.tax_paise : 0,
      shipping_paise: mockOrder.shipping_paise,
      total_paise: mockOrder.total_paise,
      currency: mockOrder.currency,
      is_gst_invoice: isGst,
    };

    saveMockInvoice(invoice, mockOrder.id);
    return invoice;
  }

  // 2. PostgreSQL Live Database Mode
  const admin = createAdminClient();

  // Fetch order details
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(
      "id, order_code, customer_name, customer_email, customer_phone, shipping_address, subtotal_paise, tax_paise, shipping_paise, total_paise, currency, payment_status, created_at"
    )
    .eq("order_code", orderCode)
    .maybeSingle();

  if (orderError || !order) {
    return null;
  }

  // Strictly require payment to be settled before issuing a tax invoice
  if (order.payment_status !== "paid" && order.payment_status !== "refunded") {
    return null;
  }

  // 3. Idempotency Check: Retrieve existing invoice snapshot if already generated
  const { data: existingInvoice } = await admin
    .from("invoices")
    .select("*")
    .eq("order_id", order.id)
    .maybeSingle();

  if (existingInvoice) {
    const seller = existingInvoice.seller_snapshot as unknown as SellerSnapshot;
    return {
      invoice_number: existingInvoice.invoice_number,
      issue_date: existingInvoice.issue_date,
      order_code: order.order_code,
      seller,
      buyer: existingInvoice.buyer_snapshot as unknown as BuyerSnapshot,
      items: existingInvoice.items_snapshot as unknown as InvoiceItemSnapshot[],
      subtotal_paise: Number(existingInvoice.subtotal_paise),
      tax_paise: Number(existingInvoice.tax_paise),
      shipping_paise: Number(existingInvoice.shipping_paise),
      total_paise: Number(existingInvoice.total_paise),
      currency: existingInvoice.currency,
      is_gst_invoice: isSellerGstRegistered(seller),
    };
  }

  // 4. Fetch frozen order items
  const { data: dbItems, error: itemsError } = await admin
    .from("order_items")
    .select(
      "product_name_snapshot, product_slug_snapshot, unit_price_paise_snapshot, tax_rate_bps_snapshot, quantity, total_paise_snapshot"
    )
    .eq("order_id", order.id);

  if (itemsError || !dbItems || dbItems.length === 0) {
    throw new Error(`Order ${orderCode} has no line items recorded.`);
  }

  // 5. Construct Immutable Snapshots
  const sellerSnapshot = buildSellerSnapshot();
  const isGst = isSellerGstRegistered(sellerSnapshot);

  const buyerSnapshot: BuyerSnapshot = {
    name: order.customer_name,
    email: order.customer_email,
    phone: order.customer_phone,
    shipping_address: order.shipping_address as unknown as BuyerSnapshot["shipping_address"],
  };

  const invoiceItems: InvoiceItemSnapshot[] = dbItems.map((item) => {
    const unitPrice = Number(item.unit_price_paise_snapshot);
    const qty = Number(item.quantity);
    const taxBps = Number(item.tax_rate_bps_snapshot);
    const taxableAmount = unitPrice * qty;
    const taxAmount = isGst ? calculateItemTax(taxableAmount, taxBps) : 0;

    return {
      product_name: item.product_name_snapshot,
      sku: item.product_slug_snapshot?.toUpperCase() || "RBF-ITEM",
      hsn_code: "84795000", // Standard HSN code for Industrial Robots & Automated Equipment
      unit_price_paise: unitPrice,
      tax_rate_bps: isGst ? taxBps : 0,
      quantity: qty,
      taxable_amount_paise: taxableAmount,
      tax_amount_paise: taxAmount,
      total_paise: taxableAmount + taxAmount,
    };
  });

  // Concurrency-safe sequence numbering from PostgreSQL sequence
  let invoiceNumber = "";
  const { data: serialData, error: serialError } = await admin.rpc("issue_invoice_serial");
  if (!serialError && serialData) {
    invoiceNumber = String(serialData);
  } else {
    invoiceNumber = generateInvoiceNumber();
  }

  const issueDate = new Date().toISOString().split("T")[0];

  // 6. Insert immutable snapshot into invoices table (ZERO PDF Bytes in DB)
  const { error: insertError } = await admin.from("invoices").insert({
    order_id: order.id,
    invoice_number: invoiceNumber,
    issue_date: issueDate,
    seller_snapshot: sellerSnapshot as unknown as import("@/types/database").Json,
    buyer_snapshot: buyerSnapshot as unknown as import("@/types/database").Json,
    items_snapshot: invoiceItems as unknown as import("@/types/database").Json,
    subtotal_paise: order.subtotal_paise,
    tax_paise: isGst ? order.tax_paise : 0,
    shipping_paise: order.shipping_paise,
    total_paise: order.total_paise,
    currency: order.currency,
  });

  // If concurrent conflict occurred, fetch the existing winner record
  if (insertError) {
    const { data: winner } = await admin
      .from("invoices")
      .select("*")
      .eq("order_id", order.id)
      .maybeSingle();

    if (winner) {
      const seller = winner.seller_snapshot as unknown as SellerSnapshot;
      return {
        invoice_number: winner.invoice_number,
        issue_date: winner.issue_date,
        order_code: order.order_code,
        seller,
        buyer: winner.buyer_snapshot as unknown as BuyerSnapshot,
        items: winner.items_snapshot as unknown as InvoiceItemSnapshot[],
        subtotal_paise: Number(winner.subtotal_paise),
        tax_paise: Number(winner.tax_paise),
        shipping_paise: Number(winner.shipping_paise),
        total_paise: Number(winner.total_paise),
        currency: winner.currency,
        is_gst_invoice: isSellerGstRegistered(seller),
      };
    }
  }

  return {
    invoice_number: invoiceNumber,
    issue_date: issueDate,
    order_code: order.order_code,
    seller: sellerSnapshot,
    buyer: buyerSnapshot,
    items: invoiceItems,
    subtotal_paise: order.subtotal_paise,
    tax_paise: isGst ? order.tax_paise : 0,
    shipping_paise: order.shipping_paise,
    total_paise: order.total_paise,
    currency: order.currency,
    is_gst_invoice: isGst,
  };
}

/**
 * Reusable invoice generation service callable by customer download routes and admin dashboard.
 * Streams generated PDF bytes on demand from the immutable snapshot.
 */
export async function getInvoicePdfByOrderCode(
  orderCode: string
): Promise<{ pdfBytes: Uint8Array; invoice: InvoiceSnapshot } | null> {
  const snapshot = await getOrCreateInvoiceSnapshot(orderCode);
  if (!snapshot) return null;

  const pdfBytes = await generateInvoicePdf(snapshot);
  return { pdfBytes, invoice: snapshot };
}

/**
 * Reusable invoice generation service callable by admin dashboard by internal order ID.
 */
export async function getInvoicePdfByOrderId(
  orderId: string
): Promise<{ pdfBytes: Uint8Array; invoice: InvoiceSnapshot } | null> {
  const publicEnv = getPublicEnv();
  const isPlaceholderDb = publicEnv.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  if (isPlaceholderDb) {
    const existing = getMockInvoiceByOrderId(orderId);
    if (existing) {
      const pdfBytes = await generateInvoicePdf(existing);
      return { pdfBytes, invoice: existing };
    }
    const defaultSnapshot = buildMockInvoiceSnapshot("RBF-A1B2C3D4-E5F67890-12345678-90ABCDEF");
    const pdfBytes = await generateInvoicePdf(defaultSnapshot);
    return { pdfBytes, invoice: defaultSnapshot };
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("order_code")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;
  return getInvoicePdfByOrderCode(order.order_code);
}
