import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import { verifyPaymentAction } from "../payment";

describe("Payment Verification Server Action", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PAYMENT_MODE = "test";
    process.env.RAZORPAY_KEY_ID = "rzp_test_sample123";
    process.env.RAZORPAY_KEY_SECRET = "test_key_secret_12345";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("verifies genuine payment with valid HMAC signature", async () => {
    const orderId = "order_sample_001";
    const paymentId = "pay_sample_001";
    const secret = "test_key_secret_12345";

    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    const result = await verifyPaymentAction({
      orderCode: "RBF-11111111-22222222-33333333-44444444",
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });

    expect(result.success).toBe(true);
    expect(result.orderCode).toBe("RBF-11111111-22222222-33333333-44444444");
  });

  it("rejects forged or tampered payment signatures", async () => {
    const result = await verifyPaymentAction({
      orderCode: "RBF-11111111-22222222-33333333-44444444",
      razorpayOrderId: "order_sample_001",
      razorpayPaymentId: "pay_sample_001",
      razorpaySignature: "forged_signature_hex_value_0123456789abcdef",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Cryptographic signature verification failed/);
  });

  it("rejects invalid input structures", async () => {
    const result = await verifyPaymentAction({
      orderCode: "",
      razorpayOrderId: "order_123",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid payment verification arguments/);
  });
});
