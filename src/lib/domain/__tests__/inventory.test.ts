import { describe, it, expect, vi } from "vitest";
import {
  reserveInventory,
  consumeInventory,
  releaseInventory,
  cleanupExpiredReservations,
  InventoryError,
} from "../inventory";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

describe("Inventory Domain Service", () => {
  it("successfully reserves inventory via RPC", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    } as unknown as SupabaseClient<Database>;

    const result = await reserveInventory(
      mockSupabase,
      "order-123",
      [{ product_id: "p-1", quantity: 2 }],
      15
    );

    expect(result).toBe(true);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("reserve_stock_for_order", {
      p_order_id: "order-123",
      p_items: [{ product_id: "p-1", quantity: 2 }],
      p_ttl_minutes: 15,
    });
  });

  it("handles insufficient stock gracefully by throwing InventoryError with INSUFFICIENT_STOCK", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Insufficient stock for product p-1. Available: 1, Requested: 2" },
      }),
    } as unknown as SupabaseClient<Database>;

    await expect(
      reserveInventory(mockSupabase, "order-123", [{ product_id: "p-1", quantity: 2 }])
    ).rejects.toThrowError(InventoryError);

    try {
      await reserveInventory(mockSupabase, "order-123", [{ product_id: "p-1", quantity: 2 }]);
    } catch (err) {
      expect(err).toBeInstanceOf(InventoryError);
      expect((err as InventoryError).code).toBe("INSUFFICIENT_STOCK");
    }
  });

  it("permanently consumes reserved inventory upon confirmed payment", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    } as unknown as SupabaseClient<Database>;

    const result = await consumeInventory(mockSupabase, "order-123");
    expect(result).toBe(true);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("consume_stock_for_order", {
      p_order_id: "order-123",
    });
  });

  it("releases reserved inventory back to warehouse upon checkout cancellation", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    } as unknown as SupabaseClient<Database>;

    const result = await releaseInventory(mockSupabase, "order-123");
    expect(result).toBe(true);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("release_stock_for_order", {
      p_order_id: "order-123",
    });
  });

  it("cleans up expired reservations and returns the released count", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ data: 4, error: null }),
    } as unknown as SupabaseClient<Database>;

    const count = await cleanupExpiredReservations(mockSupabase);
    expect(count).toBe(4);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("cleanup_expired_reservations");
  });
});
