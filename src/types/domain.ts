import type {
  PaymentStatus,
  DeliveryStatus,
  StockReservationStatus,
  WebhookStatus,
  RefundStatus,
} from "./database";

export type {
  PaymentStatus,
  DeliveryStatus,
  StockReservationStatus,
  WebhookStatus,
  RefundStatus,
};

export interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  state_code?: string;
  postal_code: string;
  country: string;
}

export interface ProductCatalogItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_paise: number;
  image_url: string;
  hsn_code: string;
  tax_rate_bps: number;
  is_active: boolean;
  sku?: string;
  category?: string;
  metadata: Record<string, unknown>;
  in_stock: boolean;
  available_quantity: number;
}

export interface CartItem {
  productId: string;
  slug: string;
  name: string;
  pricePaise: number;
  imageUrl: string;
  quantity: number;
  availableQuantity: number;
}

export interface CheckoutCustomerInput {
  name: string;
  email: string;
  phone: string;
  shippingAddress: ShippingAddress;
}

export interface PublicStatusHistoryEntry {
  status: DeliveryStatus;
  timestamp: string;
  notes?: string;
}

export interface PublicOrderTrackingResult {
  order_code: string;
  created_at: string;
  payment_status: PaymentStatus;
  delivery_status: DeliveryStatus;
  total_paise: number;
  currency: string;
  status_history: PublicStatusHistoryEntry[];
  items: Array<{
    product_name: string;
    quantity: number;
  }>;
}

export interface SellerSnapshot {
  legal_name: string;
  trade_name: string;
  gstin: string;
  pan: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  state_code: string;
  postal_code: string;
  country: string;
}

export interface BuyerSnapshot {
  name: string;
  email: string;
  phone: string;
  shipping_address: ShippingAddress;
}

export interface InvoiceItemSnapshot {
  product_name: string;
  sku?: string;
  hsn_code: string;
  unit_price_paise: number;
  tax_rate_bps: number;
  quantity: number;
  taxable_amount_paise: number;
  tax_amount_paise: number;
  total_paise: number;
}

export interface InvoiceSnapshot {
  invoice_number: string;
  issue_date: string;
  order_code: string;
  seller: SellerSnapshot;
  buyer: BuyerSnapshot;
  items: InvoiceItemSnapshot[];
  subtotal_paise: number;
  tax_paise: number;
  shipping_paise: number;
  discount_paise?: number;
  total_paise: number;
  currency: string;
  is_gst_invoice?: boolean;
}

export interface CreditNoteSnapshot {
  credit_note_number: string;
  original_invoice_number: string;
  issue_date: string;
  order_code: string;
  seller: SellerSnapshot;
  buyer: BuyerSnapshot;
  refund_amount_paise: number;
  tax_adjustment_paise?: number;
  reason: string;
  currency: string;
  is_gst_document?: boolean;
}

