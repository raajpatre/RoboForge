import { describe, it, expect } from "vitest";
import {
  customerDetailsSchema,
  shippingAddressSchema,
  checkoutCartItemSchema,
  checkoutRequestSchema,
  orderTrackingRequestSchema,
  adminProductSchema,
} from "../validation";

describe("Domain Validation Schemas", () => {
  describe("Shipping Address Validation", () => {
    it("accepts a valid Indian shipping address", () => {
      const validAddress = {
        line1: "Plot 42, Electronics City Phase 1",
        line2: "Near Metro Pillar 200",
        city: "Bengaluru",
        state: "Karnataka",
        postal_code: "560100",
        country: "India",
      };

      const parsed = shippingAddressSchema.parse(validAddress);
      expect(parsed.postal_code).toBe("560100");
      expect(parsed.country).toBe("India");
    });

    it("rejects invalid PIN codes (5 digits, starting with 0, or letters)", () => {
      const base = {
        line1: "Sample Street",
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
      };

      expect(() => shippingAddressSchema.parse({ ...base, postal_code: "12345" })).toThrow(/valid 6-digit Indian PIN/);
      expect(() => shippingAddressSchema.parse({ ...base, postal_code: "012345" })).toThrow(/valid 6-digit Indian PIN/);
      expect(() => shippingAddressSchema.parse({ ...base, postal_code: "56005A" })).toThrow(/valid 6-digit Indian PIN/);
    });
  });

  describe("Customer Details Validation & Sanitization", () => {
    it("normalizes and sanitizes email and phone number", () => {
      const input = {
        name: "  Dr. Rajesh Kumar  ",
        email: "  RAJESH.KUMAR@RoboLab.ac.in  ",
        phone: "+91 98765 43210",
        shippingAddress: {
          line1: "IISc Robotics Department",
          city: "Bengaluru",
          state: "Karnataka",
          postal_code: "560012",
        },
      };

      const parsed = customerDetailsSchema.parse(input);
      expect(parsed.name).toBe("Dr. Rajesh Kumar");
      expect(parsed.email).toBe("rajesh.kumar@robolab.ac.in");
      expect(parsed.phone).toBe("+919876543210");
    });

    it("rejects invalid Indian mobile numbers", () => {
      const base = {
        name: "John Doe",
        email: "john@example.com",
        shippingAddress: {
          line1: "123 Street",
          city: "Delhi",
          state: "Delhi",
          postal_code: "110001",
        },
      };

      // Starts with 5 (invalid in India)
      expect(() => customerDetailsSchema.parse({ ...base, phone: "5555555555" })).toThrow(/valid 10-digit Indian mobile/);
      // Only 9 digits
      expect(() => customerDetailsSchema.parse({ ...base, phone: "987654321" })).toThrow(/valid 10-digit Indian mobile/);
      // Letters
      expect(() => customerDetailsSchema.parse({ ...base, phone: "98765ABCDE" })).toThrow(/valid 10-digit Indian mobile/);
    });
  });

  describe("Cart Item & Checkout Request Validation", () => {
    it("validates valid cart items and enforces quantity bounds (1 to 10)", () => {
      const validItem = {
        productId: "a1111111-1111-4111-8111-111111111111",
        quantity: 2,
      };
      expect(checkoutCartItemSchema.parse(validItem).quantity).toBe(2);

      // Quantity zero
      expect(() => checkoutCartItemSchema.parse({ ...validItem, quantity: 0 })).toThrow();
      // Quantity negative
      expect(() => checkoutCartItemSchema.parse({ ...validItem, quantity: -1 })).toThrow();
      // Floating quantity
      expect(() => checkoutCartItemSchema.parse({ ...validItem, quantity: 1.5 })).toThrow();
      // Excessive quantity
      expect(() => checkoutCartItemSchema.parse({ ...validItem, quantity: 11 })).toThrow(/Maximum 10 units/);
      // Non-UUID productId
      expect(() => checkoutCartItemSchema.parse({ productId: "not-a-uuid", quantity: 1 })).toThrow(/Invalid product ID format/);
    });

    it("rejects checkout requests with empty item lists", () => {
      const req = {
        customer: {
          name: "Test User",
          email: "user@example.com",
          phone: "9876543210",
          shippingAddress: {
            line1: "Line 1",
            city: "City",
            state: "State",
            postal_code: "560001",
          },
        },
        items: [],
      };
      expect(() => checkoutRequestSchema.parse(req)).toThrow(/At least one item is required/);
    });
  });

  describe("Order Tracking Input Validation", () => {
    it("accepts valid order codes and normalizes them", () => {
      const input = { orderCode: "  rbf-a1b2c3d4-e5f60718-9a0b1c2d-3e4f5a6b  " };
      const parsed = orderTrackingRequestSchema.parse(input);
      expect(parsed.orderCode).toBe("RBF-A1B2C3D4-E5F60718-9A0B1C2D-3E4F5A6B");
    });

    it("rejects malformed or sequential order codes", () => {
      expect(() => orderTrackingRequestSchema.parse({ orderCode: "ORD-0001" })).toThrow(/Invalid order code format/);
      expect(() => orderTrackingRequestSchema.parse({ orderCode: "12345" })).toThrow(/Invalid order code format/);
    });
  });

  describe("Admin Product Schema Validation", () => {
    it("validates product inputs and enforces slug format and non-negative paise", () => {
      const valid = {
        name: "Lidar Scanner 360",
        slug: "lidar-scanner-360",
        description: "High precision scanner",
        price_paise: 2499900,
        image_url: "https://example.com/scanner.jpg",
        stock_on_hand: 10,
        tax_rate_bps: 1800,
      };
      expect(adminProductSchema.parse(valid).slug).toBe("lidar-scanner-360");

      // Invalid uppercase slug
      expect(() => adminProductSchema.parse({ ...valid, slug: "Lidar_Scanner_360" })).toThrow(/lowercase letters, numbers, and single hyphens/);
      // Negative price
      expect(() => adminProductSchema.parse({ ...valid, price_paise: -100 })).toThrow(/Price cannot be negative/);
      // Negative stock
      expect(() => adminProductSchema.parse({ ...valid, stock_on_hand: -5 })).toThrow(/Stock cannot be negative/);
    });
  });
});
