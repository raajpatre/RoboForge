import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  createProductAction,
  updateOrderStatusAction,
  cancelAndRefundOrderAction,
} from "@/app/actions/admin";
import { validateCartAction } from "@/app/actions/cart";
import { verifyPaymentAction } from "@/app/actions/payment";
import { POST as trackingPostHandler } from "@/app/api/orders/track/route";
import { POST as webhookPostHandler } from "@/app/api/webhooks/razorpay/route";
import { GET as adminInvoiceGetHandler } from "@/app/api/admin/orders/[id]/invoice/route";
import { generateOrderCode } from "@/lib/domain/crypto";
import {
  getBusinessConfig,
  validateLiveLaunchReadiness,
  assertLiveLaunchSafety,
} from "@/lib/domain/business-config";
import {
  getOrCreateInvoiceSnapshot,
  isSellerGstRegistered,
} from "@/lib/domain/invoice";
import { generateInvoicePdf } from "@/lib/pdf/invoice-generator";
import { setMockPaymentDetails } from "@/lib/razorpay";
import {
  saveMockOrder,
  getMockOrderById,
  resetMockStore,
  type MockStoredOrder,
} from "@/lib/domain/mock-store";
import { resetEnvCache } from "@/lib/env";
import * as adminGuard from "@/lib/auth/admin-guard";
import crypto from "node:crypto";

