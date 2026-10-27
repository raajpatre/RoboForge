/**
 * In-Memory Mock Store for Local Development & Unit/Integration Test Environments.
 *
 * When NEXT_PUBLIC_SUPABASE_URL contains "placeholder" (or during offline test execution),
 * this store provides stateful in-memory order, reservation, and immutable invoice persistence
 * without requiring an active PostgreSQL connection.
 */

import type { InvoiceSnapshot } from "@/types/domain";

export interface MockStoredOrder {
  id: string;
  order_code: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: Record<string, unknown>;
  subtotal_paise: number;
  tax_paise: number;
  shipping_paise: number;
  total_paise: number;
  currency: string;
  payment_status: "pending" | "paid" | "failed" | "refunded" | "partially_refunded";
  delivery_status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  items: Array<{
    productId: string;
    name: string;
    slug: string;
    sku?: string;
    hsn_code?: string;
    unitPricePaise: number;
    taxRateBps: number;
    quantity: number;
    totalPaise: number;
  }>;
  reservation_expires_at: number; // Epoch timestamp ms
  reservation_status: "reserved" | "consumed" | "released" | "expired";
  inventory_restored?: boolean;
  refund_status?: "pending" | "processed" | "failed";
  created_at: string;
  updated_at: string;
  notes?: string;
}

export interface MockStatusHistoryEntry {
  id: string;
  order_id: string;
  old_fulfillment_status?: string | null;
  new_fulfillment_status: string;
  actor?: string;
  notes?: string;
  created_at: string;
}

export interface MockStoredRefund {
  id: string;
  order_id: string;
  payment_id: string;
  razorpay_refund_id: string;
  amount_paise: number;
  reason: string;
  status: "pending" | "processed" | "failed";
  credit_note_number?: string;
  created_at: string;
}

const mockOrdersByCode = new Map<string, MockStoredOrder>();
const mockOrdersByRazorpayId = new Map<string, string>(); // razorpay_order_id -> order_code
const mockWebhookEvents = new Map<string, { status: string; processed_at?: string; error?: string }>();
const mockInvoicesByCode = new Map<string, InvoiceSnapshot>();
const mockInvoicesByOrderId = new Map<string, InvoiceSnapshot>();
const mockStatusHistory = new Map<string, MockStatusHistoryEntry[]>(); // order_id -> history
const mockRefunds = new Map<string, MockStoredRefund[]>(); // order_id -> refunds

let mockInvoiceSeq = 1;

export function issueMockInvoiceSerial(): string {
  const year = new Date().getFullYear();
  const seq = String(mockInvoiceSeq++).padStart(6, "0");
  return `INV-${year}-${seq}`;
}

export function saveMockOrder(order: MockStoredOrder): void {
  mockOrdersByCode.set(order.order_code, { ...order });
  if (order.razorpay_order_id) {
    mockOrdersByRazorpayId.set(order.razorpay_order_id, order.order_code);
  }

  // Ensure initial status history entry exists
  const history = mockStatusHistory.get(order.id) || [];
  if (history.length === 0) {
    history.push({
      id: `msh-init-${order.id}`,
      order_id: order.id,
      old_fulfillment_status: null,
      new_fulfillment_status: order.delivery_status,
      notes: "Order placed & initial fulfillment status recorded",
      created_at: order.created_at,
    });
    mockStatusHistory.set(order.id, history);
  }
}

