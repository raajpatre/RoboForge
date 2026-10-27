"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateOrderStatusAction, cancelAndRefundOrderAction } from "@/app/actions/admin";
import { formatINR } from "@/lib/domain/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DeliveryStatus } from "@/types/domain";
import {
  Truck,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  FileText,
  XCircle,
  ShieldAlert,
  Loader2,
  Info,
} from "lucide-react";

interface OrderActionsProps {
  orderId: string;
  orderCode?: string;
  currentDeliveryStatus: DeliveryStatus;
  currentPaymentStatus: string;
  refundStatus?: "pending" | "processed" | "failed" | null;
  totalPaise: number;
}

export function OrderActions({
  orderId,
  orderCode,
  currentDeliveryStatus,
  currentPaymentStatus,
  refundStatus,
  totalPaise,
}: OrderActionsProps) {
  const router = useRouter();

  // Delivery Status State
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>(currentDeliveryStatus);
  const [transitionNote, setTransitionNote] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Cancel & Refund State
  const [cancellationReason, setCancellationReason] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState<{
    text: string;
    isError: boolean;
    creditNote?: string;
    refundStatus?: string;
  } | null>(null);

  // Invoice Download State
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const isShippedOrDelivered = currentDeliveryStatus === "shipped" || currentDeliveryStatus === "delivered";
  const isCancelled = currentDeliveryStatus === "cancelled";
  const isTerminalState = currentDeliveryStatus === "delivered" || currentDeliveryStatus === "cancelled";
  const isPaid = currentPaymentStatus === "paid";
  const isAlreadyRefunded = currentPaymentStatus === "refunded" || refundStatus === "processed";

  // Handle Delivery Stage Update
  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingStatus(true);
    setStatusMessage(null);

    try {
      const res = await updateOrderStatusAction(
        orderId,
        deliveryStatus,
        transitionNote.trim() || undefined
      );

      if (res.success) {
        setStatusMessage({
          text: `Fulfillment stage successfully updated to "${deliveryStatus}".`,
          isError: false,
        });
        setTransitionNote("");
        router.refresh();
      } else {
        setStatusMessage({
          text: res.error || "Failed to update delivery stage.",
          isError: true,
        });
      }
    } catch (err: unknown) {
      setStatusMessage({
        text: err instanceof Error ? err.message : "Failed to update status.",
        isError: true,
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Handle Cancel & Refund Action
  const handleExecuteCancelAndRefund = async () => {
    if (!cancellationReason.trim() || cancellationReason.trim().length < 3) {
      setCancelResult({
        text: "A valid cancellation reason (minimum 3 characters) is required.",
        isError: true,
      });
      return;
    }

    setIsCancelling(true);
    setCancelResult(null);

    try {
      const res = await cancelAndRefundOrderAction({
        orderId,
        reason: cancellationReason.trim(),
      });

      if (res.success) {
        setShowConfirmModal(false);
        setCancellationReason("");

        if (res.actionTaken === "cancelled_unpaid") {
          setCancelResult({
            text: "Order successfully cancelled and inventory reservation released without gateway refund.",
            isError: false,
          });
        } else if (res.refundStatus === "pending") {
          setCancelResult({
            text: "Refund initiated at gateway. Status is currently pending settlement (not yet marked refunded).",
            isError: false,
            refundStatus: "pending",
          });
        } else {
          setCancelResult({
            text: `Order successfully cancelled and full refund processed. Tax credit note: ${res.creditNoteNumber || "Issued"}`,
            isError: false,
            creditNote: res.creditNoteNumber,
            refundStatus: "processed",
          });
        }
        router.refresh();
      } else {
        setShowConfirmModal(false);
        setCancelResult({
          text: res.error || "Cancellation and refund operation failed.",
          isError: true,
          refundStatus: res.refundStatus,
        });
      }
    } catch (err: unknown) {
      setShowConfirmModal(false);
      setCancelResult({
        text: err instanceof Error ? err.message : "Unexpected error during cancellation.",
        isError: true,
      });
    } finally {
      setIsCancelling(false);
    }
  };

  // Handle Admin Invoice PDF Download
  const handleDownloadInvoice = async () => {
    setIsDownloadingInvoice(true);
    setInvoiceError(null);

    try {
      const res = await fetch(`/api/admin/orders/${orderId}/invoice`);
      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error || `HTTP error ${res.status}: Failed to generate invoice.`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tax-invoice-${orderCode || orderId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setInvoiceError(err instanceof Error ? err.message : "Failed to download tax invoice PDF.");
    } finally {
      setIsDownloadingInvoice(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Fulfillment Control Card */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
        <h3 className="font-heading text-base font-bold text-foreground mb-3 flex items-center gap-2">
          <Truck className="size-4 text-primary" />
          Fulfillment & Freight Pipeline
        </h3>

        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Record delivery progress: <strong>Processing → Shipped → Delivered</strong>. Status transitions are recorded with your admin ID and timestamp in immutable audit history.
        </p>

        {statusMessage && (
          <div
            className={`rounded-xl p-3 mb-4 text-xs flex items-start gap-2 ${
              statusMessage.isError
                ? "border border-destructive/30 bg-destructive/5 text-destructive"
                : "border border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {statusMessage.isError ? (
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {isTerminalState ? (
          <div className="rounded-xl border border-border/80 bg-muted/40 p-4 text-xs font-mono text-muted-foreground flex items-center gap-2">
            <Info className="size-4 text-primary shrink-0" />
            <span>
              This order has reached its terminal fulfillment stage (<strong>{currentDeliveryStatus}</strong>). No further stage modifications are permitted.
            </span>
          </div>
        ) : (
          <form onSubmit={handleUpdateStatus} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Target Fulfillment Stage
              </label>
              <select
                value={deliveryStatus}
                onChange={(e) => setDeliveryStatus(e.target.value as DeliveryStatus)}
                disabled={isUpdatingStatus}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-1 text-xs font-mono capitalize focus-visible:ring-1 focus-visible:ring-primary"
              >
                {currentDeliveryStatus === "pending" && (
                  <>
                    <option value="pending">Pending (Order Queued)</option>
                    <option value="processing">Processing (Actuator Assembly & Calibration)</option>
                    <option value="shipped">Shipped (Dispatched with Freight Carrier)</option>
                  </>
                )}
                {currentDeliveryStatus === "processing" && (
                  <>
                    <option value="processing">Processing (Actuator Assembly & Calibration)</option>
                    <option value="shipped">Shipped (Dispatched with Freight Carrier)</option>
                    <option value="delivered">Delivered (Handed over at customer facility)</option>
                  </>
                )}
                {currentDeliveryStatus === "shipped" && (
                  <>
                    <option value="shipped">Shipped (Dispatched with Freight Carrier)</option>
                    <option value="delivered">Delivered (Handed over at customer facility)</option>
                  </>
                )}
              </select>
            </div>

            {currentDeliveryStatus === "shipped" && (
              <p className="text-[11px] text-muted-foreground font-mono bg-muted/50 p-2.5 rounded-lg border border-border/60">
                Notice: Order has already been shipped. In this MVP, only transition to <strong>Delivered</strong> is valid. Cancellations after shipment are disabled.
              </p>
            )}

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Optional Audit / Carrier Note
              </label>
              <Input
                type="text"
                placeholder="e.g. Dispatched via BlueDart AWB #9876543210"
                value={transitionNote}
                onChange={(e) => setTransitionNote(e.target.value)}
                disabled={isUpdatingStatus}
                className="h-9 text-xs font-mono"
              />
            </div>

            <Button
              type="submit"
              disabled={isUpdatingStatus || deliveryStatus === currentDeliveryStatus}
              className="w-full font-mono text-xs cursor-pointer"
            >
              {isUpdatingStatus ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  Updating Fulfillment Pipeline...
                </>
              ) : (
                "Commit Fulfillment Stage"
              )}
            </Button>
          </form>
        )}
      </div>

      {/* 2. Explicit Cancel and Refund Action Card */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
        <h3 className="font-heading text-base font-bold text-foreground mb-3 flex items-center gap-2">
          <RotateCcw className="size-4 text-rose-500" />
          Cancel Order & Refund Operations
        </h3>

        {/* Distinct Refund Status Badges */}
        {refundStatus === "pending" && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 mb-4 text-amber-600 dark:text-amber-400 flex items-start gap-2 text-xs">
            <Clock className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Refund Pending Gateway Reconciliation</p>
              <p className="text-[11px] mt-0.5">
                A refund request has been initiated at Razorpay and is awaiting final settlement. Do not submit duplicate refund requests.
              </p>
            </div>
          </div>
        )}

        {isAlreadyRefunded && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3.5 mb-4 text-blue-600 dark:text-blue-400 flex items-start gap-2 text-xs">
            <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Order Cancelled & Fully Refunded</p>
              <p className="text-[11px] mt-0.5">
                Full payment has been reversed to the customer and an audited tax credit note has been generated. Duplicate refunds are prevented.
              </p>
            </div>
          </div>
        )}

        {refundStatus === "failed" && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 mb-4 text-destructive flex items-start gap-2 text-xs">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Refund Attempt Failed</p>
              <p className="text-[11px] mt-0.5">
                The gateway reported a failure during payment reversal. Verify provider telemetry before retrying.
              </p>
            </div>
          </div>
        )}

        {cancelResult && (
          <div
            className={`rounded-xl p-3 mb-4 text-xs flex items-start gap-2 ${
              cancelResult.isError
                ? "border border-destructive/30 bg-destructive/5 text-destructive"
                : "border border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {cancelResult.isError ? (
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold">{cancelResult.isError ? "Operation Error" : "Success"}</p>
              <p className="mt-0.5">{cancelResult.text}</p>
              {cancelResult.creditNote && (
                <p className="font-mono font-bold mt-1">Credit Note: {cancelResult.creditNote}</p>
              )}
            </div>
          </div>
        )}

        {/* Server Cancellation Enforcement Banner */}
        {isShippedOrDelivered ? (
          <div className="rounded-xl border border-border/80 bg-muted/40 p-4 text-xs font-mono text-muted-foreground flex items-start gap-2.5">
            <ShieldAlert className="size-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-sans font-bold text-foreground text-xs">Cancellations Disabled After Shipment</p>
              <p className="mt-1 leading-relaxed text-[11px]">
                Under store policy and Phase 8 server rules, orders that have already been shipped or delivered cannot be cancelled. Physical hardware is with freight logistics.
              </p>
            </div>
          </div>
        ) : isCancelled && isAlreadyRefunded ? (
          <div className="rounded-xl border border-border/80 bg-muted/40 p-4 text-xs font-mono text-muted-foreground flex items-center gap-2">
            <XCircle className="size-4 text-muted-foreground shrink-0" />
            <span>Order is voided and refunded. No further cancellation actions required.</span>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isPaid
                ? `Initiates a verified full refund of ${formatINR(totalPaise)} through Razorpay, issues a GST credit note, voids delivery, and restores warehouse stock exactly once.`
                : "Cancels this unpaid order and releases reserved warehouse inventory without calling the payment gateway."}
            </p>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Mandatory Cancellation Reason (Audit Trail) *
              </label>
              <Input
                type="text"
                placeholder="e.g. Customer requested cancellation prior to freight dispatch"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                disabled={isCancelling}
                className="h-9 text-xs"
                required
              />
            </div>

            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowConfirmModal(true)}
              disabled={isCancelling || !cancellationReason.trim() || cancellationReason.trim().length < 3}
              className="w-full font-mono text-xs cursor-pointer gap-1.5"
            >
              <RotateCcw className="size-3.5" />
              {isPaid ? "Cancel Order & Process Full Refund" : "Cancel Order & Release Inventory"}
            </Button>
          </div>
        )}
      </div>

      {/* 3. Admin Invoice Generation & Download Card */}
      {(isPaid || currentDeliveryStatus === "delivered") && (
        <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
          <h3 className="font-heading text-base font-bold text-foreground mb-2 flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            Accounting Tax Invoice
          </h3>

          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            Download the immutable accounting tax invoice PDF generated from immutable buyer, seller, and GST item snapshots.
          </p>

          {invoiceError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 mb-4 text-destructive flex items-start gap-2 text-xs">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{invoiceError}</span>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handleDownloadInvoice}
            disabled={isDownloadingInvoice}
            className="w-full font-mono text-xs cursor-pointer gap-1.5"
          >
            {isDownloadingInvoice ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Generating Invoice PDF...
              </>
            ) : (
              <>
                <FileText className="size-3.5 text-primary" />
                Download Tax Invoice (PDF)
              </>
            )}
          </Button>
        </div>
      )}

      {/* Confirmation Modal Dialog */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in-50">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 text-destructive font-heading font-bold text-base">
              <AlertTriangle className="size-5" />
              <span>Confirm Order Cancellation & Reversal</span>
            </div>

            <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
              <p>
                Are you sure you want to cancel order <strong className="font-mono text-foreground">{orderCode || orderId}</strong>?
              </p>
              {isPaid ? (
                <div className="bg-destructive/5 border border-destructive/20 p-3 rounded-xl text-foreground text-xs space-y-1">
                  <p className="font-semibold text-destructive">Financial Actions Upon Confirmation:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground text-[11px]">
                    <li>Full refund of <strong>{formatINR(totalPaise)}</strong> initiated via Razorpay credentials.</li>
                    <li>Official GST tax credit note generated and recorded.</li>
                    <li>Warehouse stock restored exactly once.</li>
                    <li>Original tax invoice preserved intact in ledger.</li>
                  </ul>
                </div>
              ) : (
                <p>
                  This order has not been paid. Cancelling will void the order and safely release all active inventory reservations back to available warehouse stock.
                </p>
              )}
              <p className="font-mono text-[11px] pt-1">
                Reason: &ldquo;{cancellationReason}&rdquo;
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowConfirmModal(false)}
                disabled={isCancelling}
                className="font-mono text-xs"
              >
                Go Back
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleExecuteCancelAndRefund}
                disabled={isCancelling}
                className="font-mono text-xs gap-1.5"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Executing Reversal...
                  </>
                ) : (
                  "Confirm & Execute Cancellation"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
