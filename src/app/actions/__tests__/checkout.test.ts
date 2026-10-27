import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initiateCheckoutAction } from "../checkout";
import { FALLBACK_DEMO_PRODUCTS } from "@/lib/catalog";

describe("Checkout Initiation Server Action", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PAYMENT_MODE = "test";
    process.env.RAZORPAY_KEY_ID = "rzp_test_placeholder";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    process.env.SELLER_TAX_MODE = "gst_registered";
    process.env.SELLER_GSTIN = "29AABCR1234F1Z5";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const validCustomer = {
    name: "Dr. Aditya Sen",
    email: "aditya@autonomous-labs.in",
    phone: "9876543210",
    shippingAddress: {
      line1: "Robotics Testing Lab, Hangar 3",
      city: "Bengaluru",
      state: "Karnataka",
      postal_code: "560066",
      country: "India",
    },
  };

  it("successfully initiates checkout, generates 128-bit order code, and calculates totals", async () => {
    const p1 = FALLBACK_DEMO_PRODUCTS[0]; // ₹1,85,000 = 18500000 paise

    const session = await initiateCheckoutAction({
      customer: validCustomer,
      items: [{ productId: p1.id, quantity: 1 }],
    });

    expect(session.success).toBe(true);
    expect(session.orderCode).toBeDefined();
    expect(session.orderCode).toMatch(/^RBF-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$/);
    expect(session.razorpayOrderId).toBeDefined();
    expect(session.currency).toBe("INR");
    // Free shipping threshold applies: total = 18500000 + 18% tax (3330000) = 21830000
    expect(session.amountPaise).toBe(18500000 + 3330000);
  });

  it("rejects checkout with invalid customer phone number", async () => {
    const p1 = FALLBACK_DEMO_PRODUCTS[0];

    const session = await initiateCheckoutAction({
      customer: {
        ...validCustomer,
        phone: "12345", // Invalid Indian phone number
      },
      items: [{ productId: p1.id, quantity: 1 }],
    });

    expect(session.success).toBe(false);
    expect(session.error).toMatch(/valid 10-digit Indian mobile/);
  });

  it("rejects checkout with empty items list", async () => {
    const session = await initiateCheckoutAction({
      customer: validCustomer,
      items: [],
    });

    expect(session.success).toBe(false);
    expect(session.error).toMatch(/At least one item is required/);
  });

  it("rejects checkout when requested quantity exceeds available stock", async () => {
    const p1 = FALLBACK_DEMO_PRODUCTS[0]; // Stock is 5

    const session = await initiateCheckoutAction({
      customer: validCustomer,
      items: [{ productId: p1.id, quantity: 10 }], // Requests 10
    });

    expect(session.success).toBe(false);
    expect(session.error).toMatch(/Insufficient stock/);
  });
});
