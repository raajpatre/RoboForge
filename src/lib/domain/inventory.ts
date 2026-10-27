import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export class InventoryError extends Error {
  constructor(message: string, public readonly code: "INSUFFICIENT_STOCK" | "NOT_FOUND" | "RPC_ERROR") {
    super(message);
    this.name = "InventoryError";
  }
}

export interface InventoryReservationItem {
  product_id: string;
  quantity: number;
}

/**
 * Atomically reserves inventory for an order with a TTL (default: 15 minutes).
 * Uses PostgreSQL row-level pessimistic locking (`FOR UPDATE`) in the database procedure.
 */
export async function reserveInventory(
  supabase: SupabaseClient<Database>,
  orderId: string,
  items: InventoryReservationItem[],
  ttlMinutes = 15
): Promise<boolean> {
  const { data, error } = await supabase.rpc("reserve_stock_for_order", {
    p_order_id: orderId,
    p_items: items as unknown as import("@/types/database").Json,
    p_ttl_minutes: ttlMinutes,
  });

  if (error) {
    if (error.message.includes("Insufficient stock")) {
      throw new InventoryError(error.message, "INSUFFICIENT_STOCK");
    }
    if (error.message.includes("not found")) {
      throw new InventoryError(error.message, "NOT_FOUND");
    }
    throw new InventoryError(`Failed to reserve stock: ${error.message}`, "RPC_ERROR");
  }

  return Boolean(data);
}

/**
 * Permanently consumes reserved inventory upon confirmed payment.
 * Idempotent: safe to run multiple times for the same order without double-deduction.
 */
export async function consumeInventory(
  supabase: SupabaseClient<Database>,
  orderId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("consume_stock_for_order", {
    p_order_id: orderId,
  });

  if (error) {
    throw new InventoryError(`Failed to consume inventory: ${error.message}`, "RPC_ERROR");
  }

  return Boolean(data);
}

/**
 * Releases reserved inventory back to available stock if payment fails, expires, or is cancelled.
 * Idempotent: safe to run multiple times.
 */
export async function releaseInventory(
  supabase: SupabaseClient<Database>,
  orderId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("release_stock_for_order", {
    p_order_id: orderId,
  });

  if (error) {
    throw new InventoryError(`Failed to release inventory: ${error.message}`, "RPC_ERROR");
  }

  return Boolean(data);
}

/**
 * Background routine to clean up and return stock from abandoned reservations that exceeded TTL.
 */
export async function cleanupExpiredReservations(
  supabase: SupabaseClient<Database>
): Promise<number> {
  const { data, error } = await supabase.rpc("cleanup_expired_reservations");

  if (error) {
    throw new InventoryError(`Failed to cleanup expired inventory: ${error.message}`, "RPC_ERROR");
  }

  return typeof data === "number" ? data : 0;
}
