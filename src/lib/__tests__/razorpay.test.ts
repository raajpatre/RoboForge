import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import {
  verifyPaymentSignature,
  verifyWebhookSignature,
  createRazorpayOrder,
} from "../razorpay";

describe("Razorpay Cryptographic Signatures & Order Management", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.RAZORPAY_KEY_ID = "rzp_test_sample123";
    process.env.RAZORPAY_KEY_SECRET = "sample_key_secret_for_tests";
    process.env.RAZORPAY_WEBHOOK_SECRET = "sample_webhook_secret_for_tests";
    process.env.PAYMENT_MODE = "test";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("verifies genuine HMAC-SHA256 payment signatures correctly", () => {
    const orderId = "order_EKwxwAgItmmMnv";
    const paymentId = "pay_29QQoUBi66xm2f";
    const secret = "sample_key_secret_for_tests";

    const text = `${orderId}|${paymentId}`;
    const signature = crypto
      .createHmac("sha256", secret)
      .update(text)
      .digest("hex");

    const isValid = verifyPaymentSignature({
      orderId,
      paymentId,
      signature,
    });

    expect(isValid).toBe(true);
  });

  it("strictly rejects tampered or fraudulent payment signatures", () => {
    const orderId = "order_EKwxwAgItmmMnv";
    const paymentId = "pay_29QQoUBi66xm2f";
    const forgedSignature = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const isValid = verifyPaymentSignature({
      orderId,
      paymentId,
      signature: forgedSignature,
    });

    expect(isValid).toBe(false);
  });

  it("rejects signatures when payment ID or order ID is altered", () => {
    const orderId = "order_EKwxwAgItmmMnv";
    const paymentId = "pay_29QQoUBi66xm2f";
    const secret = "sample_key_secret_for_tests";

    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    // Altered payment ID
    const isValid = verifyPaymentSignature({
      orderId,
      paymentId: "pay_tampered_id",
      signature,
    });

    expect(isValid).toBe(false);
  });

  it("verifies genuine webhook signatures accurately", () => {
    const payload = JSON.stringify({
      event: "payment.captured",
      created_at: 1700000000,
    });
    const webhookSecret = "sample_webhook_secret_for_tests";

    const signature = crypto
      .createHmac("sha256", webhookSecret)
      .update(payload)
      .digest("hex");

    const isValid = verifyWebhookSignature(payload, signature);
    expect(isValid).toBe(true);
  });

  it("rejects tampered webhook payloads", () => {
    const originalPayload = JSON.stringify({ event: "payment.captured", amount: 1000 });
    const tamperedPayload = JSON.stringify({ event: "payment.captured", amount: 5000 });
    const webhookSecret = "sample_webhook_secret_for_tests";

    const signature = crypto
      .createHmac("sha256", webhookSecret)
      .update(originalPayload)
      .digest("hex");

    const isValid = verifyWebhookSignature(tamperedPayload, signature);
    expect(isValid).toBe(false);
  });

  it("creates mock orders in test mode when key is placeholder", async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_placeholder";

    const order = await createRazorpayOrder({
      amountPaise: 18500000,
      currency: "INR",
      receipt: "RBF-123",
    });

    expect(order.id).toMatch(/^order_mock_/);
    expect(order.amount).toBe(18500000);
    expect(order.status).toBe("created");
  });

  it("rejects non-positive or non-integer order amounts", async () => {
    await expect(
      createRazorpayOrder({
        amountPaise: -100,
        receipt: "RBF-123",
      })
    ).rejects.toThrow(/Invalid order amount in paise/);

    await expect(
      createRazorpayOrder({
        amountPaise: 100.5,
        receipt: "RBF-123",
      })
    ).rejects.toThrow(/Invalid order amount in paise/);
  });
});
