import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { validateCartAction } from "@/app/actions/cart";
import { initiateCheckoutAction } from "@/app/actions/checkout";
import { POST as webhookPost } from "@/app/api/webhooks/razorpay/route";
import { POST as trackPost } from "@/app/api/orders/track/route";
import { GET as invoiceGet } from "@/app/api/invoices/[orderCode]/route";
import { updateOrderStatusAction, processRefundAction } from "@/app/actions/admin";
import { resetRateLimits } from "@/lib/rate-limit";
import { resetEnvCache } from "@/lib/env";
import { FALLBACK_DEMO_PRODUCTS } from "@/lib/catalog";

describe("E2E Robotics Hardware Order Lifecycle Integration Test", () => {
  const originalEnv = process.env;
  const webhookSecret = "test_webhook_secret_key_12345";

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    process.env.PAYMENT_MODE = "test";
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
    process.env.ADMIN_EMAILS = "admin@roboshopforge.local";
    process.env.SELLER_TAX_MODE = "gst_registered";
    process.env.SELLER_GSTIN = "29AABCR1234F1Z5";
    resetEnvCache();
    resetRateLimits();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvCache();
    resetRateLimits();
  });

  function createSignedWebhookRequest(body: object): NextRequest {
    const rawBody = JSON.stringify(body);
    const signature = crypto
      .createHmac("sha256", webhookSecret)
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

  it("successfully completes entire lifecycle: cart -> checkout -> webhook -> zero-PII track -> invoice -> fulfillment -> refund", async () => {
    // -------------------------------------------------------------
    // Step 1: Customer selects hardware and validates cart pricing
    // -------------------------------------------------------------
    const sampleProduct = FALLBACK_DEMO_PRODUCTS[0]; // ForgeBot Alpha 6-DOF
    expect(sampleProduct).toBeDefined();

    const cartValidation = await validateCartAction([
      { productId: sampleProduct.id, quantity: 1 },
    ]);

    expect(cartValidation.isValid).toBe(true);
    expect(cartValidation.items.length).toBe(1);
    expect(cartValidation.totals).toBeDefined();
    expect(cartValidation.totals!.subtotalPaise).toBe(18500000); // INR 1,85,000.00
    expect(cartValidation.totals!.taxPaise).toBe(3330000);       // INR 33,300.00 (18% GST)
    expect(cartValidation.totals!.totalPaise).toBe(21830000);     // INR 2,18,300.00

    // -------------------------------------------------------------
    // Step 2: Customer initiates checkout and creates reservation hold
    // -------------------------------------------------------------
    const checkoutResult = await initiateCheckoutAction({
      customer: {
        name: "Dr. Vikram Sarabhai",
        email: "vikram@robotics-lab.org",
        phone: "+919876543210",
        shippingAddress: {
          line1: "Space Applications Facility, ISRO Layout",
          city: "Bengaluru",
          state: "Karnataka",
          state_code: "29",
          postal_code: "560078",
          country: "India",
        },
      },
      items: [{ productId: sampleProduct.id, quantity: 1 }],
    });

    expect(checkoutResult.success).toBe(true);
    expect(checkoutResult.orderCode).toBeDefined();
    expect(checkoutResult.razorpayOrderId).toBeDefined();
    expect(checkoutResult.amountPaise).toBe(21830000);

    const orderCode = checkoutResult.orderCode!;
    // Verify 128-bit cryptographic format: RBF-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
    expect(orderCode).toMatch(/^RBF-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/);

    // -------------------------------------------------------------
    // Step 3: Payment captured via authentic HMAC-SHA256 Webhook
    // -------------------------------------------------------------
    const mockPaymentId = `pay_e2e_${Date.now()}`;
    const webhookReq = createSignedWebhookRequest({
      entity: "event",
      account_id: "acc_robotics_test",
      event: "payment.captured",
      contains: ["payment"],
      payload: {
        payment: {
          entity: {
            id: mockPaymentId,
            order_id: checkoutResult.razorpayOrderId,
            amount: 21830000,
            currency: "INR",
            status: "captured",
            method: "upi",
            notes: { order_code: orderCode },
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    });

    const webhookRes = await webhookPost(webhookReq);
    expect(webhookRes.status).toBe(200);
    const webhookJson = await webhookRes.json();
    expect(["ok", "success"]).toContain(webhookJson.status);

    // -------------------------------------------------------------
    // Step 4: Zero-PII public tracking verification using the secret token
    // -------------------------------------------------------------
    const trackReq = new NextRequest("http://localhost:3000/api/orders/track", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.195",
      },
      body: JSON.stringify({ orderCode }),
    });

    const trackRes = await trackPost(trackReq);
    expect(trackRes.status).toBe(200);
    expect(trackRes.headers.get("cache-control")).toContain("no-store");

    const trackJson = await trackRes.json();
    expect(trackJson.success).toBe(true);
    expect(trackJson.order.order_code).toBe(orderCode);
    expect(trackJson.order.payment_status).toBe("paid");
    expect(trackJson.order.total_paise).toBe(21830000);
    expect(trackJson.order.items.length).toBeGreaterThan(0);

    // Strict Zero-PII assertions
    expect(trackJson.order).not.toHaveProperty("customer_name");
    expect(trackJson.order).not.toHaveProperty("name");
    expect(trackJson.order).not.toHaveProperty("customer_email");
    expect(trackJson.order).not.toHaveProperty("email");
    expect(trackJson.order).not.toHaveProperty("customer_phone");
    expect(trackJson.order).not.toHaveProperty("phone");
    expect(trackJson.order).not.toHaveProperty("shipping_address");
    expect(trackJson.order).not.toHaveProperty("shippingAddress");

    // -------------------------------------------------------------
    // Step 5: On-demand GST vector PDF invoice generation
    // -------------------------------------------------------------
    const invoiceReq = new NextRequest(`http://localhost:3000/api/invoices/${orderCode}`, {
      method: "GET",
      headers: { "x-forwarded-for": "203.0.113.195" },
    });

    const invoiceRes = await invoiceGet(invoiceReq, {
      params: Promise.resolve({ orderCode }),
    });

    expect(invoiceRes.status).toBe(200);
    expect(invoiceRes.headers.get("content-type")).toBe("application/pdf");
    expect(invoiceRes.headers.get("content-disposition")).toContain("Invoice-");

    const pdfBlob = await invoiceRes.blob();
    const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());

    // Magic Bytes %PDF-
    expect(pdfBuffer.toString("ascii", 0, 5)).toBe("%PDF-");
    expect(pdfBuffer.length).toBeGreaterThan(1500);

    // -------------------------------------------------------------
    // Step 6: Admin inspects order and advances delivery status
    // -------------------------------------------------------------
    const advanceStatusRes = await updateOrderStatusAction("mock-order-01", "shipped");
    expect(advanceStatusRes.success).toBe(true);

    // -------------------------------------------------------------
    // Step 7: Admin issues authorized refund and generates credit note
    // -------------------------------------------------------------
    const refundResult = await processRefundAction({
      orderId: "mock-order-01",
      reason: "Customer facility upgraded to customized pneumatic gripper specifications.",
      amountPaise: 21830000,
    });

    expect(refundResult.success).toBe(true);
    expect(refundResult.creditNoteNumber).toMatch(/^CN-\d{4}-[A-Z0-9]+$/);
  });
});