export function recordMockStatusHistory(
  orderId: string,
  entry: Omit<MockStatusHistoryEntry, "id">
): void {
  const history = mockStatusHistory.get(orderId) || [];
  history.push({
    ...entry,
    id: `msh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  mockStatusHistory.set(orderId, history);
}

export function getMockStatusHistory(orderId: string): MockStatusHistoryEntry[] {
  return mockStatusHistory.get(orderId) || [];
}

export function getMockStatusHistoryByCode(orderCode: string): MockStatusHistoryEntry[] {
  const order = mockOrdersByCode.get(orderCode);
  if (!order) return [];
  return mockStatusHistory.get(order.id) || [];
}

export function getMockOrderById(orderId: string): MockStoredOrder | undefined {
  if (mockOrdersByCode.size === 0) {
    getAllMockOrders();
  }
  for (const order of mockOrdersByCode.values()) {
    if (order.id === orderId) return order;
  }
  return undefined;
}

export function getMockOrderByCode(orderCode: string): MockStoredOrder | undefined {
  if (mockOrdersByCode.size === 0) {
    getAllMockOrders();
  }
  return mockOrdersByCode.get(orderCode);
}

export function getMockOrderByRazorpayOrderId(rzpOrderId: string): MockStoredOrder | undefined {
  const code = mockOrdersByRazorpayId.get(rzpOrderId);
  return code ? mockOrdersByCode.get(code) : undefined;
}

export function updateMockOrder(
  orderCode: string,
  patch: Partial<MockStoredOrder>,
  actorNote?: { actor?: string; note?: string }
): MockStoredOrder | undefined {
  const existing = mockOrdersByCode.get(orderCode);
  if (!existing) return undefined;

  const updated = {
    ...existing,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  if (patch.delivery_status && patch.delivery_status !== existing.delivery_status) {
    const history = mockStatusHistory.get(existing.id) || [];
    history.push({
      id: `msh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      order_id: existing.id,
      old_fulfillment_status: existing.delivery_status,
      new_fulfillment_status: patch.delivery_status,
      actor: actorNote?.actor || "system",
      notes: actorNote?.note || `Fulfillment status updated to ${patch.delivery_status}`,
      created_at: new Date().toISOString(),
    });
    mockStatusHistory.set(existing.id, history);
  }

  mockOrdersByCode.set(orderCode, updated);
  if (updated.razorpay_order_id) {
    mockOrdersByRazorpayId.set(updated.razorpay_order_id, orderCode);
  }

  return updated;
}

export function expireMockReservation(orderCode: string): void {
  const order = mockOrdersByCode.get(orderCode);
  if (order) {
    order.reservation_expires_at = Date.now() - 1000;
    order.reservation_status = "expired";
  }
}

export function releaseMockReservation(orderCode: string): void {
  const order = mockOrdersByCode.get(orderCode);
  if (order && order.reservation_status === "reserved") {
    order.reservation_status = "released";
  }
}

export function recordMockWebhookEvent(eventId: string, status: string): void {
  mockWebhookEvents.set(eventId, {
    status,
    processed_at: new Date().toISOString(),
  });
}

export function getMockWebhookEvent(eventId: string): { status: string } | undefined {
  return mockWebhookEvents.get(eventId);
}

export function saveMockInvoice(invoice: InvoiceSnapshot, orderId?: string): void {
  mockInvoicesByCode.set(invoice.order_code, { ...invoice });
  if (orderId) {
    mockInvoicesByOrderId.set(orderId, { ...invoice });
  }
}

export function getMockInvoiceByOrderCode(orderCode: string): InvoiceSnapshot | undefined {
  return mockInvoicesByCode.get(orderCode);
}

export function getMockInvoiceByOrderId(orderId: string): InvoiceSnapshot | undefined {
  return mockInvoicesByOrderId.get(orderId);
}

export function saveMockRefund(refund: MockStoredRefund): void {
  const refunds = mockRefunds.get(refund.order_id) || [];
  refunds.push(refund);
  mockRefunds.set(refund.order_id, refunds);
}

export function getMockRefundsByOrderId(orderId: string): MockStoredRefund[] {
  return mockRefunds.get(orderId) || [];
}

