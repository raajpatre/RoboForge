import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateCartAction } from "../cart";
import { FALLBACK_DEMO_PRODUCTS } from "@/lib/catalog";
import { resetEnvCache } from "@/lib/env";

describe("Cart Server Action & Authoritative Calculation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SELLER_TAX_MODE = "gst_registered";
    process.env.SELLER_GSTIN = "29AABCR1234F1Z5";
    resetEnvCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvCache();
  });
  it("rejects invalid cart payloads", async () => {
    const res = await validateCartAction("invalid-string");
    expect(res.isValid).toBe(false);
    expect(res.errorMessage).toBeDefined();
    expect(res.totals).toBeNull();
  });

  it("handles empty cart safely", async () => {
    const res = await validateCartAction([]);
    expect(res.isValid).toBe(true);
    expect(res.items).toHaveLength(0);
    expect(res.totals).toBeNull();
  });

  it("validates valid products and computes authoritative totals with free shipping over threshold", async () => {
    // Product 1: ForgeBot Arm (₹1,85,000 = 18500000 paise > 5000000 paise threshold)
    const p1 = FALLBACK_DEMO_PRODUCTS[0];

    const res = await validateCartAction([
      {
        productId: p1.id,
        quantity: 1,
      },
    ]);

    expect(res.isValid).toBe(true);
    expect(res.hasStockIssues).toBe(false);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].effectiveQuantity).toBe(1);

    expect(res.totals).toBeDefined();
    expect(res.totals?.subtotalPaise).toBe(18500000);
    expect(res.totals?.shippingPaise).toBe(0); // Free shipping because subtotal >= ₹50,000
    expect(res.totals?.taxPaise).toBe(3330000); // 18% of 18500000
    expect(res.totals?.totalPaise).toBe(18500000 + 3330000);
  });

  it("applies standard ₹200 shipping for orders at or below ₹500 cart value", async () => {
    // Product 7: CAN-Bus Cable (₹450 = 45000 paise <= 50000 paise threshold)
    const p7 = FALLBACK_DEMO_PRODUCTS[6];

    const res = await validateCartAction([
      {
        productId: p7.id,
        quantity: 1,
      },
    ]);

    expect(res.isValid).toBe(true);
    expect(res.totals?.subtotalPaise).toBe(45000);
    expect(res.totals?.shippingPaise).toBe(20000); // ₹200 standard shipping
    expect(res.totals?.totalPaise).toBe(
      res.totals!.subtotalPaise + res.totals!.taxPaise + 20000
    );
  });

  it("applies free shipping for orders above ₹500 cart value", async () => {
    // Product 5: TitanCore ESC (₹11,500 = 1150000 paise > 50000 paise threshold)
    const p5 = FALLBACK_DEMO_PRODUCTS[4];

    const res = await validateCartAction([
      {
        productId: p5.id,
        quantity: 1,
      },
    ]);

    expect(res.isValid).toBe(true);
    expect(res.totals?.subtotalPaise).toBe(1150000);
    expect(res.totals?.shippingPaise).toBe(0); // Free shipping
    expect(res.totals?.totalPaise).toBe(
      res.totals!.subtotalPaise + res.totals!.taxPaise
    );
  });

  it("flags stock issues if requested quantity exceeds available stock", async () => {
    const p1 = FALLBACK_DEMO_PRODUCTS[0]; // Available stock is 5

    const res = await validateCartAction([
      {
        productId: p1.id,
        quantity: 10, // Requesting 10, only 5 available
      },
    ]);

    expect(res.isValid).toBe(true);
    expect(res.hasStockIssues).toBe(true);
    expect(res.items[0].hasSufficientStock).toBe(false);
    expect(res.items[0].effectiveQuantity).toBe(5); // Capped to 5
    expect(res.totals?.subtotalPaise).toBe(p1.price_paise * 5);
  });

  it("never trusts client-supplied prices and recomputes purely from server catalog", async () => {
    const p1 = FALLBACK_DEMO_PRODUCTS[0];
    // Client tries to send a malicious or manipulated price
    const maliciousClientPayload = [
      {
        productId: p1.id,
        quantity: 1,
        pricePaise: 100, // Attempted ₹1 tampering
      },
    ];

    const res = await validateCartAction(maliciousClientPayload);
    expect(res.isValid).toBe(true);
    // Server enforces the true database price ₹1,85,000 (18500000 paise)
    expect(res.items[0].unitPricePaise).toBe(18500000);
    expect(res.totals?.subtotalPaise).toBe(18500000);
  });
});
