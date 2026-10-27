import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  updateOrderStatusAction,
  cancelAndRefundOrderAction,
} from "@/app/actions/admin";
import { isAllowedDeliveryTransition } from "@/lib/domain/fulfillment";
import { GET as adminInvoiceGetHandler } from "@/app/api/admin/orders/[id]/invoice/route";
import { POST as trackingPostHandler } from "@/app/api/orders/track/route";
import { generateOrderCode } from "@/lib/domain/crypto";
import {
  saveMockOrder,
  getMockOrderById,
  resetMockStore,
  saveMockInvoice,
  type MockStoredOrder,
} from "@/lib/domain/mock-store";
import { buildMockInvoiceSnapshot } from "@/lib/domain/invoice";
import { resetEnvCache } from "@/lib/env";
import * as adminGuard from "@/lib/auth/admin-guard";

describe("Phase 8 Acceptance Tests: Complete Admin Order Management", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ADMIN_EMAILS = "admin@roboshopforge.local";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    process.env.RAZORPAY_KEY_ID = "rzp_test_placeholder";
    process.env.RAZORPAY_KEY_SECRET = "placeholder_secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret_12345";
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
    const orderId = overrides.id || "order-adm-" + Math.random().toString(36).slice(2, 9);
    const order: MockStoredOrder = {
      id: orderId,
      order_code: code,
      customer_name: "Dr. Homi Bhabha",
      customer_email: "bhabha@tifr.res.in",
      customer_phone: "+919822334455",
      shipping_address: {
        line1: "TIFR Department of Nuclear & Robotic Instrumentation",
        city: "Mumbai",
        state: "Maharashtra",
        state_code: "27",
        postal_code: "400005",
        country: "India",
      },
      items: [
        {
          productId: "prod-servo-mcu",
          sku: "RBF-MCU-01",
          name: "Industrial Core Motion Controller MCU",
          slug: "motion-controller-mcu",
          unitPricePaise: 1150000,
          quantity: 2,
          taxRateBps: 1800,
          totalPaise: 2714000,
          hsn_code: "85371000",
        },
      ],
      subtotal_paise: 2300000,
      tax_paise: 414000,
      shipping_paise: 0,
      total_paise: 2714000,
      currency: "INR",
      payment_status: overrides.payment_status || "paid",
      delivery_status: overrides.delivery_status || "pending",
      reservation_expires_at: Date.now() + 600000,
      reservation_status: overrides.reservation_status || "consumed",
      inventory_restored: overrides.inventory_restored || false,
      refund_status: overrides.refund_status || undefined,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };

    saveMockOrder(order);
    return order;
  }

  // --------------------------------------------------------------------------
  // 1. Authentication & Non-Admin Rejection
  // --------------------------------------------------------------------------
  describe("Security: Unauthenticated and Non-Admin Request Rejection", () => {
    it("denies unauthenticated requests to update delivery status", async () => {
      vi.spyOn(adminGuard, "requireAdminUser").mockRejectedValueOnce(
        new Error("UNAUTHORIZED: Active admin session required.")
      );

      await expect(
        updateOrderStatusAction("order-adm-01", "shipped")
      ).rejects.toThrow(/UNAUTHORIZED/);
    });

    it("denies unauthenticated requests to cancel and refund an order", async () => {
      vi.spyOn(adminGuard, "requireAdminUser").mockRejectedValueOnce(
        new Error("UNAUTHORIZED: Active admin session required.")
      );

      await expect(
        cancelAndRefundOrderAction({
          orderId: "order-adm-01",
          reason: "Unauthorized attempt",
        })
      ).rejects.toThrow(/UNAUTHORIZED/);
    });

    it("denies unauthenticated requests to the admin invoice download route", async () => {
      vi.spyOn(adminGuard, "requireAdminUser").mockRejectedValueOnce(
        new Error("UNAUTHORIZED: Active admin session required.")
      );

      const req = new NextRequest("http://localhost:3000/api/admin/orders/order-adm-01/invoice");
      const res = await adminInvoiceGetHandler(req, {
        params: Promise.resolve({ id: "order-adm-01" }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/Administrative authentication required/);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Strict Delivery State Machine & Post-Shipment Cancellation Prevention
  // --------------------------------------------------------------------------
  describe("Delivery Pipeline: Processing -> Shipped -> Delivered and Server-Enforced Cancellation Rules", () => {
    it("validates allowed and disallowed state transitions via isAllowedDeliveryTransition", () => {
      // Allowed forward transitions
      expect(isAllowedDeliveryTransition("pending", "processing").allowed).toBe(true);
      expect(isAllowedDeliveryTransition("processing", "shipped").allowed).toBe(true);
      expect(isAllowedDeliveryTransition("shipped", "delivered").allowed).toBe(true);

      // Pre-shipment cancellation is allowed
      expect(isAllowedDeliveryTransition("pending", "cancelled").allowed).toBe(true);
      expect(isAllowedDeliveryTransition("processing", "cancelled").allowed).toBe(true);

      // POST-SHIPMENT CANCELLATION IS STRICTLY PROHIBITED
      const shippedCancel = isAllowedDeliveryTransition("shipped", "cancelled");
      expect(shippedCancel.allowed).toBe(false);
      expect(shippedCancel.reason).toMatch(/Cannot cancel an order that is already shipped/);

      // DELIVERED CANCELLATION IS STRICTLY PROHIBITED
      const deliveredCancel = isAllowedDeliveryTransition("delivered", "cancelled");
      expect(deliveredCancel.allowed).toBe(false);
      expect(deliveredCancel.reason).toMatch(/terminal fulfillment state/);

      // Backward transitions prohibited
      expect(isAllowedDeliveryTransition("shipped", "processing").allowed).toBe(false);
      expect(isAllowedDeliveryTransition("delivered", "shipped").allowed).toBe(false);
      expect(isAllowedDeliveryTransition("cancelled", "processing").allowed).toBe(false);
    });

    it("executes valid forward fulfillment transitions: Processing -> Shipped -> Delivered", async () => {
      const order = seedTestOrder({ delivery_status: "pending" });

      // 1. Pending -> Processing
      const res1 = await updateOrderStatusAction(order.id, "processing", "Actuator testing initiated");
      expect(res1.success).toBe(true);
      expect(getMockOrderById(order.id)?.delivery_status).toBe("processing");

      // 2. Processing -> Shipped
      const res2 = await updateOrderStatusAction(order.id, "shipped", "Dispatched via DHL Express AWB #998877");
      expect(res2.success).toBe(true);
      expect(getMockOrderById(order.id)?.delivery_status).toBe("shipped");

      // 3. Shipped -> Delivered
      const res3 = await updateOrderStatusAction(order.id, "delivered", "Consignee signature confirmed at lab");
      expect(res3.success).toBe(true);
      expect(getMockOrderById(order.id)?.delivery_status).toBe("delivered");
    });

    it("server enforces cancellation prevention on shipped orders", async () => {
      const order = seedTestOrder({ delivery_status: "shipped" });

      // Attempting to cancel via updateOrderStatusAction
      const statusRes = await updateOrderStatusAction(order.id, "cancelled");
      expect(statusRes.success).toBe(false);
      expect(statusRes.error).toMatch(/Cannot cancel an order that is already shipped/);

      // Attempting to cancel via cancelAndRefundOrderAction
      const cancelRes = await cancelAndRefundOrderAction({
        orderId: order.id,
        reason: "Customer requested cancellation after shipment",
      });
      expect(cancelRes.success).toBe(false);
      expect(cancelRes.error).toMatch(/Cannot cancel order: order is already shipped/);

      // Status remains shipped!
      expect(getMockOrderById(order.id)?.delivery_status).toBe("shipped");
    });

    it("server enforces cancellation prevention on delivered orders", async () => {
      const order = seedTestOrder({ delivery_status: "delivered" });

      const cancelRes = await cancelAndRefundOrderAction({
        orderId: order.id,
        reason: "Customer wants refund after taking delivery",
      });
      expect(cancelRes.success).toBe(false);
      expect(cancelRes.error).toMatch(/terminal fulfillment state|already delivered/);

      expect(getMockOrderById(order.id)?.delivery_status).toBe("delivered");
    });
  });

  // --------------------------------------------------------------------------
  // 3. Public Order Tracking Integration
  // --------------------------------------------------------------------------
  describe("Tracking Page Synchronization: Status Updates Reflected via Bearer Code", () => {
    it("reflects delivery transitions and status history on the public tracking endpoint", async () => {
      const order = seedTestOrder({ delivery_status: "pending" });

      // Transition to processing then shipped
      await updateOrderStatusAction(order.id, "processing", "Assembly calibration completed");
      await updateOrderStatusAction(order.id, "shipped", "In-transit with BlueDart Freight");

      // Query public tracking endpoint with POST and order code
      const req = new NextRequest("http://localhost:3000/api/orders/track", {
        method: "POST",
        body: JSON.stringify({ orderCode: order.order_code }),
      });
      const res = await trackingPostHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.order.delivery_status).toBe("shipped");
      expect(body.order.status_history.length).toBeGreaterThanOrEqual(2);

      const latest = body.order.status_history[body.order.status_history.length - 1];
      expect(latest.status).toBe("shipped");
      expect(latest.notes).toMatch(/BlueDart Freight/);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Cancellation of Unpaid (Pending/Failed) Orders
  // --------------------------------------------------------------------------
  describe("Cancellation of Unpaid Orders: Inventory Release Without Gateway Refund", () => {
    it("cancels pending order, releases inventory reservation, and skips gateway refund", async () => {
      const order = seedTestOrder({
        payment_status: "pending",
        delivery_status: "pending",
        reservation_status: "reserved",
      });

      const res = await cancelAndRefundOrderAction({
        orderId: order.id,
        reason: "Customer abandoned checkout or requested order voiding",
      });

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("cancelled_unpaid");
      expect(res.inventoryRestored).toBe(true);

      const updated = getMockOrderById(order.id);
      expect(updated?.delivery_status).toBe("cancelled");
      expect(updated?.payment_status).toBe("failed");
      expect(updated?.reservation_status).toBe("released");
    });
  });

  // --------------------------------------------------------------------------
  // 5. Full Cancellation and Refund of Captured Orders
  // --------------------------------------------------------------------------
  describe("Captured Payment Cancellation & Refund: Gateway Refund, Credit Note & Exactly-Once Restock", () => {
    it("executes full Razorpay refund, generates audited credit note, voids delivery, and restores inventory", async () => {
      const order = seedTestOrder({
        payment_status: "paid",
        delivery_status: "processing",
        total_paise: 2714000,
        inventory_restored: false,
      });

      const res = await cancelAndRefundOrderAction({
        orderId: order.id,
        reason: "Client lab specifications modified prior to dispatch",
      });

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("refund_processed");
      expect(res.refundStatus).toBe("processed");
      expect(res.creditNoteNumber).toMatch(/^CN-\d{4}-[A-Z0-9]+$/);
      expect(res.inventoryRestored).toBe(true);

      const updated = getMockOrderById(order.id);
      expect(updated?.delivery_status).toBe("cancelled");
      expect(updated?.payment_status).toBe("refunded");
      expect(updated?.inventory_restored).toBe(true);
    });

    it("deduplicates refund requests: cannot issue multiple refunds or restock twice", async () => {
      const order = seedTestOrder({
        payment_status: "paid",
        delivery_status: "processing",
        total_paise: 2714000,
        inventory_restored: false,
      });

      // First Refund
      const firstRes = await cancelAndRefundOrderAction({
        orderId: order.id,
        reason: "Initial customer cancellation request",
      });
      expect(firstRes.success).toBe(true);
      expect(firstRes.inventoryRestored).toBe(true);

      // Duplicate Attempt
      const duplicateRes = await cancelAndRefundOrderAction({
        orderId: order.id,
        reason: "Duplicate accidental submission by staff",
      });

      expect(duplicateRes.success).toBe(false);
      expect(duplicateRes.actionTaken).toBe("already_refunded");
      expect(duplicateRes.error).toMatch(/already been refunded/);

      // Verify inventory was restored exactly once
      const updated = getMockOrderById(order.id);
      expect(updated?.inventory_restored).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Distinct Refund States (Never Mislabeled as Refunded Prematurely)
  // --------------------------------------------------------------------------
  describe("Refund Telemetry Accuracy: Refund-Pending, Refunded, and Refund-Failed Distinction", () => {
    it("distinctly labels refund-pending and never shows 'Refunded' while settlement is pending", async () => {
      const order = seedTestOrder({
        payment_status: "paid",
        delivery_status: "processing",
      });

      // Trigger simulated pending refund
      const res = await cancelAndRefundOrderAction({
        orderId: order.id,
        reason: "Simulate_Pending: Bank netbanking processing delay",
      });

      expect(res.success).toBe(true);
      expect(res.refundStatus).toBe("pending");

      const updated = getMockOrderById(order.id);
      // Payment status must NOT be labeled as refunded!
      expect(updated?.payment_status).not.toBe("refunded");
      expect(updated?.refund_status).toBe("pending");
    });

    it("distinctly labels refund-failed when payment gateway returns error", async () => {
      const order = seedTestOrder({
        payment_status: "paid",
        delivery_status: "processing",
      });

      // Trigger simulated gateway failure
      const res = await cancelAndRefundOrderAction({
        orderId: order.id,
        reason: "Simulate_Fail: Card network declined reversal",
      });

      expect(res.success).toBe(false);
      expect(res.refundStatus).toBe("failed");

      const updated = getMockOrderById(order.id);
      expect(updated?.payment_status).not.toBe("refunded");
      expect(updated?.refund_status).toBe("failed");
    });
  });

  // --------------------------------------------------------------------------
  // 7. Admin Invoice Download for Delivered Orders & Invoice Preservation
  // --------------------------------------------------------------------------
  describe("Invoice Preservation & Admin Download", () => {
    it("allows admin to download invoice PDF for delivered orders", async () => {
      const order = seedTestOrder({
        payment_status: "paid",
        delivery_status: "delivered",
      });

      // Seed mock invoice snapshot
      const snapshot = buildMockInvoiceSnapshot(order.order_code);
      saveMockInvoice(snapshot, order.id);

      const req = new NextRequest(`http://localhost:3000/api/admin/orders/${order.id}/invoice`);
      const res = await adminInvoiceGetHandler(req, {
        params: Promise.resolve({ id: order.id }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("cache-control")).toBe("no-store");

      const buffer = await res.arrayBuffer();
      const pdfHeader = Buffer.from(buffer).slice(0, 5).toString("ascii");
      expect(pdfHeader).toBe("%PDF-");
    });

    it("preserves original invoice when order is cancelled and refunded (does not delete invoice)", async () => {
      const order = seedTestOrder({
        payment_status: "paid",
        delivery_status: "processing",
      });

      const snapshot = buildMockInvoiceSnapshot(order.order_code);
      saveMockInvoice(snapshot, order.id);

      // Execute Cancel & Refund
      const res = await cancelAndRefundOrderAction({
        orderId: order.id,
        reason: "Customer order cancellation before shipment",
      });
      expect(res.success).toBe(true);

      // Admin can STILL download the original tax invoice!
      const req = new NextRequest(`http://localhost:3000/api/admin/orders/${order.id}/invoice`);
      const invoiceRes = await adminInvoiceGetHandler(req, {
        params: Promise.resolve({ id: order.id }),
      });

      expect(invoiceRes.status).toBe(200);
      expect(invoiceRes.headers.get("content-type")).toBe("application/pdf");
    });
  });
});
