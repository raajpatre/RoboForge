import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  getOrCreateInvoiceSnapshot,
  getInvoicePdfByOrderCode,
  getInvoicePdfByOrderId,
  buildSellerSnapshot,
  isSellerGstRegistered,
} from "@/lib/domain/invoice";
import { generateInvoicePdf, generateCreditNotePdf } from "@/lib/pdf/invoice-generator";
import {
  saveMockOrder,
  getMockInvoiceByOrderCode,
  resetMockStore,
  type MockStoredOrder,
} from "@/lib/domain/mock-store";
import { resetEnvCache } from "@/lib/env";
import { formatINRAscii } from "@/lib/domain/money";
import type { CreditNoteSnapshot } from "@/types/domain";

describe("Phase 6 Acceptance Tests: Immutable Invoices & On-Demand PDF Downloads", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    process.env.SELLER_LEGAL_NAME = "RoboShop Forge Technologies Pvt Ltd";
    process.env.SELLER_EMAIL = "finance@roboshopforge.local";
    process.env.SELLER_CITY = "Bengaluru";
    process.env.SELLER_STATE = "Karnataka";
    process.env.SELLER_STATE_CODE = "29";
    process.env.SELLER_POSTAL_CODE = "560058";
    process.env.SELLER_TAX_MODE = "gst_registered";
    process.env.SELLER_GSTIN = "29AABCR1234F1Z5";
    resetEnvCache();
    resetMockStore();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvCache();
    resetMockStore();
  });

  function createTestOrder(overrides: Partial<MockStoredOrder> = {}): MockStoredOrder {
    const code = overrides.order_code || "RBF-11112222-33334444-55556666-77778888";
    const order: MockStoredOrder = {
      id: overrides.id || "order-phase6-" + Math.random().toString(36).slice(2, 9),
      order_code: code,
      customer_name: "Dr. Vikram Sarabhai",
      customer_email: "vikram@robotics-research.org",
      customer_phone: "+919876543210",
      shipping_address: {
        line1: "Space Propulsion & Actuator Wing",
        city: "Bengaluru",
        state: "Karnataka",
        state_code: "29",
        postal_code: "560078",
        country: "India",
      },
      items: [
        {
          productId: "prod-alpha-arm",
          sku: "RBF-ARM-001",
          name: "ForgeBot Alpha 6-DOF Robotic Arm",
          slug: "forgebot-alpha-6dof",
          unitPricePaise: 18500000,
          quantity: 1,
          taxRateBps: 1800,
          totalPaise: 21830000,
          hsn_code: "84795000",
        },
      ],
      subtotal_paise: 18500000,
      tax_paise: 3330000,
      shipping_paise: 0,
      total_paise: 21830000,
      currency: "INR",
      payment_status: "paid",
      delivery_status: "pending",
      reservation_expires_at: Date.now() + 600000,
      reservation_status: "consumed",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
    saveMockOrder(order);
    return order;
  }

  // Acceptance Criterion 1: Successful test payment creates one invoice record.
  it("creates exactly one invoice record once payment is confirmed", async () => {
    const order = createTestOrder({ payment_status: "paid" });

    const invoice = await getOrCreateInvoiceSnapshot(order.order_code);
    expect(invoice).not.toBeNull();
    expect(invoice?.order_code).toBe(order.order_code);
    expect(invoice?.invoice_number).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(invoice?.total_paise).toBe(21830000);
    expect(invoice?.currency).toBe("INR");

    // Line items verified
    expect(invoice?.items).toHaveLength(1);
    expect(invoice?.items[0].sku).toBe("RBF-ARM-001");
    expect(invoice?.items[0].unit_price_paise).toBe(18500000);
    expect(invoice?.items[0].taxable_amount_paise).toBe(18500000);
    expect(invoice?.items[0].tax_amount_paise).toBe(3330000);

    // Persisted in invoice storage
    const stored = getMockInvoiceByOrderCode(order.order_code);
    expect(stored).toBeDefined();
    expect(stored?.invoice_number).toBe(invoice?.invoice_number);
  });

  // Acceptance Criterion 2: Repeated callbacks/webhooks do not create duplicate invoices.
  it("prevents duplicate invoices upon repeated callbacks, webhook re-deliveries, or manual checks", async () => {
    const order = createTestOrder({ payment_status: "paid" });

    // Call 1: Immediate callback settlement
    const firstInvoice = await getOrCreateInvoiceSnapshot(order.order_code);
    expect(firstInvoice).not.toBeNull();
    const originalInvoiceNumber = firstInvoice?.invoice_number;

    // Call 2: Webhook payment.captured re-delivery
    const secondInvoice = await getOrCreateInvoiceSnapshot(order.order_code);
    expect(secondInvoice).not.toBeNull();
    expect(secondInvoice?.invoice_number).toBe(originalInvoiceNumber);

    // Call 3: Customer downloads invoice from tracking page
    const thirdInvoice = await getOrCreateInvoiceSnapshot(order.order_code);
    expect(thirdInvoice).not.toBeNull();
    expect(thirdInvoice?.invoice_number).toBe(originalInvoiceNumber);
  });

  // Acceptance Criterion 3: PDF downloads reflect the stored snapshot, even if the product is edited later.
  it("ensures PDF downloads reflect the immutable stored snapshot even if product is edited later", async () => {
    const order = createTestOrder({
      payment_status: "paid",
      items: [
        {
          productId: "prod-dynamic-servo",
          sku: "RBF-SERVO-MG996",
          name: "Original Precision Titanium Core Servo Motor",
          slug: "precision-servo-motor",
          unitPricePaise: 250000, // 2,500 INR
          quantity: 2,
          taxRateBps: 1800,
          totalPaise: 590000,
          hsn_code: "85011019",
        },
      ],
      subtotal_paise: 500000,
      tax_paise: 90000,
      total_paise: 590000,
    });

    // 1. Freeze snapshot at payment confirmation
    const frozenInvoice = await getOrCreateInvoiceSnapshot(order.order_code);
    expect(frozenInvoice).not.toBeNull();
    expect(frozenInvoice?.items[0].product_name).toBe("Original Precision Titanium Core Servo Motor");
    expect(frozenInvoice?.items[0].unit_price_paise).toBe(250000);
    expect(frozenInvoice?.total_paise).toBe(590000);

    // 2. Simulate subsequent mutation in active product catalog (e.g., price increased to 99,000 INR, name altered)
    order.items[0].name = "MUTATED PRODUCT NAME 2027 ULTRA EDITION";
    order.items[0].unitPricePaise = 9900000;
    order.items[0].totalPaise = 23364000;
    saveMockOrder(order);

    // 3. Customer or Admin downloads invoice later
    const result = await getInvoicePdfByOrderCode(order.order_code);
    expect(result).not.toBeNull();
    expect(result?.invoice.items[0].product_name).toBe("Original Precision Titanium Core Servo Motor");
    expect(result?.invoice.items[0].unit_price_paise).toBe(250000);
    expect(result?.invoice.total_paise).toBe(590000);

    // 4. Verify generated PDF bytes are valid
    expect(result?.pdfBytes).toBeInstanceOf(Uint8Array);
    const parsedPdf = await PDFDocument.load(result!.pdfBytes);
    expect(parsedPdf.getPageCount()).toBe(1);
  });

  // Acceptance Criterion 4: PDF includes all line items and correct paise-based totals.
  it("includes all multi-line items with accurate integer paise-based calculations and formatting", async () => {
    const multiItemOrder = createTestOrder({
      order_code: "RBF-MULTI-1111-2222-3333-444455556666",
      payment_status: "paid",
      items: [
        {
          productId: "p1",
          sku: "RBF-ARM-001",
          name: "ForgeBot Alpha 6-DOF Robotic Arm",
          slug: "forgebot-alpha",
          unitPricePaise: 18500000, // 1,85,000 INR
          quantity: 1,
          taxRateBps: 1800,
          totalPaise: 21830000,
          hsn_code: "84795000",
        },
        {
          productId: "p2",
          sku: "RBF-LIDAR-02",
          name: "Solid-State 3D LiDAR Scanner Module",
          slug: "solid-state-lidar",
          unitPricePaise: 4200000, // 42,000 INR
          quantity: 2,
          taxRateBps: 1800,
          totalPaise: 9912000,
          hsn_code: "90151000",
        },
        {
          productId: "p3",
          sku: "RBF-CABLE-05",
          name: "High-Flex Shielded Robotic Bus Harness",
          slug: "robotic-bus-harness",
          unitPricePaise: 150000, // 1,500 INR
          quantity: 4,
          taxRateBps: 1800,
          totalPaise: 708000,
          hsn_code: "85444299",
        },
      ],
      subtotal_paise: 18500000 + 8400000 + 600000, // 2,75,00,000 paise (2,75,000 INR)
      tax_paise: 3330000 + 1512000 + 108000,      // 49,50,000 paise (49,500 INR)
      shipping_paise: 0,
      total_paise: 32450000,                        // 3,24,50,000 paise (3,24,500 INR)
    });

    const invoice = await getOrCreateInvoiceSnapshot(multiItemOrder.order_code);
    expect(invoice).not.toBeNull();
    expect(invoice?.items).toHaveLength(3);
    expect(invoice?.subtotal_paise).toBe(27500000);
    expect(invoice?.tax_paise).toBe(4950000);
    expect(invoice?.total_paise).toBe(32450000);

    // Verify ASCII formatted strings
    expect(formatINRAscii(invoice!.subtotal_paise)).toBe("INR 2,75,000.00");
    expect(formatINRAscii(invoice!.total_paise)).toBe("INR 3,24,500.00");

    // Generate PDF and verify structural integrity
    const pdfBytes = await generateInvoicePdf(invoice!);
    expect(pdfBytes.length).toBeGreaterThan(1000);

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  // Acceptance Criterion 5: Invoice records persist after delivery and refunds.
  it("persists invoice records indefinitely across delivery advancement and refunds", async () => {
    const order = createTestOrder({
      order_code: "RBF-LIFECYCLE-9999-8888-7777-666655554444",
      payment_status: "paid",
      delivery_status: "pending",
    });

    // 1. Initial Invoice
    const invoiceAtPayment = await getOrCreateInvoiceSnapshot(order.order_code);
    expect(invoiceAtPayment).not.toBeNull();
    const initialInvoiceNumber = invoiceAtPayment?.invoice_number;

    // 2. Order transitions through full delivery pipeline
    order.delivery_status = "processing";
    saveMockOrder(order);
    let invoiceCheck = await getOrCreateInvoiceSnapshot(order.order_code);
    expect(invoiceCheck?.invoice_number).toBe(initialInvoiceNumber);

    order.delivery_status = "shipped";
    saveMockOrder(order);
    invoiceCheck = await getOrCreateInvoiceSnapshot(order.order_code);
    expect(invoiceCheck?.invoice_number).toBe(initialInvoiceNumber);

    order.delivery_status = "delivered";
    saveMockOrder(order);
    invoiceCheck = await getOrCreateInvoiceSnapshot(order.order_code);
    expect(invoiceCheck?.invoice_number).toBe(initialInvoiceNumber);

    // 3. Refund occurs (customer return)
    order.payment_status = "refunded";
    saveMockOrder(order);

    const invoicePostRefund = await getOrCreateInvoiceSnapshot(order.order_code);
    expect(invoicePostRefund).not.toBeNull();
    expect(invoicePostRefund?.invoice_number).toBe(initialInvoiceNumber);
    expect(invoicePostRefund?.total_paise).toBe(invoiceAtPayment?.total_paise);

    // 4. Generate statutory credit note for refund without altering the original invoice
    const creditNote: CreditNoteSnapshot = {
      credit_note_number: "CN-2026-000001",
      original_invoice_number: invoicePostRefund!.invoice_number,
      issue_date: "2026-10-26",
      order_code: order.order_code,
      seller: invoicePostRefund!.seller,
      buyer: invoicePostRefund!.buyer,
      refund_amount_paise: invoicePostRefund!.total_paise,
      reason: "Full warranty return refund processed through Razorpay payment gateway.",
      currency: "INR",
    };

    const cnPdf = await generateCreditNotePdf(creditNote);
    expect(cnPdf).toBeInstanceOf(Uint8Array);
    const parsedCn = await PDFDocument.load(cnPdf);
    expect(parsedCn.getPageCount()).toBe(1);
  });

  // Acceptance Criterion 6: Tax configuration, missing seller details, and PDF rendering.
  describe("Tax Configuration Compliance & Seller Validation", () => {
    it("never labels document a GST tax invoice unless seller's real tax configuration supports it", async () => {
      // 1. Unregistered Seller
      process.env.SELLER_GSTIN = "UNREGISTERED / NOT APPLICABLE";
      resetEnvCache();

      const unregisteredSeller = buildSellerSnapshot();
      expect(isSellerGstRegistered(unregisteredSeller)).toBe(false);

      const unregisteredOrder = createTestOrder({
        order_code: "RBF-UNREG-1111-2222-3333-444455556666",
        payment_status: "paid",
      });

      const unregInvoice = await getOrCreateInvoiceSnapshot(unregisteredOrder.order_code);
      expect(unregInvoice?.is_gst_invoice).toBe(false);

      const unregPdf = await generateInvoicePdf(unregInvoice!);
      expect(unregPdf.length).toBeGreaterThan(1000);

      // 2. GST Registered Seller
      process.env.SELLER_GSTIN = "29AABCR1234F1Z5";
      resetEnvCache();

      const registeredSeller = buildSellerSnapshot();
      expect(isSellerGstRegistered(registeredSeller)).toBe(true);

      const registeredOrder = createTestOrder({
        order_code: "RBF-REG-1111-2222-3333-444455556666",
        payment_status: "paid",
      });

      const regInvoice = await getOrCreateInvoiceSnapshot(registeredOrder.order_code);
      expect(regInvoice?.is_gst_invoice).toBe(true);

      const regPdf = await generateInvoicePdf(regInvoice!);
      expect(regPdf.length).toBeGreaterThan(1000);
    });

    it("fails early and safely when mandatory seller configuration is missing", () => {
      process.env.SELLER_LEGAL_NAME = "";
      resetEnvCache();
      expect(() => buildSellerSnapshot()).toThrow(/SELLER_LEGAL_NAME is required/);

      process.env.SELLER_LEGAL_NAME = "RoboShop Forge";
      process.env.SELLER_CITY = "";
      resetEnvCache();
      expect(() => buildSellerSnapshot()).toThrow(/SELLER_CITY is required/);
    });

    it("provides admin reusable service by internal order ID", async () => {
      const order = createTestOrder({
        id: "order-admin-uuid-12345",
        order_code: "RBF-ADMIN-1111-2222-3333-444455556666",
        payment_status: "paid",
      });

      const invoice = await getOrCreateInvoiceSnapshot(order.order_code);
      expect(invoice).not.toBeNull();

      const adminResult = await getInvoicePdfByOrderId(order.id);
      expect(adminResult).not.toBeNull();
      expect(adminResult?.invoice.invoice_number).toBe(invoice?.invoice_number);
      expect(adminResult?.pdfBytes).toBeInstanceOf(Uint8Array);
    });
  });
});
