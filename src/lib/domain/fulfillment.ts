import type { DeliveryStatus } from "@/types/domain";

/**
 * Validates delivery state transitions according to Phase 8 business rules:
 * - Allowed delivery transitions: Processing -> Shipped -> Delivered.
 * - Allow cancellation only before shipment in this MVP (pending / processing -> cancelled).
 * - Shipped and delivered orders can NEVER be cancelled.
 * - Delivered and cancelled are terminal states.
 */
export function isAllowedDeliveryTransition(
  current: DeliveryStatus,
  next: DeliveryStatus
): { allowed: boolean; reason?: string } {
  if (current === next) {
    return { allowed: true };
  }

  if (current === "delivered") {
    return {
      allowed: false,
      reason: "Order has already been delivered and is in its terminal fulfillment state.",
    };
  }

  if (current === "cancelled") {
    return {
      allowed: false,
      reason: "Order is already cancelled and cannot be transitioned to another state.",
    };
  }

  if (next === "cancelled") {
    if (current === "shipped") {
      return {
        allowed: false,
        reason: `Cannot cancel an order that is already ${current}. Cancellations are strictly permitted only prior to shipment.`,
      };
    }
    return { allowed: true };
  }

  if (current === "pending") {
    if (next === "processing" || next === "shipped") {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Invalid transition from pending to ${next}. Must proceed to processing or shipped first.`,
    };
  }

  if (current === "processing") {
    if (next === "shipped" || next === "delivered") {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Invalid transition from processing to ${next}.`,
    };
  }

  if (current === "shipped") {
    if (next === "delivered") {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `From shipped, order can only transition to delivered. Cannot revert to ${next} or cancel after shipment.`,
    };
  }

  return { allowed: false, reason: `Invalid transition from ${current} to ${next}.` };
}
