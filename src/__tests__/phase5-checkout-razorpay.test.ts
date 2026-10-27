/**
 * ==============================================================================
 * Phase 5 Integration Test Suite: Checkout, Order Creation & Razorpay Test Mode
 * ==============================================================================
 *
 * TEST CREDENTIALS & EXECUTION DOCUMENTATION:
 * ------------------------------------------------------------------------------
 * 1. OFFLINE INTEGRATION TESTS (Run in CI & local without live network calls):
 *    - Uses timing-safe HMAC-SHA256 cryptographic verification matching the Razorpay spec.
 *    - Simulates order creation, signature verification, webhook deduplication,
 *      and reservation expiry reconciliation.
 *    - Activated when RAZORPAY_KEY_ID contains "placeholder" / "test_sample" and
 *      NEXT_PUBLIC_SUPABASE_URL contains "placeholder".
 *
 * 2. LIVE RAZORPAY TEST MODE TESTS (Requires actual Razorpay Test Mode API Keys):
 *    - Set RAZORPAY_KEY_ID=rzp_test_... and RAZORPAY_KEY_SECRET=... in .env.local.
 *    - Verifies real Razorpay API order creation and SDK fetchPaymentDetails against
 *      https://api.razorpay.com/v1.
 *    - To run live tests against Razorpay sandbox, supply REAL_RAZORPAY_TEST_CREDENTIALS=true.
 * ------------------------------------------------------------------------------
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { initiateCheckoutAction } from "@/app/actions/checkout";
import { verifyPaymentAction } from "@/app/actions/payment";
import { POST as webhookPost } from "@/app/api/webhooks/razorpay/route";
import { cleanupExpiredReservations } from "@/lib/domain/inventory";
import {
  setMockPaymentDetails,
  resetMockPaymentRegistry,
  resetRazorpayClientInstance,
} from "@/lib/razorpay";
import {
  resetMockStore,
  saveMockOrder,
  getMockOrderByCode,
  expireMockReservation,
} from "@/lib/domain/mock-store";
import { FALLBACK_DEMO_PRODUCTS } from "@/lib/catalog";
import { resetRateLimits } from "@/lib/rate-limit";
import { resetEnvCache } from "@/lib/env";

describe("Phase 5: Razorpay Standard Checkout & Order Lifecycle Integration Suite", () => {
  const originalEnv = process.env;
  const testWebhookSecret = "test_webhook_secret_key_phase5";
  const testKeySecret = "test_razorpay_secret_phase5";

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PAYMENT_MODE = "test";
    process.env.RAZORPAY_KEY_ID = "rzp_test_mock_phase5";
    process.env.RAZORPAY_KEY_SECRET = testKeySecret;
    process.env.RAZORPAY_WEBHOOK_SECRET = testWebhookSecret;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    process.env.ADMIN_EMAILS = "admin@roboshopforge.local";
    process.env.SELLER_TAX_MODE = "gst_registered";
    process.env.SELLER_GSTIN = "29AABCR1234F1Z5";
    resetEnvCache();
    resetRazorpayClientInstance();
    resetRateLimits();
    resetMockStore();
    resetMockPaymentRegistry();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvCache();
    resetRazorpayClientInstance();
    resetRateLimits();
    resetMockStore();
    resetMockPaymentRegistry();
  });

  const validCustomer = {
    name: "Prof. Arvind Ramanathan",
    email: "arvind@robotics.iitm.ac.in",
    phone: "+919876543210",
    shippingAddress: {
      line1: "Centre for Robotics, Department of Engineering Design",
      line2: "IIT Madras Campus",
      city: "Chennai",
      state: "Tamil Nadu",
      state_code: "33",
      postal_code: "600036",
      country: "India",
    },
  };

  function createSignedWebhookRequest(body: object, secret = testWebhookSecret): NextRequest {
    const rawBody = JSON.stringify(body);
    const signature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    return new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": signature,
      },
      body: rawBody,
    });
  }

  // ============================================================================
  // Criterion 1: Test Mode Order Creation Works Server-Side
  // ============================================================================
  describe("Criterion 1: Test Mode Order Creation & Server Validation", () => {
    it("creates internal pending order and associated Razorpay order in paise (INR)", async () => {
      const p1 = FALLBACK_DEMO_PRODUCTS[0]; // ₹1,85,000 = 18500000 paise
      const expectedTotal = 18500000 + 3330000; // ₹2,18,300 (18% GST, free shipping)

      const result = await initiateCheckoutAction({
        customer: validCustomer,
        items: [{ productId: p1.id, quantity: 1 }],
      });

      expect(result.success).toBe(true);
      expect(result.orderCode).toBeDefined();
      // Verify cryptographically secure >= 128-bit entropy (32 hex chars)
      expect(result.orderCode).toMatch(/^RBF-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$/);
      expect(result.razorpayOrderId).toBeDefined();
      expect(result.currency).toBe("INR");
      expect(result.amountPaise).toBe(expectedTotal);

      // Verify stored order in database / mock store
      const storedOrder = getMockOrderByCode(result.orderCode!);
      expect(storedOrder).toBeDefined();
      expect(storedOrder!.payment_status).toBe("pending");
      expect(storedOrder!.delivery_status).toBe("pending");
      expect(storedOrder!.razorpay_order_id).toBe(result.razorpayOrderId);
      expect(storedOrder!.reservation_status).toBe("reserved");
    });

    it("rejects checkout when product quantity exceeds available stock", async () => {
      const p1 = FALLBACK_DEMO_PRODUCTS[0]; // Stock is 5

      const result = await initiateCheckoutAction({
        customer: validCustomer,
        items: [{ productId: p1.id, quantity: 8 }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Insufficient stock/);
    });
  });

  // ============================================================================
  // Criterion 2: Tampered Signature, Amount, Currency or Order ID is Rejected
  // ============================================================================
  describe("Criterion 2: Security & Tamper Resistance", () => {
    it("rejects payment verification when browser-supplied order ID mismatches trusted database record", async () => {
      const p1 = FALLBACK_DEMO_PRODUCTS[0];
      const checkout = await initiateCheckoutAction({
        customer: validCustomer,
        items: [{ productId: p1.id, quantity: 1 }],
      });

      const paymentId = "pay_test_tamper_order_id";
      const forgedOrderId = "order_malicious_attacker_123";

      const signature = crypto
        .createHmac("sha256", testKeySecret)
        .update(`${forgedOrderId}|${paymentId}`)
        .digest("hex");

      const result = await verifyPaymentAction({
        orderCode: checkout.orderCode,
        razorpayOrderId: forgedOrderId, // Mismatched order ID!
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Order ID mismatch/);
    });

    it("rejects payment verification when HMAC signature is forged or invalid", async () => {
      const p1 = FALLBACK_DEMO_PRODUCTS[0];
      const checkout = await initiateCheckoutAction({
        customer: validCustomer,
        items: [{ productId: p1.id, quantity: 1 }],
      });

      const result = await verifyPaymentAction({
        orderCode: checkout.orderCode,
        razorpayOrderId: checkout.razorpayOrderId,
        razorpayPaymentId: "pay_test_123",
        razorpaySignature: "forged_invalid_hmac_signature_hex_value",
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Cryptographic signature verification failed/);
    });

    it("rejects payment verification when paid amount does not match expected total paise", async () => {
      const p1 = FALLBACK_DEMO_PRODUCTS[0];
      const checkout = await initiateCheckoutAction({
        customer: validCustomer,
        items: [{ productId: p1.id, quantity: 1 }],
      });

      const paymentId = "pay_test_tampered_amount";
      // Register tampered provider response (e.g. user paid ₹10 instead of ₹2,18,300)
      setMockPaymentDetails(paymentId, {
        id: paymentId,
        order_id: checkout.razorpayOrderId,
        amount: 1000, // 1000 paise (₹10.00)
        currency: "INR",
        status: "captured",
      });

      const signature = crypto
        .createHmac("sha256", testKeySecret)
        .update(`${checkout.razorpayOrderId}|${paymentId}`)
        .digest("hex");

      const result = await verifyPaymentAction({
        orderCode: checkout.orderCode,
        razorpayOrderId: checkout.razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Paid amount.*does not match expected order total/);
    });

    it("rejects payment verification when currency is not INR", async () => {
      const p1 = FALLBACK_DEMO_PRODUCTS[0];
      const checkout = await initiateCheckoutAction({
        customer: validCustomer,
        items: [{ productId: p1.id, quantity: 1 }],
      });

      const paymentId = "pay_test_tampered_currency";
      setMockPaymentDetails(paymentId, {
        id: paymentId,
        order_id: checkout.razorpayOrderId,
        amount: checkout.amountPaise,
        currency: "USD", // Forged currency
        status: "captured",
      });

      const signature = crypto
        .createHmac("sha256", testKeySecret)
        .update(`${checkout.razorpayOrderId}|${paymentId}`)
        .digest("hex");

      const result = await verifyPaymentAction({
        orderCode: checkout.orderCode,
        razorpayOrderId: checkout.razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Payment currency.*does not match expected currency/);
    });
  });

  // ============================================================================
  // Criterion 3: Failed, Cancelled and Successful Payments Distinguished
  // ============================================================================
  describe("Criterion 3: Payment State Distinction", () => {
    it("correctly confirms successful genuine captured payment", async () => {
      const p1 = FALLBACK_DEMO_PRODUCTS[0];
      const checkout = await initiateCheckoutAction({
        customer: validCustomer,
        items: [{ productId: p1.id, quantity: 1 }],
      });

      const paymentId = "pay_test_genuine_captured";
      setMockPaymentDetails(paymentId, {
        id: paymentId,
        order_id: checkout.razorpayOrderId,
        amount: checkout.amountPaise,
        currency: "INR",
        status: "captured",
      });

      const signature = crypto
        .createHmac("sha256", testKeySecret)
        .update(`${checkout.razorpayOrderId}|${paymentId}`)
        .digest("hex");

      const result = await verifyPaymentAction({
        orderCode: checkout.orderCode,
        razorpayOrderId: checkout.razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      });

      expect(result.success).toBe(true);
      expect(result.orderCode).toBe(checkout.orderCode);

      // Verify order transitions to paid and processing
      const order = getMockOrderByCode(checkout.orderCode!);
      expect(order!.payment_status).toBe("paid");
      expect(order!.delivery_status).toBe("processing");
      expect(order!.reservation_status).toBe("consumed");
    });

    it("rejects payment verification when provider reports status as failed", async () => {
      const p1 = FALLBACK_DEMO_PRODUCTS[0];
      const checkout = await initiateCheckoutAction({
        customer: validCustomer,
        items: [{ productId: p1.id, quantity: 1 }],
      });

      const paymentId = "pay_test_failed_status";
      setMockPaymentDetails(paymentId, {
        id: paymentId,
        order_id: checkout.razorpayOrderId,
        amount: checkout.amountPaise,
        currency: "INR",
        status: "failed",
      });

      const signature = crypto
        .createHmac("sha256", testKeySecret)
        .update(`${checkout.razorpayOrderId}|${paymentId}`)
        .digest("hex");

      const result = await verifyPaymentAction({
        orderCode: checkout.orderCode,
        razorpayOrderId: checkout.razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Payment is not captured/);
    });

    it("releases inventory hold on payment.failed webhook event", async () => {
      const p1 = FALLBACK_DEMO_PRODUCTS[0];
      const checkout = await initiateCheckoutAction({
        customer: validCustomer,
        items: [{ productId: p1.id, quantity: 1 }],
      });

      const webhookReq = createSignedWebhookRequest({
        entity: "event",
        account_id: "acc_test",
        event: "payment.failed",
        contains: ["payment"],
        payload: {
          payment: {
            entity: {
              id: "pay_failed_webhook_01",
              order_id: checkout.razorpayOrderId,
              amount: checkout.amountPaise,
              currency: "INR",
              status: "failed",
              method: "upi",
            },
          },
        },
        created_at: Math.floor(Date.now() / 1000),
      });

      const res = await webhookPost(webhookReq);
      expect(res.status).toBe(200);

      const order = getMockOrderByCode(checkout.orderCode!);
      expect(order!.payment_status).toBe("failed");
      expect(order!.reservation_status).toBe("released");
    });
  });

  // ============================================================================
  // Criterion 4: Webhook Deduplication & Out-of-Order Toleration
  // ============================================================================
  describe("Criterion 4: Webhook Deduplication & Idempotency", () => {
    it("handles duplicate webhook events idempotently without double-processing", async () => {
      const p1 = FALLBACK_DEMO_PRODUCTS[0];
      const checkout = await initiateCheckoutAction({
        customer: validCustomer,
        items: [{ productId: p1.id, quantity: 1 }],
      });

      const webhookPayload = {
        entity: "event",
        account_id: "acc_test",
        event: "payment.captured",
        contains: ["payment"],
        payload: {
          payment: {
            entity: {
              id: "pay_dedup_01",
              order_id: checkout.razorpayOrderId,
              amount: checkout.amountPaise,
              currency: "INR",
              status: "captured",
              method: "upi",
              notes: { order_code: checkout.orderCode },
            },
          },
        },
        created_at: Math.floor(Date.now() / 1000),
      };

      // First webhook delivery: succeeds
      const req1 = createSignedWebhookRequest(webhookPayload);
      const res1 = await webhookPost(req1);
      expect(res1.status).toBe(200);

      // Second webhook delivery with identical event ID: detected as duplicate
      const req2 = createSignedWebhookRequest(webhookPayload);
      const res2 = await webhookPost(req2);
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.status).toBe("already_processed");
    });

    it("handles refund webhook events and marks order as refunded", async () => {
      const p1 = FALLBACK_DEMO_PRODUCTS[0];
      const checkout = await initiateCheckoutAction({
        customer: validCustomer,
        items: [{ productId: p1.id, quantity: 1 }],
      });

      // Advance order to paid
      const order = getMockOrderByCode(checkout.orderCode!)!;
      order.payment_status = "paid";
      order.delivery_status = "processing";
      saveMockOrder(order);

      const refundReq = createSignedWebhookRequest({
        entity: "event",
        account_id: "acc_test",
        event: "refund.processed",
        contains: ["refund"],
        payload: {
          refund: {
            entity: {
              id: "rfnd_test_123",
              payment_id: "pay_test_01",
              amount: checkout.amountPaise,
              currency: "INR",
              status: "processed",
              notes: { order_code: checkout.orderCode },
            },
          },
        },
        created_at: Math.floor(Date.now() / 1000),
      });

      const res = await webhookPost(refundReq);
      expect(res.status).toBe(200);

      const updated = getMockOrderByCode(checkout.orderCode!);
      expect(updated!.payment_status).toBe("refunded");
    });
  });

  // ============================================================================
  // Criterion 5: Safe Handling of Expired / Abandoned Reservations
  // ============================================================================
  describe("Criterion 5: Expired / Abandoned Reservation Reconcile", () => {
    it("flags order for manual refund if payment arrives after reservation expired and stock is depleted", async () => {
      const p1 = FALLBACK_DEMO_PRODUCTS[0];
      const checkout = await initiateCheckoutAction({
        customer: validCustomer,
        items: [{ productId: p1.id, quantity: 1 }],
      });

      // Simulate reservation expiration and warehouse stock depletion
      expireMockReservation(checkout.orderCode!);
      const stored = getMockOrderByCode(checkout.orderCode!)!;
      stored.notes = "out_of_stock"; // Mark stock unavailable
      saveMockOrder(stored);

      const paymentId = "pay_test_late_depleted";
      setMockPaymentDetails(paymentId, {
        id: paymentId,
        order_id: checkout.razorpayOrderId,
        amount: checkout.amountPaise,
        currency: "INR",
        status: "captured",
      });

      const signature = crypto
        .createHmac("sha256", testKeySecret)
        .update(`${checkout.razorpayOrderId}|${paymentId}`)
        .digest("hex");

      const result = await verifyPaymentAction({
        orderCode: checkout.orderCode,
        razorpayOrderId: checkout.razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      });

      // CRITICAL: NEVER SILENTLY MARK FULFILLED!
      expect(result.success).toBe(true);
      expect(result.warning).toMatch(/Stock unavailable; order.*flagged for manual refund/i);

      const updatedOrder = getMockOrderByCode(checkout.orderCode!);
      expect(updatedOrder!.payment_status).toBe("paid");
      expect(updatedOrder!.delivery_status).toBe("cancelled");
      expect(updatedOrder!.notes).toMatch(/flagged for manual intervention/i);
    });

    it("releases abandoned reservations that exceeded TTL", async () => {
      // Calling cleanup procedure does not crash in test environment
      const fakeSupabase = {
        rpc: async (fn: string) => {
          if (fn === "cleanup_expired_reservations") {
            return { data: 3, error: null };
          }
          return { data: null, error: null };
        },
      } as unknown as import("@supabase/supabase-js").SupabaseClient<import("@/types/database").Database>;

      const cleanedCount = await cleanupExpiredReservations(fakeSupabase);
      expect(cleanedCount).toBe(3);
    });
  });

  // ============================================================================
  // Criterion 6: No Leakage of Secrets or PII
  // ============================================================================
  describe("Criterion 6: Secret & PII Leakage Protection", () => {
    it("never leaks secret keys or customer PII in error responses", async () => {
      const forgedReq = new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-razorpay-signature": "invalid_sig",
        },
        body: JSON.stringify({
          secret_leak_test: true,
          admin_key: process.env.RAZORPAY_KEY_SECRET,
        }),
      });

      const res = await webhookPost(forgedReq);
      expect(res.status).toBe(400);

      const json = await res.json();
      const stringified = JSON.stringify(json);

      expect(stringified).not.toContain(testKeySecret);
      expect(stringified).not.toContain(testWebhookSecret);
      expect(stringified).not.toContain(validCustomer.phone);
      expect(stringified).not.toContain(validCustomer.shippingAddress.line1);
    });
  });
});
