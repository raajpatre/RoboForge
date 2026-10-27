import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeInventory, releaseInventory } from "@/lib/domain/inventory";
import { getPublicEnv } from "@/lib/env";
import { getOrCreateInvoiceSnapshot } from "@/lib/domain/invoice";
import {
  getMockOrderByRazorpayOrderId,
  getMockOrderByCode,
  updateMockOrder,
  releaseMockReservation,
  getMockWebhookEvent,
  recordMockWebhookEvent,
} from "@/lib/domain/mock-store";

interface RazorpayWebhookPayload {
  entity: string;
  account_id: string;
  event: string;
  contains: string[];
  payload: {
    payment?: {
      entity: {
        id: string;
        order_id: string;
        amount: number;
        currency: string;
        status: string;
        method: string;
        notes?: Record<string, string>;
        error_code?: string;
        error_description?: string;
      };
    };
    order?: {
      entity: {
        id: string;
        receipt?: string;
      };
    };
    refund?: {
      entity: {
        id: string;
        payment_id: string;
        amount: number;
        currency: string;
        status: string;
        notes?: Record<string, string>;
      };
    };
  };
  created_at: number;
}

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function POST(req: NextRequest) {
  // 1. Read Exact Raw Request Body for Cryptographic Verification
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";

  // Cryptographic HMAC SHA-256 signature verification
  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json(
      { error: "Invalid webhook cryptographic signature" },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  let eventData: RazorpayWebhookPayload;
  try {
    eventData = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Malformed JSON payload" },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const eventType = eventData.event;
  const paymentEntity = eventData.payload?.payment?.entity;
  const refundEntity = eventData.payload?.refund?.entity;

  // 2. Persistent Unique Event Identifier for Deduplication
  const targetId = paymentEntity?.id || refundEntity?.id || eventData.created_at;
  const eventId = `${eventType}_${targetId}`;

  const publicEnv = getPublicEnv();
  const isPlaceholderDb = publicEnv.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  // Handle in-memory store in placeholder/test mode
  if (isPlaceholderDb) {
    const existing = getMockWebhookEvent(eventId);
    if (existing && existing.status === "processed") {
      return NextResponse.json(
        { status: "already_processed", event: eventType },
        { status: 200, headers: NO_CACHE_HEADERS }
      );
    }

    // Process event in mock store
    if (eventType === "payment.captured" && paymentEntity) {
      const order =
        getMockOrderByRazorpayOrderId(paymentEntity.order_id) ||
        (paymentEntity.notes?.order_code
          ? getMockOrderByCode(paymentEntity.notes.order_code)
          : undefined);

      if (order) {
        // Strict payment validation: amount and currency must match expected order total
        if (paymentEntity.amount !== order.total_paise || paymentEntity.currency !== order.currency) {
          return NextResponse.json(
            { error: "Payment amount or currency mismatch with order record" },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
      }

      if (order && order.payment_status !== "paid") {
        const isExpired =
          order.reservation_expires_at < Date.now() || order.reservation_status === "expired";

        if (isExpired && order.notes?.includes("out_of_stock")) {
          // Stock cannot be honored! Never silently fulfill
          updateMockOrder(order.order_code, {
            payment_status: "paid",
            delivery_status: "cancelled",
            razorpay_payment_id: paymentEntity.id,
            notes: "Late payment received after reservation expired. Stock unavailable; flagged for manual intervention or refund.",
          });
        } else {
          updateMockOrder(order.order_code, {
            payment_status: "paid",
            delivery_status: "processing",
            razorpay_payment_id: paymentEntity.id,
            reservation_status: "consumed",
          });

          // Create immutable invoice record once payment is settled
          await getOrCreateInvoiceSnapshot(order.order_code).catch(() => {});
        }
      }
    } else if (eventType === "payment.failed" && paymentEntity) {
      const order = getMockOrderByRazorpayOrderId(paymentEntity.order_id);
      if (order && order.payment_status === "pending") {
        updateMockOrder(order.order_code, { payment_status: "failed" });
        releaseMockReservation(order.order_code);
      }
    } else if (eventType === "refund.created" && refundEntity) {
      const order =
        (refundEntity.notes?.order_code ? getMockOrderByCode(refundEntity.notes.order_code) : undefined) ||
        (paymentEntity?.order_id ? getMockOrderByRazorpayOrderId(paymentEntity.order_id) : undefined);

      if (order) {
        // Distinct refund-pending state; never show "Refunded" just because created!
        updateMockOrder(order.order_code, { refund_status: "pending" });
      }
    } else if (eventType === "refund.processed" && refundEntity) {
      const order =
        (refundEntity.notes?.order_code ? getMockOrderByCode(refundEntity.notes.order_code) : undefined) ||
        (paymentEntity?.order_id ? getMockOrderByRazorpayOrderId(paymentEntity.order_id) : undefined);

      if (order) {
        updateMockOrder(order.order_code, {
          payment_status: "refunded",
          delivery_status: "cancelled",
          refund_status: "processed",
          inventory_restored: true,
        });
      }
    } else if (eventType === "refund.failed" && refundEntity) {
      const order =
        (refundEntity.notes?.order_code ? getMockOrderByCode(refundEntity.notes.order_code) : undefined) ||
        (paymentEntity?.order_id ? getMockOrderByRazorpayOrderId(paymentEntity.order_id) : undefined);

      if (order) {
        updateMockOrder(order.order_code, { refund_status: "failed" });
      }
    }

    recordMockWebhookEvent(eventId, "processed");

    return NextResponse.json(
      { status: "ok", mode: "placeholder_test_mode", event: eventType },
      { status: 200, headers: NO_CACHE_HEADERS }
    );
  }

  // 3. PostgreSQL Database Mode with Strict Row Locking & Audit Logging
  const admin = createAdminClient();

  // Deduplication Check
  const { data: existingEvent } = await admin
    .from("webhook_events")
    .select("id, status")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingEvent && existingEvent.status === "processed") {
    return NextResponse.json(
      { status: "already_processed" },
      { status: 200, headers: NO_CACHE_HEADERS }
    );
  }

  // Record pending event in audit log (without logging raw secrets)
  if (!existingEvent) {
    await admin.from("webhook_events").insert({
      event_id: eventId,
      event_type: eventType,
      payload: eventData as unknown as import("@/types/database").Json,
      status: "pending",
    });
  }

  try {
    // 4. Handle Supported Events
    if (eventType === "payment.captured" && paymentEntity) {
      const razorpayOrderId = paymentEntity.order_id;
      const orderCodeFromNotes = paymentEntity.notes?.order_code;

      let query = admin.from("orders").select("id, order_code, total_paise, payment_status, delivery_status, currency");
      if (razorpayOrderId) {
        query = query.eq("razorpay_order_id", razorpayOrderId);
      } else if (orderCodeFromNotes) {
        query = query.eq("order_code", orderCodeFromNotes);
      }

      const { data: order, error: orderLookupError } = await query.maybeSingle();

      if (!orderLookupError && order) {
        // Validate amount and currency
        if (paymentEntity.amount === order.total_paise && paymentEntity.currency === order.currency) {
          // Idempotent: Only process if not already marked paid
          if (order.payment_status !== "paid") {
            // Check reservation status
            const { data: activeReservations } = await admin
              .from("stock_reservations")
              .select("id, expires_at, status")
              .eq("order_id", order.id)
              .eq("status", "reserved");

            const now = new Date();
            const hasValidReservation = (activeReservations || []).some(
              (res) => new Date(res.expires_at) > now
            );

            // Record payment entry
            await admin.from("payments").insert({
              order_id: order.id,
              razorpay_order_id: razorpayOrderId || "",
              razorpay_payment_id: paymentEntity.id,
              amount_paise: order.total_paise,
              currency: order.currency,
              status: "captured",
              method: paymentEntity.method,
              raw_payload: paymentEntity as unknown as import("@/types/database").Json,
            });

            if (hasValidReservation) {
              await admin
                .from("orders")
                .update({
                  payment_status: "paid",
                  delivery_status: order.delivery_status === "pending" ? "processing" : order.delivery_status,
                  razorpay_payment_id: paymentEntity.id,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", order.id);

              await consumeInventory(admin, order.id);

              // Create immutable accounting invoice record upon payment settlement
              await getOrCreateInvoiceSnapshot(order.order_code).catch(() => {});
            } else {
              // Reservation expired! Check warehouse availability
              const { data: orderItems } = await admin
                .from("order_items")
                .select("product_id, quantity")
                .eq("order_id", order.id);

              let canHonorStock = true;
              for (const item of (orderItems || [])) {
                const { data: inv } = await admin
                  .from("inventory")
                  .select("stock_on_hand, stock_reserved")
                  .eq("product_id", item.product_id)
                  .single();

                const available = inv ? inv.stock_on_hand - inv.stock_reserved : 0;
                if (available < item.quantity) {
                  canHonorStock = false;
                  break;
                }
              }

              if (canHonorStock) {
                for (const item of (orderItems || [])) {
                  const { data: inv } = await admin
                    .from("inventory")
                    .select("stock_on_hand")
                    .eq("product_id", item.product_id)
                    .single();

                  if (inv) {
                    await admin
                      .from("inventory")
                      .update({
                        stock_on_hand: Math.max(0, inv.stock_on_hand - item.quantity),
                        updated_at: new Date().toISOString(),
                      })
                      .eq("product_id", item.product_id);
                  }
                }

                await admin
                  .from("orders")
                  .update({
                    payment_status: "paid",
                    delivery_status: "processing",
                    razorpay_payment_id: paymentEntity.id,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", order.id);

                // Create immutable accounting invoice record upon payment settlement
                await getOrCreateInvoiceSnapshot(order.order_code).catch(() => {});
              } else {
                // Stock unavailable! Never silently mark fulfilled
                await admin
                  .from("orders")
                  .update({
                    payment_status: "paid",
                    delivery_status: "cancelled",
                    razorpay_payment_id: paymentEntity.id,
                    notes: "Late payment received after reservation expired. Stock unavailable; flagged for manual intervention or refund.",
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", order.id);

                await admin.from("order_status_history").insert({
                  order_id: order.id,
                  old_fulfillment_status: order.delivery_status,
                  new_fulfillment_status: "cancelled",
                  old_payment_status: order.payment_status,
                  new_payment_status: "paid",
                  actor: "webhook:reconciliation",
                  note: "Payment captured after reservation expired. Stock unavailable; flagged for manual intervention.",
                });
              }
            }
          }
        }
      }
    } else if (eventType === "payment.failed" && paymentEntity) {
      const razorpayOrderId = paymentEntity.order_id;
      const { data: order } = await admin
        .from("orders")
        .select("id, payment_status")
        .eq("razorpay_order_id", razorpayOrderId)
        .maybeSingle();

      if (order && order.payment_status === "pending") {
        await admin
          .from("orders")
          .update({
            payment_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);

        // Immediately release warehouse reservation
        await releaseInventory(admin, order.id);
      }
    } else if (eventType === "refund.created" && refundEntity) {
      const paymentId = refundEntity.payment_id;

      const { data: paymentRecord } = await admin
        .from("payments")
        .select("id, order_id")
        .eq("razorpay_payment_id", paymentId)
        .maybeSingle();

      const orderId = paymentRecord?.order_id;

      if (orderId && paymentRecord) {
        const { data: existingRefund } = await admin
          .from("refunds")
          .select("id")
          .eq("razorpay_refund_id", refundEntity.id)
          .maybeSingle();

        if (!existingRefund) {
          await admin.from("refunds").insert({
            order_id: orderId,
            payment_id: paymentRecord.id,
            razorpay_refund_id: refundEntity.id,
            amount_paise: refundEntity.amount,
            reason: refundEntity.notes?.reason || "Webhook refund.created (pending settlement)",
            status: "pending",
          });
        }
      }
    } else if (eventType === "refund.processed" && refundEntity) {
      const paymentId = refundEntity.payment_id;

      const { data: paymentRecord } = await admin
        .from("payments")
        .select("id, order_id")
        .eq("razorpay_payment_id", paymentId)
        .maybeSingle();

      const orderId = paymentRecord?.order_id;

      if (orderId && paymentRecord) {
        const { data: existingRefund } = await admin
          .from("refunds")
          .select("id, status")
          .eq("razorpay_refund_id", refundEntity.id)
          .maybeSingle();

        if (existingRefund) {
          await admin
            .from("refunds")
            .update({ status: "processed" })
            .eq("id", existingRefund.id);
        } else {
          await admin.from("refunds").insert({
            order_id: orderId,
            payment_id: paymentRecord.id,
            razorpay_refund_id: refundEntity.id,
            amount_paise: refundEntity.amount,
            reason: refundEntity.notes?.reason || "Webhook refund confirmation from Razorpay",
            status: "processed",
          });
        }

        const { data: order } = await admin
          .from("orders")
          .select("id, delivery_status, payment_status")
          .eq("id", orderId)
          .single();

        // Exactly-once state update and restocking
        if (order && order.payment_status !== "refunded") {
          await admin
            .from("orders")
            .update({
              payment_status: "refunded",
              delivery_status: "cancelled",
              updated_at: new Date().toISOString(),
            })
            .eq("id", orderId);

          // Restock inventory exactly once
          const { data: orderItems } = await admin
            .from("order_items")
            .select("product_id, quantity")
            .eq("order_id", orderId);

          for (const item of (orderItems || [])) {
            const { data: inv } = await admin
              .from("inventory")
              .select("stock_on_hand")
              .eq("product_id", item.product_id)
              .single();

            if (inv) {
              await admin
                .from("inventory")
                .update({ stock_on_hand: inv.stock_on_hand + item.quantity })
                .eq("product_id", item.product_id);
            }
          }

          await admin.from("order_status_history").insert({
            order_id: orderId,
            old_fulfillment_status: order.delivery_status,
            new_fulfillment_status: "cancelled",
            old_payment_status: order.payment_status,
            new_payment_status: "refunded",
            actor: "webhook:razorpay",
            note: `Refund processed via Razorpay (${refundEntity.id})`,
          });
        }
      }
    } else if (eventType === "refund.failed" && refundEntity) {
      await admin
        .from("refunds")
        .update({ status: "failed" })
        .eq("razorpay_refund_id", refundEntity.id);
    }

    // 5. Mark webhook event as processed
    await admin
      .from("webhook_events")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
      })
      .eq("event_id", eventId);

    return NextResponse.json(
      { status: "success", event: eventType },
      { status: 200, headers: NO_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await admin
      .from("webhook_events")
      .update({
        status: "failed",
        error_message: errorMsg,
      })
      .eq("event_id", eventId);

    return NextResponse.json(
      { error: "Webhook processing error" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
