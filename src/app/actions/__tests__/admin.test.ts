import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createProductAction,
  updateProductAction,
  adjustInventoryAction,
  updateOrderStatusAction,
  processRefundAction,
} from "../admin";
import { resetEnvCache } from "@/lib/env";

describe("Admin Server Actions", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ADMIN_EMAILS = "admin@roboshopforge.local";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    resetEnvCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvCache();
  });

  describe("Product & Inventory Management", () => {
    it("validates input and creates new product SKU", async () => {
      const res = await createProductAction({
        name: "OmniGrip Soft Claw",
        slug: "omnigrip-soft-claw",
        description: "Adaptive silicone gripper for soft assembly",
        price_paise: 1250000,
        image_url: "https://example.com/claw.jpg",
        hsn_code: "84795000",
        tax_rate_bps: 1800,
        is_active: true,
        stock_on_hand: 15,
        metadata: {},
      });

      expect(res.success).toBe(true);
      expect(res.productId).toBeDefined();
    });

    it("rejects invalid product creation payload (e.g. invalid slug or negative price)", async () => {
      const res = await createProductAction({
        name: "Bad Item",
        slug: "BAD_SLUG_WITH_CAPS!",
        description: "",
        price_paise: -500,
        image_url: "",
        hsn_code: "84795000",
        tax_rate_bps: 1800,
        is_active: true,
        stock_on_hand: 5,
        metadata: {},
      });

      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it("updates product details successfully", async () => {
      const res = await updateProductAction("mock-prod-1", {
        name: "ForgeBot Alpha 6-DOF (V2)",
        slug: "forgebot-alpha-6dof-v2",
        description: "Upgraded payload capacity",
        price_paise: 19500000,
        image_url: "https://example.com/v2.jpg",
        hsn_code: "84795000",
        tax_rate_bps: 1800,
        is_active: true,
        stock_on_hand: 20,
        metadata: {},
      });

      expect(res.success).toBe(true);
    });

    it("adjusts inventory stock on hand and rejects negative quantities", async () => {
      const validRes = await adjustInventoryAction("mock-prod-1", 25);
      expect(validRes.success).toBe(true);

      const invalidRes = await adjustInventoryAction("mock-prod-1", -10);
      expect(invalidRes.success).toBe(false);
      expect(invalidRes.error).toMatch(/must be a non-negative integer/);
    });

    it("prevents setting stock on hand below currently reserved checkout inventory", async () => {
      // In live database mode, mock supabase admin returning stock_reserved = 5
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://live-test.supabase.co";
      resetEnvCache();

      const { vi } = await import("vitest");
      const supabaseServer = await import("@/lib/supabase/server");
      vi.spyOn(supabaseServer, "createClient").mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "admin-123", email: "admin@roboshopforge.local" } },
            error: null,
          }),
        },
      } as unknown as Awaited<ReturnType<typeof supabaseServer.createClient>>);

      const supabaseAdmin = await import("@/lib/supabase/admin");
      vi.spyOn(supabaseAdmin, "createAdminClient").mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "inventory") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { stock_reserved: 5, stock_on_hand: 10 },
                error: null,
              }),
            };
          }
          if (table === "products") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              neq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.createAdminClient>);

      const res = await updateProductAction("mock-prod-1", {
        name: "ForgeBot Arm",
        slug: "forgebot-arm",
        sku: "RBF-ARM",
        category: "manipulators",
        description: "",
        price_paise: 100000,
        image_url: "",
        hsn_code: "84795000",
        tax_rate_bps: 1800,
        is_active: true,
        stock_on_hand: 3, // Less than reserved count of 5!
        metadata: {},
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cannot be less than currently reserved checkout stock/);
    });

    it("disables product availability without removing product record or affecting historical orders", async () => {
      const res = await updateProductAction("mock-prod-1", {
        name: "ForgeBot Alpha (Decommissioned)",
        slug: "forgebot-alpha-decommissioned",
        sku: "RBF-DECOMMISSIONED",
        category: "manipulators",
        description: "Phased out unit",
        price_paise: 18500000,
        image_url: "",
        hsn_code: "84795000",
        tax_rate_bps: 1800,
        is_active: false, // Disabling product
        stock_on_hand: 0,
        metadata: {},
      });

      expect(res.success).toBe(true);
    });
  });

  describe("Order Management & Decoupled State Updates", () => {
    it("updates order delivery fulfillment status", async () => {
      const res = await updateOrderStatusAction("mock-order-01", "shipped");
      expect(res.success).toBe(true);
    });
  });

  describe("Idempotent Refund & Credit Note Processing", () => {
    it("rejects refund requests missing an audited reason", async () => {
      const res = await processRefundAction({
        orderId: "mock-order-01",
        reason: "",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/refund reason is required/);
    });

    it("processes authorized refund and generates credit note number", async () => {
      const res = await processRefundAction({
        orderId: "mock-order-01",
        reason: "Client lab cancelled project requirements prior to dispatch.",
        amountPaise: 21830000,
      });

      expect(res.success).toBe(true);
      expect(res.creditNoteNumber).toMatch(/^CN-\d{4}-[A-Z0-9]+$/);
    });
  });
});
