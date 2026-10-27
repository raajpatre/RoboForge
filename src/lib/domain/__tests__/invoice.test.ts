import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateInvoiceNumber,
  buildSellerSnapshot,
  isSellerGstRegistered,
  getOrCreateInvoiceSnapshot,
} from "../invoice";
import { formatINRAscii, amountToWordsINR } from "../money";
import { resetEnvCache } from "@/lib/env";
import {
  saveMockOrder,
  getMockInvoiceByOrderCode,
  type MockStoredOrder,
} from "../mock-store";
import type { SellerSnapshot } from "@/types/domain";

describe("Invoice Domain Service & Financial Utilities", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    process.env.SELLER_LEGAL_NAME = "RoboShop Forge Technologies Pvt Ltd";
    process.env.SELLER_EMAIL = "billing@roboshop-forge.example.com";
    process.env.SELLER_CITY = "Bengaluru";
    process.env.SELLER_STATE = "Karnataka";
    process.env.SELLER_STATE_CODE = "29";
    process.env.SELLER_POSTAL_CODE = "560001";
    process.env.SELLER_GSTIN = "29AABCR1234F1Z5";
    resetEnvCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvCache();
  });

  function createTestMockOrder(overrides: Partial<MockStoredOrder> = {}): MockStoredOrder {
    const code = overrides.order_code || "RBF-11112222-33334444-55556666-77778888";
    const order: MockStoredOrder = {
      id: overrides.id || "order-mock-" + Math.random().toString(36).slice(2, 9),
      order_code: code,
      customer_name: "Ananya Rao",
      customer_email: "ananya@example.com",
      customer_phone: "+919876543210",
      shipping_address: {
        line1: "42 Indiranagar 100ft Rd",
        city: "Bengaluru",
        state: "Karnataka",
        state_code: "29",
        postal_code: "560038",
        country: "India",
      },
      items: [
        {
          productId: "prod-mock-arm-001",
          sku: "RBF-ARM-ALPHA",
          name: "ForgeBot Alpha 6-DOF Robotic Arm",
          slug: "forgebot-alpha-6dof",
          unitPricePaise: 18500000,
          quantity: 1,
          taxRateBps: 1800,
          totalPaise: 21830000,
          hsn_code: "84795000",
        },
      ],
      subtotal_paise: 18500000,
      tax_paise: 3330000,
      shipping_paise: 0,
      total_paise: 21830000,
      currency: "INR",
      payment_status: "paid",
      delivery_status: "pending",
      reservation_expires_at: Date.now() + 600000,
      reservation_status: "consumed",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
    saveMockOrder(order);
    return order;
  }

  describe("Invoice Number Sequencing", () => {
    it("generates structured, non-sequential invoice numbers formatted as INV-YYYY-XXXXXX", () => {
      const inv1 = generateInvoiceNumber();
      const inv2 = generateInvoiceNumber();

      expect(inv1).toMatch(/^INV-\d{4}-[A-Z0-9]{6}$/);
      expect(inv2).toMatch(/^INV-\d{4}-[A-Z0-9]{6}$/);
      expect(inv1).not.toBe(inv2);
    });
  });

  describe("Tax Configuration & GST Verification", () => {
    it("validates authentic Indian GSTIN formats", () => {
      const validSeller: SellerSnapshot = {
        legal_name: "RoboShop Forge",
        trade_name: "RoboShop Forge",
        gstin: "29AABCR1234F1Z5",
        pan: "AABCR1234F",
        email: "test@example.com",
        phone: "+919876543210",
        address_line1: "Peenya Industrial Area",
        city: "Bengaluru",
        state: "Karnataka",
        state_code: "29",
        postal_code: "560001",
        country: "India",
      };
      expect(isSellerGstRegistered(validSeller)).toBe(true);
    });

    it("identifies unregistered seller or absent GSTIN configuration", () => {
      const unregisteredSeller: SellerSnapshot = {
        legal_name: "RoboShop Forge",
        trade_name: "RoboShop Forge",
        gstin: "UNREGISTERED / NOT APPLICABLE",
        pan: "NOT SPECIFIED",
        email: "test@example.com",
        phone: "+919876543210",
        address_line1: "Peenya Industrial Area",
        city: "Bengaluru",
        state: "Karnataka",
        state_code: "29",
        postal_code: "560001",
        country: "India",
      };
      expect(isSellerGstRegistered(unregisteredSeller)).toBe(false);

      const emptyGstinSeller: SellerSnapshot = {
        ...unregisteredSeller,
        gstin: "",
      };
      expect(isSellerGstRegistered(emptyGstinSeller)).toBe(false);

      const malformedGstinSeller: SellerSnapshot = {
        ...unregisteredSeller,
        gstin: "INVALID123",
      };
      expect(isSellerGstRegistered(malformedGstinSeller)).toBe(false);
    });

    it("builds seller snapshot using authoritative server environment variables", () => {
      process.env.SELLER_LEGAL_NAME = "RoboShop Forge Technologies Pvt Ltd";
      process.env.SELLER_TAX_MODE = "gst_registered";
      process.env.SELLER_GSTIN = "29AABCR1234F1Z5";
      process.env.SELLER_STATE = "Karnataka";
      process.env.SELLER_STATE_CODE = "29";
      resetEnvCache();

      const seller = buildSellerSnapshot();
      expect(seller.legal_name).toBe("RoboShop Forge Technologies Pvt Ltd");
      expect(seller.gstin).toBe("29AABCR1234F1Z5");
      expect(seller.state).toBe("Karnataka");
      expect(seller.state_code).toBe("29");
    });

    it("defaults GSTIN to UNREGISTERED in non-live mode when GSTIN is not provided", () => {
      process.env.PAYMENT_MODE = "test";
      process.env.SELLER_GSTIN = "";
      resetEnvCache();

      const seller = buildSellerSnapshot();
      expect(seller.gstin).toBe("UNREGISTERED / NOT APPLICABLE");
    });

    it("throws descriptive error when mandatory seller details are missing", () => {
      // Missing legal name
      process.env.SELLER_LEGAL_NAME = "   ";
      resetEnvCache();
      expect(() => buildSellerSnapshot()).toThrow(/SELLER_LEGAL_NAME is required/);

      // Missing or invalid email
      process.env.SELLER_LEGAL_NAME = "RoboShop Forge";
      process.env.SELLER_EMAIL = "not-an-email";
      resetEnvCache();
      expect(() => buildSellerSnapshot()).toThrow(/Invalid server environment configuration|SELLER_EMAIL is required/);

      // Missing city
      process.env.SELLER_EMAIL = "billing@example.com";
      process.env.SELLER_CITY = "   ";
      resetEnvCache();
      expect(() => buildSellerSnapshot()).toThrow(/SELLER_CITY is required/);

      // Missing state
      process.env.SELLER_CITY = "Bengaluru";
      process.env.SELLER_STATE = "   ";
      resetEnvCache();
      expect(() => buildSellerSnapshot()).toThrow(/SELLER_STATE is required/);
    });
  });

  describe("Repeat Issuance & Idempotency", () => {
    it("returns identical invoice snapshot on repeat calls without creating duplicates", async () => {
      const order = createTestMockOrder();

      // First call issues the invoice
      const invoice1 = await getOrCreateInvoiceSnapshot(order.order_code);
      expect(invoice1).not.toBeNull();
      expect(invoice1?.order_code).toBe(order.order_code);

      // Second call returns existing invoice
      const invoice2 = await getOrCreateInvoiceSnapshot(order.order_code);
      expect(invoice2).not.toBeNull();
      expect(invoice2?.invoice_number).toBe(invoice1?.invoice_number);
      expect(invoice2?.total_paise).toBe(invoice1?.total_paise);
      expect(invoice2?.issue_date).toBe(invoice1?.issue_date);

      // Verify directly from store
      const stored = getMockInvoiceByOrderCode(order.order_code);
      expect(stored?.invoice_number).toBe(invoice1?.invoice_number);
    });

    it("does not issue invoice if payment is still pending", async () => {
      const order = createTestMockOrder({
        order_code: "RBF-99990000-11112222-33334444-55556666",
        payment_status: "pending",
      });

      const invoice = await getOrCreateInvoiceSnapshot(order.order_code);
      expect(invoice).toBeNull();
    });
  });

  describe("Invoice Persistence Across Lifecycle (Delivery & Refund)", () => {
    it("persists invoice snapshot even after delivery status is delivered", async () => {
      const order = createTestMockOrder({
        order_code: "RBF-DELIVER-1111-2222-3333-444455556666",
        payment_status: "paid",
        delivery_status: "pending",
      });

      const initialInvoice = await getOrCreateInvoiceSnapshot(order.order_code);
      expect(initialInvoice).not.toBeNull();

      // Order advances to delivered
      order.delivery_status = "delivered";
      saveMockOrder(order);

      const postDeliveryInvoice = await getOrCreateInvoiceSnapshot(order.order_code);
      expect(postDeliveryInvoice).not.toBeNull();
      expect(postDeliveryInvoice?.invoice_number).toBe(initialInvoice?.invoice_number);
    });

    it("persists invoice snapshot even after refund occurs", async () => {
      const order = createTestMockOrder({
        order_code: "RBF-REFUND-1111-2222-3333-444455556666",
        payment_status: "paid",
        delivery_status: "shipped",
      });

      const initialInvoice = await getOrCreateInvoiceSnapshot(order.order_code);
      expect(initialInvoice).not.toBeNull();

      // Refund occurs
      order.payment_status = "refunded";
      saveMockOrder(order);

      const postRefundInvoice = await getOrCreateInvoiceSnapshot(order.order_code);
      expect(postRefundInvoice).not.toBeNull();
      expect(postRefundInvoice?.invoice_number).toBe(initialInvoice?.invoice_number);
      expect(postRefundInvoice?.total_paise).toBe(initialInvoice?.total_paise);
    });
  });

  describe("Financial Utilities & Currency Representation", () => {
    it("formats integer paise into ASCII-safe INR representation for PDF rendering", () => {
      expect(formatINRAscii(21830000)).toBe("INR 2,18,300.00");
      expect(formatINRAscii(0)).toBe("INR 0.00");
      expect(formatINRAscii(45000)).toBe("INR 450.00");
    });

    it("converts integer paise into accurate Indian currency words representation", () => {
      expect(amountToWordsINR(0)).toBe("Zero Rupees Only");
      expect(amountToWordsINR(50000)).toBe("Five Hundred Rupees Only");
      expect(amountToWordsINR(21830000)).toBe(
        "Two Lakh Eighteen Thousand Three Hundred Rupees Only"
      );
      expect(amountToWordsINR(1500000000)).toBe(
        "One Crore Fifty Lakh Rupees Only"
      );
      expect(amountToWordsINR(12550)).toBe(
        "One Hundred Twenty Five Rupees and Fifty Paise Only"
      );
    });
  });
});