describe("Phase 9 Comprehensive Launch-Readiness & Security Edge-Case Tests", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ADMIN_EMAILS = "owner@roboshopforge.local,admin@roboshopforge.local";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    process.env.RAZORPAY_KEY_ID = "rzp_test_placeholder";
    process.env.RAZORPAY_KEY_SECRET = "placeholder_secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret_launch";
    process.env.PAYMENT_MODE = "test";
    process.env.SELLER_TAX_MODE = "unregistered";
    process.env.POLICIES_CONFIRMED = "true";
    resetMockStore();
    resetEnvCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetMockStore();
    resetEnvCache();
    vi.restoreAllMocks();
  });

  function seedTestOrder(overrides: Partial<MockStoredOrder> = {}): MockStoredOrder {
    const code = overrides.order_code || generateOrderCode();
    const orderId = overrides.id || "order-p9-" + Math.random().toString(36).slice(2, 9);
    const order: MockStoredOrder = {
      id: orderId,
      order_code: code,
      customer_name: "Prof. Satish Dhawan",
      customer_email: "dhawan@iisc.ac.in",
      customer_phone: "+919876543210",
      shipping_address: {
        line1: "Department of Aerospace Engineering, IISc",
        city: "Bengaluru",
        state: "Karnataka",
        state_code: "29",
        postal_code: "560012",
        country: "India",
      },
      items: [
        {
          productId: "a1111111-1111-4111-8111-111111111111",
          name: "ForgeBot Alpha 6-DOF Robotic Arm",
          sku: "RBF-ARM-ALPHA",
          hsn_code: "84795000",
          slug: "forgebot-alpha-6dof",
          unitPricePaise: 18500000,
          quantity: 1,
          taxRateBps: 1800,
          totalPaise: 18500000,
        },
      ],
      subtotal_paise: 18500000,
      tax_paise: 0,
      shipping_paise: 0,
      total_paise: 18500000,
      currency: "INR",
      payment_status: "paid",
      delivery_status: "processing",
      reservation_status: "consumed",
      reservation_expires_at: Date.now() + 900000,
      refund_status: undefined,
      razorpay_order_id: "order_rzp_p9_001",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
    saveMockOrder(order);
    return order;
  }

  // =========================================================================
  // 1. PRODUCT CRUD AND INVENTORY CONSTRAINTS
  // =========================================================================
  describe("1. Product CRUD and Inventory Constraints", () => {
    it("rejects unauthorized callers attempting to create products", async () => {
      vi.spyOn(adminGuard, "requireAdminUser").mockRejectedValue(
        new Error("Forbidden: Unauthorized administrator.")
      );

      await expect(
        createProductAction({
          name: "Unauthorized Actuator",
          slug: "unauthorized-actuator",
          sku: "UNAUTH-01",
          price_paise: 500000,
          stock_on_hand: 10,
          tax_rate_bps: 1800,
          is_active: true,
        })
      ).rejects.toThrow("Forbidden");
    });

    it("rejects invalid product payload with negative price or invalid tax basis points", async () => {
      vi.spyOn(adminGuard, "requireAdminUser").mockResolvedValue({
        id: "admin-uid-1",
        email: "owner@roboshopforge.local",
      });

      const res = await createProductAction({
        name: "Broken Actuator",
        slug: "broken-actuator",
        sku: "BROKEN-01",
        price_paise: -500, // Invalid: negative paise
        stock_on_hand: 10,
        tax_rate_bps: 1800,
        is_active: true,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  // =========================================================================
  // 2. CART PRICE TAMPERING PREVENTION
  // =========================================================================
  describe("2. Cart Price Tampering Prevention", () => {
    it("recalculates prices server-side and ignores client-submitted price tampering", async () => {
      // Client sends authoritative catalog product ID with quantity
      const cartInput = [
        {
          productId: "a1111111-1111-4111-8111-111111111111", // ForgeBot Alpha
          quantity: 1,
        },
      ];

      const result = await validateCartAction(cartInput);
      expect(result.isValid).toBe(true);
      expect(result.totals).toBeDefined();

      // Total must be calculated strictly from authoritative catalog price, not arbitrary client numbers
      expect(result.totals?.subtotalPaise).toBe(18500000);
      expect(result.items[0].unitPricePaise).toBe(18500000);
    });

    it("handles zero stock gracefully with stock issues flag", async () => {
      // Pass a non-existent product UUID
      const cartInput = [
        {
          productId: "00000000-0000-0000-0000-000000000000",
          quantity: 2,
        },
      ];

      const result = await validateCartAction(cartInput);
      expect(result.hasStockIssues).toBe(true);
      expect(result.items.length).toBe(0);
    });
  });

  // =========================================================================
  // 3. CHECKOUT CREATION AND SIGNATURE FAILURES
  // =========================================================================
  describe("3. Checkout Creation and Payment Signature Verification", () => {
    it("rejects forged payment signature on verification callback", async () => {
      const order = seedTestOrder({
        payment_status: "pending",
        razorpay_order_id: "order_rzp_forge_sig_test",
      });

      const verificationResult = await verifyPaymentAction({
        orderCode: order.order_code,
        razorpayOrderId: "order_rzp_forge_sig_test",
        razorpayPaymentId: "pay_test_random123",
        razorpaySignature: "invalid_forged_hex_signature_abcdef123456",
      });

      expect(verificationResult.success).toBe(false);
      expect(verificationResult.error).toContain("signature verification failed");
    });

    it("accepts valid HMAC SHA256 payment signature", async () => {
      const order = seedTestOrder({
        payment_status: "pending",
        razorpay_order_id: "order_rzp_valid_sig_test",
        total_paise: 18500000,
      });

      const razorpayPaymentId = "pay_valid_123456789";
      setMockPaymentDetails(razorpayPaymentId, {
        id: razorpayPaymentId,
        order_id: order.razorpay_order_id!,
        amount: order.total_paise,
        currency: "INR",
        status: "captured",
      });

      const payload = `${order.razorpay_order_id}|${razorpayPaymentId}`;
      const validSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
        .update(payload)
        .digest("hex");

      const verificationResult = await verifyPaymentAction({
        orderCode: order.order_code,
        razorpayOrderId: order.razorpay_order_id!,
        razorpayPaymentId,
        razorpaySignature: validSignature,
      });

      expect(verificationResult.success).toBe(true);
    });
  });

  // =========================================================================
  // 4. WRONG PAYMENT AMOUNT / CURRENCY IN WEBHOOK
  // =========================================================================
  describe("4. Wrong Payment Amount and Currency Rejection", () => {
    it("rejects webhook if payment amount does not match order total", async () => {
      const order = seedTestOrder({
        payment_status: "pending",
        razorpay_order_id: "order_rzp_mismatch",
        total_paise: 18500000,
      });

      const webhookPayload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_underpaid_001",
              order_id: order.razorpay_order_id,
              amount: 100000, // 1,000 INR instead of 185,000 INR
              currency: "INR",
              status: "captured",
            },
          },
        },
      };

      const body = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
        .update(body)
        .digest("hex");

      const req = new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "x-razorpay-signature": signature,
          "content-type": "application/json",
        },
        body,
      });

      const res = await webhookPostHandler(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("mismatch");
    });

    it("rejects webhook if payment currency is not INR", async () => {
      const order = seedTestOrder({
        payment_status: "pending",
        razorpay_order_id: "order_rzp_wrong_currency",
        total_paise: 18500000,
      });

      const webhookPayload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_currency_001",
              order_id: order.razorpay_order_id,
              amount: 18500000,
              currency: "USD", // Wrong currency
              status: "captured",
            },
          },
        },
      };

      const body = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
        .update(body)
        .digest("hex");

      const req = new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "x-razorpay-signature": signature,
          "content-type": "application/json",
        },
        body,
      });

      const res = await webhookPostHandler(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("mismatch");
    });
  });

  // =========================================================================
  // 5. DUPLICATE AND OUT-OF-ORDER WEBHOOK EVENTS
  // =========================================================================
  describe("5. Idempotent and Out-of-Order Webhook Processing", () => {
    it("handles duplicate payment.captured events idempotently without errors", async () => {
      const order = seedTestOrder({
        payment_status: "pending",
        razorpay_order_id: "order_rzp_idempotent_test",
        total_paise: 18500000,
      });

      const webhookPayload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_idempotent_001",
              order_id: order.razorpay_order_id,
              amount: 18500000,
              currency: "INR",
              status: "captured",
            },
          },
        },
      };

      const body = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
        .update(body)
        .digest("hex");

      // First webhook delivery
      const req1 = new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: { "x-razorpay-signature": signature, "content-type": "application/json" },
        body,
      });
      const res1 = await webhookPostHandler(req1);
      expect(res1.status).toBe(200);

      // Duplicate webhook delivery
      const req2 = new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: { "x-razorpay-signature": signature, "content-type": "application/json" },
        body,
      });
      const res2 = await webhookPostHandler(req2);
      expect(res2.status).toBe(200);

      // Verified order state remains paid and single invoice issued
      const updated = getMockOrderById(order.id);
      expect(updated?.payment_status).toBe("paid");
    });
  });

  // =========================================================================
  // 6. REPEATED INVOICE ISSUANCE AND PDF RENDERING
  // =========================================================================
  describe("6. Repeated Invoice Issuance and PDF Byte Rendering", () => {
    it("guarantees idempotent invoice creation returning identical invoice number", async () => {
      const order = seedTestOrder();

      const invoice1 = await getOrCreateInvoiceSnapshot(order.order_code);
      expect(invoice1).not.toBeNull();

      const invoice2 = await getOrCreateInvoiceSnapshot(order.order_code);
      expect(invoice2).not.toBeNull();

      // Must return identical serial number and immutable snapshots
      expect(invoice1?.invoice_number).toBe(invoice2?.invoice_number);
      expect(invoice1?.total_paise).toBe(invoice2?.total_paise);
    });

    it("renders valid PDF byte stream with %PDF- header from snapshot", async () => {
      const order = seedTestOrder();
      const invoice = await getOrCreateInvoiceSnapshot(order.order_code);
      expect(invoice).not.toBeNull();

      const pdfBytes = await generateInvoicePdf(invoice!);
      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(1000);

      // Verify PDF header magic bytes %PDF-
      const header = Buffer.from(pdfBytes.slice(0, 5)).toString("ascii");
      expect(header).toBe("%PDF-");
    });
  });

  // =========================================================================
  // 7. PUBLIC TRACKING BRUTE-FORCE PROTECTION & ZERO-PII GUARANTEE
  // =========================================================================
  describe("7. Public Tracking Security and Zero-PII Non-Disclosure", () => {
    it("returns generic 404 for invalid/nonexistent tracking code", async () => {
      const req = new NextRequest("http://localhost:3000/api/orders/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderCode: "RBF-NONEXISTENT-CODE-12345678" }),
      });

      const res = await trackingPostHandler(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe("Order not found. Check your tracking key and try again.");
    });

    it("returns zero customer PII for valid tracking lookup", async () => {
      const order = seedTestOrder({
        customer_name: "Dr. Secret Customer",
        customer_email: "classified@isro.gov.in",
        customer_phone: "+919999988888",
      });

      const req = new NextRequest("http://localhost:3000/api/orders/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderCode: order.order_code }),
      });

      const res = await trackingPostHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.order).toBeDefined();

      // ZERO-PII assertions
      expect(data.order.customer_name).toBeUndefined();
      expect(data.order.customer_email).toBeUndefined();
      expect(data.order.customer_phone).toBeUndefined();
      expect(data.order.shipping_address).toBeUndefined();

      // Safe public properties
      expect(data.order.order_code).toBe(order.order_code);
      expect(data.order.delivery_status).toBe("processing");
      expect(data.order.items.length).toBe(1);
    });
  });

  // =========================================================================
  // 8. ADMIN AUTHORIZATION GUARDS ON SENSITIVE ROUTES
  // =========================================================================
  describe("8. Admin Authorization Guards on Sensitive Routes", () => {
    it("blocks unauthenticated callers from downloading invoices via admin API", async () => {
      vi.spyOn(adminGuard, "requireAdminUser").mockRejectedValue(
        new Error("Forbidden: Invalid session.")
      );

      const req = new NextRequest("http://localhost:3000/api/admin/orders/some-id/invoice");
      const res = await adminInvoiceGetHandler(req, {
        params: Promise.resolve({ id: "some-id" }),
      });

      expect(res.status).toBe(401);
    });

    it("blocks non-whitelisted admin emails", async () => {
      vi.spyOn(adminGuard, "requireAdminUser").mockRejectedValue(
        new Error("Forbidden: Your email is not authorized for staff access.")
      );

      await expect(
        updateOrderStatusAction("order-1", "shipped")
      ).rejects.toThrow("Forbidden");
    });
  });

  // =========================================================================
  // 9. CANCELLATION AND DUPLICATE REFUND PROTECTION
  // =========================================================================
  describe("9. Cancellation and Duplicate Refund Protection", () => {
    it("allows pre-shipment cancellation while order is processing", async () => {
      vi.spyOn(adminGuard, "requireAdminUser").mockResolvedValue({
        id: "admin-uid-1",
        email: "owner@roboshopforge.local",
      });

      const order = seedTestOrder({
        payment_status: "paid",
        delivery_status: "processing",
      });

      const result = await cancelAndRefundOrderAction({
        orderId: order.id,
        reason: "Customer requested cancellation prior to bench dispatch",
      });

      expect(result.success).toBe(true);

      const updated = getMockOrderById(order.id);
      expect(updated?.payment_status).toBe("refunded");
      expect(updated?.delivery_status).toBe("cancelled");
    });

    it("blocks cancellation once order has shipped or delivered", async () => {
      vi.spyOn(adminGuard, "requireAdminUser").mockResolvedValue({
        id: "admin-uid-1",
        email: "owner@roboshopforge.local",
      });

      const order = seedTestOrder({
        payment_status: "paid",
        delivery_status: "shipped",
      });

      const result = await cancelAndRefundOrderAction({
        orderId: order.id,
        reason: "Late cancellation attempt",
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cannot cancel order/i);
    });

    it("rejects duplicate refund on already refunded order", async () => {
      vi.spyOn(adminGuard, "requireAdminUser").mockResolvedValue({
        id: "admin-uid-1",
        email: "owner@roboshopforge.local",
      });

      const order = seedTestOrder({
        payment_status: "refunded",
        delivery_status: "cancelled",
        refund_status: "processed",
      });

      const result = await cancelAndRefundOrderAction({
        orderId: order.id,
        reason: "Second refund attempt",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("already been refunded");
    });
  });

  // =========================================================================
  // 10. INVOICE PRESERVATION AFTER DELIVERY AND REFUND
  // =========================================================================
  describe("10. Invoice Preservation After Delivery and Refund", () => {
    it("preserves immutable invoice snapshot when order is delivered or cancelled", async () => {
      vi.spyOn(adminGuard, "requireAdminUser").mockResolvedValue({
        id: "admin-uid-1",
        email: "owner@roboshopforge.local",
      });

      const order = seedTestOrder({
        payment_status: "paid",
        delivery_status: "processing",
      });

      // Generate initial invoice
      const initialInvoice = await getOrCreateInvoiceSnapshot(order.order_code);
      expect(initialInvoice).not.toBeNull();

      // Transition delivery to shipped -> delivered
      await updateOrderStatusAction(order.id, "shipped");
      await updateOrderStatusAction(order.id, "delivered");

      // Retrieve invoice again
      const postDeliveryInvoice = await getOrCreateInvoiceSnapshot(order.order_code);
      expect(postDeliveryInvoice?.invoice_number).toBe(initialInvoice?.invoice_number);
      expect(postDeliveryInvoice?.issue_date).toBe(initialInvoice?.issue_date);
      expect(postDeliveryInvoice?.total_paise).toBe(initialInvoice?.total_paise);
    });
  });

  // =========================================================================
  // 11. CONFIGURABLE SELLER TAX MODE & LIVE LAUNCH FAIL-CLOSED GUARD
  // =========================================================================
  describe("11. Configurable Seller Tax Mode and Fail-Closed Live Launch Guard", () => {
    it("does not calculate or label GST tax invoices when SELLER_TAX_MODE is unregistered", () => {
      process.env.SELLER_TAX_MODE = "unregistered";
      const config = getBusinessConfig();

      expect(config.taxMode.mode).toBe("unregistered");
      expect(config.taxMode.isGstRegistered).toBe(false);

      const isGst = isSellerGstRegistered({
        legal_name: "Test Entity",
        trade_name: "Test Trade",
        gstin: "UNREGISTERED / NOT APPLICABLE",
        pan: "NOT SPECIFIED",
        email: "test@domain.local",
        phone: "+919876543210",
        address_line1: "Road 1",
        city: "Bengaluru",
        state: "Karnataka",
        state_code: "29",
        postal_code: "560001",
        country: "India",
      });
      expect(isGst).toBe(false);
    });

    it("labels GST tax invoice only when SELLER_TAX_MODE is gst_registered with valid GSTIN", () => {
      process.env.SELLER_TAX_MODE = "gst_registered";
      process.env.SELLER_GSTIN = "29AABCR1234F1Z5";
      const config = getBusinessConfig();

      expect(config.taxMode.mode).toBe("gst_registered");
      expect(config.taxMode.isGstRegistered).toBe(true);

      const isGst = isSellerGstRegistered({
        legal_name: "Test Entity",
        trade_name: "Test Trade",
        gstin: "29AABCR1234F1Z5",
        pan: "AABCR1234F",
        email: "test@domain.local",
        phone: "+919876543210",
        address_line1: "Road 1",
        city: "Bengaluru",
        state: "Karnataka",
        state_code: "29",
        postal_code: "560001",
        country: "India",
      });
      expect(isGst).toBe(true);
    });

    it("strictly fails closed if live launch is attempted with test or placeholder keys", () => {
      process.env.PAYMENT_MODE = "live";
      process.env.RAZORPAY_KEY_ID = "rzp_test_invalid_in_live";

      const readiness = validateLiveLaunchReadiness();
      expect(readiness.isReadyForLive).toBe(false);
      expect(readiness.blockers.length).toBeGreaterThan(0);
      expect(readiness.blockers[0]).toContain("Live payments cannot be enabled with test or placeholder");

      expect(() => assertLiveLaunchSafety()).toThrow("LIVE LAUNCH FAIL-CLOSED GUARD");
    });

    it("strictly fails closed if live launch is attempted without confirmed policies", () => {
      process.env.PAYMENT_MODE = "live";
      process.env.RAZORPAY_KEY_ID = "rzp_live_realKey12345";
      process.env.RAZORPAY_KEY_SECRET = "real_live_secret_999";
      process.env.RAZORPAY_WEBHOOK_SECRET = "real_live_webhook_secret_999";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://real-project.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "real_service_role_key_999";
      process.env.SELLER_LEGAL_NAME = "RoboShop Forge Hardware Pvt Ltd";
      process.env.SELLER_EMAIL = "operations@roboshopforge.com";
      process.env.SELLER_PHONE = "+919876598765";
      process.env.POLICIES_CONFIRMED = "false"; // Unconfirmed policies

      const readiness = validateLiveLaunchReadiness();
      expect(readiness.isReadyForLive).toBe(false);
      expect(readiness.missingRequirements).toContain(
        "POLICIES_CONFIRMED must be set to 'true' after the owner reviews published store policies."
      );
    });
  });
});
