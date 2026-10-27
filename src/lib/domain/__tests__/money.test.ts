import { describe, it, expect } from "vitest";
import {
  assertValidPaise,
  paiseToRupees,
  rupeesToPaise,
  calculateItemTax,
  calculateItemTotals,
  calculateOrderTotals,
  formatINR,
} from "../money";

describe("Money & Tax Calculation Domain Service", () => {
  describe("assertValidPaise & conversions", () => {
    it("validates positive integers and zero as valid paise", () => {
      expect(() => assertValidPaise(0)).not.toThrow();
      expect(() => assertValidPaise(100)).not.toThrow();
      expect(() => assertValidPaise(18500000)).not.toThrow();
    });

    it("rejects negative amounts, floats, and non-integers", () => {
      expect(() => assertValidPaise(-1)).toThrow(/must be a non-negative integer/);
      expect(() => assertValidPaise(10.5)).toThrow(/must be a non-negative integer/);
      expect(() => assertValidPaise(NaN)).toThrow(/must be a non-negative integer/);
      expect(() => assertValidPaise("100")).toThrow(/must be a non-negative integer/);
    });

    it("converts between rupees and integer paise correctly without precision drift", () => {
      expect(paiseToRupees(18500000)).toBe(185000);
      expect(paiseToRupees(24999)).toBe(249.99);

      expect(rupeesToPaise(185000)).toBe(18500000);
      expect(rupeesToPaise(249.99)).toBe(24999);
      expect(rupeesToPaise(19.99)).toBe(1999);
    });
  });

  describe("Tax calculations (calculateItemTax)", () => {
    it("calculates standard 18% GST (1800 bps) accurately", () => {
      // 100,000 paise (₹1,000) * 18% = 18,000 paise (₹180)
      expect(calculateItemTax(100000, 1800)).toBe(18000);

      // Zero tax rate
      expect(calculateItemTax(100000, 0)).toBe(0);

      // Zero amount
      expect(calculateItemTax(0, 1800)).toBe(0);
    });

    it("applies half-up rounding for fractional paise", () => {
      // 55 paise * 18% = 9.9 paise -> rounds to 10 paise
      expect(calculateItemTax(55, 1800)).toBe(10);

      // 52 paise * 18% = 9.36 paise -> rounds to 9 paise
      expect(calculateItemTax(52, 1800)).toBe(9);
    });

    it("rejects invalid tax rates", () => {
      expect(() => calculateItemTax(1000, -100)).toThrow(/Invalid taxRateBps/);
      expect(() => calculateItemTax(1000, 15000)).toThrow(/Invalid taxRateBps/);
    });

    it("calculates single item totals correctly", () => {
      const item = calculateItemTotals({
        unitPricePaise: 2499900,
        quantity: 2,
        taxRateBps: 1800,
      });
      expect(item.subtotalPaise).toBe(4999800);
      expect(item.taxPaise).toBe(899964);
      expect(item.totalPaise).toBe(4999800 + 899964);
    });
  });

  describe("Order totals calculation (calculateOrderTotals)", () => {
    it("calculates comprehensive order totals with GST and shipping", () => {
      const items = [
        {
          unitPricePaise: 18500000, // ₹1,85,000.00
          quantity: 1,
          taxRateBps: 1800,         // 18% = 33,300.00
        },
        {
          unitPricePaise: 2499900,  // ₹24,999.00
          quantity: 2,              // Subtotal: ₹49,998.00
          taxRateBps: 1800,         // 18% = 8,999.64 -> 9,000.00
        },
      ];
      const shippingPaise = 150000; // ₹1,500.00

      const result = calculateOrderTotals(items, shippingPaise);

      expect(result.subtotalPaise).toBe(18500000 + 4999800);
      expect(result.subtotalPaise).toBe(23499800);
      expect(result.shippingPaise).toBe(150000);
      expect(result.taxPaise).toBe(3330000 + 899964);
      expect(result.totalPaise).toBe(result.subtotalPaise + result.taxPaise + result.shippingPaise);
      expect(result.currency).toBe("INR");
    });

    it("throws when calculating totals for empty cart", () => {
      expect(() => calculateOrderTotals([])).toThrow(/empty item list/);
    });
  });

  describe("Currency Formatting (formatINR)", () => {
    it("formats Indian Rupee amounts with standard lakhs/crores grouping", () => {
      const formatted = formatINR(18500000); // ₹1,85,000.00
      // Check for presence of INR symbol or Rs and correct grouping
      expect(formatted).toMatch(/1,85,000\.00/);

      const small = formatINR(49900); // ₹499.00
      expect(small).toMatch(/499\.00/);

      const noPaise = formatINR(18500000, { showPaise: false });
      expect(noPaise).toMatch(/1,85,000$/);
    });
  });
});
