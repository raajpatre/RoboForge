import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicEnv } from "@/lib/env";
import type { AdminUser } from "@/lib/auth/admin-guard";

export interface LogAuditEventInput {
  actor: AdminUser;
  action:
    | "PRODUCT_CREATE"
    | "PRODUCT_UPDATE"
    | "INVENTORY_ADJUST"
    | "ORDER_STATUS_UPDATE"
    | "REFUND_ISSUE"
    | "ORDER_CANCEL_UNPAID"
    | "ORDER_CANCEL_AND_REFUND"
    | "ADMIN_LOGIN";
  targetType: "product" | "inventory" | "order" | "refund" | "auth";
  targetId: string;
  details?: Record<string, unknown>;
}

/**
 * Persists an immutable administrative audit record in the audit_logs table.
 */
export async function logAuditEvent(input: LogAuditEventInput): Promise<void> {
  const publicEnv = getPublicEnv();
  const isPlaceholderDb = publicEnv.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  if (isPlaceholderDb) {
    // In mock/test environments, log cleanly to server stdout for test visibility
    if (process.env.NODE_ENV !== "test") {
      console.log(`[AUDIT] ${input.action} by ${input.actor.email} on ${input.targetType}:${input.targetId}`);
    }
    return;
  }

  try {
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      actor_id: input.actor.id,
      actor_email: input.actor.email,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      details: (input.details || {}) as import("@/types/database").Json,
    });
  } catch (err) {
    console.error("Failed to persist audit log entry:", err);
  }
}
