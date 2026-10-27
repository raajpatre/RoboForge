"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatINR } from "@/lib/domain/money";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  X,
} from "lucide-react";

export interface AdminOrderItemSummary {
  name: string;
  quantity: number;
  totalPaise: number;
}

export interface AdminOrderRow {
  id: string;
  order_code: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: {
    line1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };
  total_paise: number;
  payment_status: string;
  delivery_status: string;
  refund_status?: "pending" | "processed" | "failed" | null;
  items: AdminOrderItemSummary[];
  created_at: string;
}

interface OrdersTableClientProps {
  initialOrders: AdminOrderRow[];
}

export function OrdersTableClient({ initialOrders }: OrdersTableClientProps) {
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("all");
  const [refundFilter, setRefundFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;
  const [referenceTimestamp] = useState(() => Date.now());

  // Filter & Search Logic
  const filteredOrders = useMemo(() => {
    return initialOrders.filter((order) => {
      // 1. Search Query: matches order number (code), customer name, email, or phone
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesCode = order.order_code.toLowerCase().includes(q);
        const matchesName = order.customer_name.toLowerCase().includes(q);
        const matchesEmail = order.customer_email.toLowerCase().includes(q);
        const matchesPhone = order.customer_phone.toLowerCase().includes(q);
        if (!matchesCode && !matchesName && !matchesEmail && !matchesPhone) {
          return false;
        }
      }

      // 2. Payment Status Filter
      if (paymentFilter !== "all" && order.payment_status !== paymentFilter) {
        return false;
      }

      // 3. Delivery Status Filter
      if (deliveryFilter !== "all" && order.delivery_status !== deliveryFilter) {
        return false;
      }

      // 4. Refund Status Filter
      if (refundFilter !== "all") {
        if (refundFilter === "refund_pending" && order.refund_status !== "pending") {
          return false;
        }
        if (refundFilter === "refunded" && order.payment_status !== "refunded" && order.refund_status !== "processed") {
          return false;
        }
        if (refundFilter === "refund_failed" && order.refund_status !== "failed") {
          return false;
        }
        if (refundFilter === "none" && (order.payment_status === "refunded" || !!order.refund_status)) {
          return false;
        }
      }

      // 5. Date Filter
      if (dateFilter !== "all") {
        const orderDate = new Date(order.created_at).getTime();
        if (dateFilter === "today") {
          const oneDayAgo = referenceTimestamp - 24 * 60 * 60 * 1000;
          if (orderDate < oneDayAgo) return false;
        } else if (dateFilter === "7days") {
          const sevenDaysAgo = referenceTimestamp - 7 * 24 * 60 * 60 * 1000;
          if (orderDate < sevenDaysAgo) return false;
        } else if (dateFilter === "30days") {
          const thirtyDaysAgo = referenceTimestamp - 30 * 24 * 60 * 60 * 1000;
          if (orderDate < thirtyDaysAgo) return false;
        }
      }

      return true;
    });
  }, [initialOrders, searchQuery, paymentFilter, deliveryFilter, refundFilter, dateFilter, referenceTimestamp]);

  // Pagination slices
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedOrders = filteredOrders.slice(startIndex, startIndex + pageSize);

  const resetFilters = () => {
    setSearchQuery("");
    setPaymentFilter("all");
    setDeliveryFilter("all");
    setRefundFilter("all");
    setDateFilter("all");
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    paymentFilter !== "all" ||
    deliveryFilter !== "all" ||
    refundFilter !== "all" ||
    dateFilter !== "all";

  return (
    <div className="space-y-6">
      {/* Search and Filters Toolbar */}
      <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search by order token (RBF-...), customer name, or email..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 h-10 text-xs font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filter Counters / Reset */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="text-xs font-mono text-muted-foreground hover:text-foreground h-9 gap-1.5 shrink-0"
            >
              <X className="size-3.5" />
              Clear Filters
            </Button>
          )}
        </div>

        {/* Filter Dropdowns Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border/60">
          {/* Payment State */}
          <div>
            <label className="block text-[10px] font-mono uppercase text-muted-foreground mb-1">
              Payment State
            </label>
            <select
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs font-mono focus-visible:ring-1 focus-visible:ring-primary"
            >
              <option value="all">All Payments</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Delivery State */}
          <div>
            <label className="block text-[10px] font-mono uppercase text-muted-foreground mb-1">
              Delivery State
            </label>
            <select
              value={deliveryFilter}
              onChange={(e) => {
                setDeliveryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs font-mono focus-visible:ring-1 focus-visible:ring-primary"
            >
              <option value="all">All Delivery States</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Refund State */}
          <div>
            <label className="block text-[10px] font-mono uppercase text-muted-foreground mb-1">
              Refund State
            </label>
            <select
              value={refundFilter}
              onChange={(e) => {
                setRefundFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs font-mono focus-visible:ring-1 focus-visible:ring-primary"
            >
              <option value="all">All Refund States</option>
              <option value="none">No Refund</option>
              <option value="refund_pending">Refund Pending</option>
              <option value="refunded">Refunded</option>
              <option value="refund_failed">Refund Failed</option>
            </select>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-[10px] font-mono uppercase text-muted-foreground mb-1">
              Order Placed Date
            </label>
            <select
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs font-mono focus-visible:ring-1 focus-visible:ring-primary"
            >
              <option value="all">All Time</option>
              <option value="today">Today (Past 24h)</option>
              <option value="7days">Past 7 Days</option>
              <option value="30days">Past 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table Card */}
      <div className="rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-muted-foreground font-mono text-[11px] uppercase tracking-wider">
                <th className="py-3.5 px-4 font-semibold">Order Token & Date</th>
                <th className="py-3.5 px-4 font-semibold">Customer Contact Info (Staff Ops)</th>
                <th className="py-3.5 px-4 font-semibold">Hardware Items</th>
                <th className="py-3.5 px-4 font-semibold">Shipping Destination</th>
                <th className="py-3.5 px-4 font-semibold text-right">Order Total</th>
                <th className="py-3.5 px-4 font-semibold text-center">Payment State</th>
                <th className="py-3.5 px-4 font-semibold text-center">Delivery Stage</th>
                <th className="py-3.5 px-4 font-semibold text-center">Refund State</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono">
              {paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    <p className="font-sans text-sm font-semibold mb-1">No matching orders found</p>
                    <p className="text-xs">Try adjusting your search criteria or resetting filters.</p>
                    {hasActiveFilters && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={resetFilters}
                        className="mt-3 text-xs font-mono"
                      >
                        Reset All Filters
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((order) => {
                  const dateStr = new Date(order.created_at).toLocaleDateString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  });

                  return (
                    <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                      {/* Order Code & Date */}
                      <td className="py-4 px-4 align-top">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-bold text-foreground hover:text-primary transition-colors block truncate max-w-[170px]"
                          title={order.order_code}
                        >
                          {order.order_code}
                        </Link>
                        <span className="text-[11px] text-muted-foreground block mt-0.5">
                          {dateStr}
                        </span>
                      </td>

                      {/* Customer Contact Details (Administrative use only) */}
                      <td className="py-4 px-4 align-top">
                        <p className="font-sans font-bold text-foreground text-xs">
                          {order.customer_name}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate max-w-[200px]" title={order.customer_email}>
                          {order.customer_email}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          {order.customer_phone}
                        </p>
                      </td>

                      {/* Items */}
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-0.5 max-w-[180px]">
                          {order.items.slice(0, 2).map((item, idx) => (
                            <div key={idx} className="text-[11px] text-foreground truncate">
                              <span className="font-bold">{item.quantity}×</span> {item.name}
                            </div>
                          ))}
                          {order.items.length > 2 && (
                            <span className="text-[10px] text-muted-foreground italic">
                              +{order.items.length - 2} more items
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Destination */}
                      <td className="py-4 px-4 align-top">
                        <div className="text-[11px] text-muted-foreground">
                          <p className="text-foreground font-medium">
                            {order.shipping_address.city || "N/A"}, {order.shipping_address.state || ""}
                          </p>
                          <p className="text-[10px] font-mono">PIN: {order.shipping_address.postal_code || "N/A"}</p>
                        </div>
                      </td>

                      {/* Total */}
                      <td className="py-4 px-4 align-top text-right font-black text-foreground text-xs whitespace-nowrap">
                        {formatINR(order.total_paise)}
                      </td>

                      {/* Payment State */}
                      <td className="py-4 px-4 align-top text-center whitespace-nowrap">
                        {order.payment_status === "paid" && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="size-3" /> Paid
                          </span>
                        )}
                        {order.payment_status === "pending" && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <Clock className="size-3" /> Pending
                          </span>
                        )}
                        {order.payment_status === "refunded" && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            <RotateCcw className="size-3" /> Refunded
                          </span>
                        )}
                        {order.payment_status === "failed" && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            <XCircle className="size-3" /> Failed
                          </span>
                        )}
                      </td>

                      {/* Delivery State */}
                      <td className="py-4 px-4 align-top text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium border capitalize ${
                            order.delivery_status === "delivered"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : order.delivery_status === "shipped"
                              ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20"
                              : order.delivery_status === "cancelled"
                              ? "bg-destructive/10 text-destructive border-destructive/20"
                              : "bg-muted text-foreground border-border"
                          }`}
                        >
                          {order.delivery_status}
                        </span>
                      </td>

                      {/* Distinct Refund State */}
                      <td className="py-4 px-4 align-top text-center whitespace-nowrap">
                        {order.refund_status === "pending" && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            <Clock className="size-3" /> Refund Pending
                          </span>
                        )}
                        {(order.refund_status === "processed" || (order.payment_status === "refunded" && order.refund_status !== "failed")) && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            <RotateCcw className="size-3" /> Refunded
                          </span>
                        )}
                        {order.refund_status === "failed" && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            <AlertTriangle className="size-3" /> Refund Failed
                          </span>
                        )}
                        {!order.refund_status && order.payment_status !== "refunded" && (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 align-top text-right whitespace-nowrap space-x-1.5">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className={`${buttonVariants({
                            variant: "ghost",
                            size: "sm",
                          })} h-7 px-2.5 text-[11px] font-mono`}
                        >
                          <span>Inspect</span>
                          <ExternalLink className="size-3 ml-1" />
                        </Link>

                        {(order.payment_status === "paid" || order.delivery_status === "delivered") && (
                          <a
                            href={`/api/admin/orders/${order.id}/invoice`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${buttonVariants({
                              variant: "outline",
                              size: "sm",
                            })} h-7 px-2 text-[11px] font-mono`}
                            title="Download Tax Invoice (PDF)"
                          >
                            <FileText className="size-3 text-primary" />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {filteredOrders.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border/60 bg-muted/20 text-xs font-mono text-muted-foreground">
            <div>
              Showing {startIndex + 1}–{Math.min(startIndex + pageSize, filteredOrders.length)} of {filteredOrders.length} orders
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="h-7 px-2 text-xs font-mono"
              >
                <ChevronLeft className="size-3.5 mr-1" />
                Previous
              </Button>

              <span className="px-3 text-xs font-bold text-foreground">
                Page {safePage} of {totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="h-7 px-2 text-xs font-mono"
              >
                Next
                <ChevronRight className="size-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