export function getAllMockOrders(): MockStoredOrder[] {
  if (mockOrdersByCode.size === 0) {
    // Seed initial demo orders for dev/test preview
    const demoOrders: MockStoredOrder[] = [
      {
        id: "mock-order-01",
        order_code: "RBF-A1B2C3D4-E5F67890-12345678-90ABCDEF",
        customer_name: "Dr. Vikram Sarabhai",
        customer_email: "vikram@robotics-lab.org",
        customer_phone: "+919876543210",
        shipping_address: {
          line1: "Robotics Research Facility, ISRO Layout",
          city: "Bengaluru",
          state: "Karnataka",
          state_code: "29",
          postal_code: "560078",
          country: "India",
        },
        subtotal_paise: 18500000,
        tax_paise: 3330000,
        shipping_paise: 0,
        total_paise: 21830000,
        currency: "INR",
        payment_status: "paid",
        delivery_status: "processing",
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
        reservation_expires_at: Date.now() + 600000,
        reservation_status: "consumed",
        created_at: new Date(Date.now() - 3600000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "mock-order-02",
        order_code: "RBF-99887766-55443322-1100FFEE-DDAABB99",
        customer_name: "Prof. Priya Raman",
        customer_email: "priya.raman@iisc.ac.in",
        customer_phone: "+919812345678",
        shipping_address: {
          line1: "Dept of Automation, IISc Campus",
          city: "Bengaluru",
          state: "Karnataka",
          state_code: "29",
          postal_code: "560012",
          country: "India",
        },
        subtotal_paise: 6850000,
        tax_paise: 1233000,
        shipping_paise: 0,
        total_paise: 8083000,
        currency: "INR",
        payment_status: "paid",
        delivery_status: "shipped",
        items: [
          {
            productId: "prod-mock-lidar-002",
            sku: "RBF-LIDAR-02",
            name: "LiDAR Scan-360 Precision Module",
            slug: "lidar-scan-360-pro",
            unitPricePaise: 6850000,
            quantity: 1,
            taxRateBps: 1800,
            totalPaise: 8083000,
            hsn_code: "90151000",
          },
        ],
        reservation_expires_at: Date.now() + 600000,
        reservation_status: "consumed",
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "mock-order-03",
        order_code: "RBF-22334455-66778899-AABBCCDD-EEFF0011",
        customer_name: "Karan Mehta",
        customer_email: "karan@automaton-tech.io",
        customer_phone: "+919765432109",
        shipping_address: {
          line1: "Cyber Tech Park, Phase 1",
          city: "Pune",
          state: "Maharashtra",
          state_code: "27",
          postal_code: "411057",
          country: "India",
        },
        subtotal_paise: 2499900,
        tax_paise: 449982,
        shipping_paise: 0,
        total_paise: 2949882,
        currency: "INR",
        payment_status: "paid",
        delivery_status: "delivered",
        items: [
          {
            productId: "prod-mock-chassis-003",
            sku: "RBF-CHASSIS-03",
            name: "OmniDrive 4WD Heavy-Duty Robotics Base",
            slug: "omnidrive-4wd-mobile-base",
            unitPricePaise: 2499900,
            quantity: 1,
            taxRateBps: 1800,
            totalPaise: 2949882,
            hsn_code: "87082900",
          },
        ],
        reservation_expires_at: Date.now() + 600000,
        reservation_status: "consumed",
        created_at: new Date(Date.now() - 172800000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "mock-order-04",
        order_code: "RBF-44556677-88990011-22334455-66778899",
        customer_name: "Ananya Iyer",
        customer_email: "ananya@deepbotics.ai",
        customer_phone: "+919833445566",
        shipping_address: {
          line1: "Innovation Hub, Guindy",
          city: "Chennai",
          state: "Tamil Nadu",
          state_code: "33",
          postal_code: "600032",
          country: "India",
        },
        subtotal_paise: 3200000,
        tax_paise: 576000,
        shipping_paise: 0,
        total_paise: 3776000,
        currency: "INR",
        payment_status: "pending",
        delivery_status: "pending",
        items: [
          {
            productId: "prod-mock-gripper-004",
            sku: "RBF-GRIP-04",
            name: "Parallel Servo Gripper Kit",
            slug: "parallel-servo-gripper-kit",
            unitPricePaise: 3200000,
            quantity: 1,
            taxRateBps: 1800,
            totalPaise: 3776000,
            hsn_code: "84799090",
          },
        ],
        reservation_expires_at: Date.now() + 600000,
        reservation_status: "reserved",
        created_at: new Date(Date.now() - 259200000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "mock-order-05",
        order_code: "RBF-55667788-99001122-33445566-77889900",
        customer_name: "Rahul Verma",
        customer_email: "rahul@vermatech.in",
        customer_phone: "+919844556677",
        shipping_address: {
          line1: "Okhla Industrial Area Phase 3",
          city: "New Delhi",
          state: "Delhi",
          state_code: "07",
          postal_code: "110020",
          country: "India",
        },
        subtotal_paise: 1150000,
        tax_paise: 207000,
        shipping_paise: 0,
        total_paise: 1357000,
        currency: "INR",
        payment_status: "refunded",
        delivery_status: "cancelled",
        items: [
          {
            productId: "prod-mock-controller-005",
            sku: "RBF-CTRL-05",
            name: "Industrial Core Motion Controller MCU",
            slug: "motion-controller-mcu",
            unitPricePaise: 1150000,
            quantity: 1,
            taxRateBps: 1800,
            totalPaise: 1357000,
            hsn_code: "85371000",
          },
        ],
        reservation_expires_at: Date.now() + 600000,
        reservation_status: "released",
        created_at: new Date(Date.now() - 345600000).toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    for (const order of demoOrders) {
      saveMockOrder(order);
    }
  }

  return Array.from(mockOrdersByCode.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function resetMockStore(): void {
  mockOrdersByCode.clear();
  mockOrdersByRazorpayId.clear();
  mockWebhookEvents.clear();
  mockInvoicesByCode.clear();
  mockInvoicesByOrderId.clear();
  mockStatusHistory.clear();
  mockRefunds.clear();
  mockInvoiceSeq = 1;
}
