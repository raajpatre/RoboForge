export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "refunded"
  | "partially_refunded";

export type DeliveryStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type StockReservationStatus = "reserved" | "consumed" | "released";

export type WebhookStatus = "pending" | "processed" | "ignored" | "failed";

export type RefundStatus = "pending" | "processed" | "failed";

export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
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
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string;
          price_paise: number;
          image_url?: string;
          hsn_code?: string;
          tax_rate_bps?: number;
          is_active?: boolean;
          sku?: string;
          category?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string;
          price_paise?: number;
          image_url?: string;
          hsn_code?: string;
          tax_rate_bps?: number;
          is_active?: boolean;
          sku?: string;
          category?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inventory: {
        Row: {
          product_id: string;
          stock_on_hand: number;
          stock_reserved: number;
          updated_at: string;
        };
        Insert: {
          product_id: string;
          stock_on_hand?: number;
          stock_reserved?: number;
          updated_at?: string;
        };
        Update: {
          product_id?: string;
          stock_on_hand?: number;
          stock_reserved?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: true;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      orders: {
        Row: {
          id: string;
          order_code: string;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          shipping_address: Json;
          subtotal_paise: number;
          tax_paise: number;
          shipping_paise: number;
          total_paise: number;
          currency: string;
          payment_status: PaymentStatus;
          delivery_status: DeliveryStatus;
          order_number?: string;
          fulfillment_status?: string;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_code: string;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          shipping_address: Json;
          subtotal_paise: number;
          tax_paise?: number;
          shipping_paise?: number;
          total_paise: number;
          currency?: string;
          payment_status?: PaymentStatus;
          delivery_status?: DeliveryStatus;
          order_number?: string;
          fulfillment_status?: string;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_code?: string;
          customer_name?: string;
          customer_email?: string;
          customer_phone?: string;
          shipping_address?: Json;
          subtotal_paise?: number;
          tax_paise?: number;
          shipping_paise?: number;
          total_paise?: number;
          currency?: string;
          payment_status?: PaymentStatus;
          delivery_status?: DeliveryStatus;
          order_number?: string;
          fulfillment_status?: string;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          product_name_snapshot: string;
          product_slug_snapshot: string;
          unit_price_paise_snapshot: number;
          tax_rate_bps_snapshot: number;
          quantity: number;
          total_paise_snapshot: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          product_name_snapshot: string;
          product_slug_snapshot: string;
          unit_price_paise_snapshot: number;
          tax_rate_bps_snapshot?: number;
          quantity: number;
          total_paise_snapshot: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          product_name_snapshot?: string;
          product_slug_snapshot?: string;
          unit_price_paise_snapshot?: number;
          tax_rate_bps_snapshot?: number;
          quantity?: number;
          total_paise_snapshot?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      stock_reservations: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          quantity: number;
          status: StockReservationStatus;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          quantity: number;
          status?: StockReservationStatus;
          expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          quantity?: number;
          status?: StockReservationStatus;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_reservations_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_reservations_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      payments: {
        Row: {
          id: string;
          order_id: string;
          razorpay_order_id: string;
          razorpay_payment_id: string;
          amount_paise: number;
          currency: string;
          status: "captured" | "failed" | "refunded" | "authorized";
          method: string | null;
          signature: string | null;
          error_code: string | null;
          error_description: string | null;
          raw_payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          razorpay_order_id: string;
          razorpay_payment_id: string;
          amount_paise: number;
          currency?: string;
          status: "captured" | "failed" | "refunded" | "authorized";
          method?: string | null;
          signature?: string | null;
          error_code?: string | null;
          error_description?: string | null;
          raw_payload?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          razorpay_order_id?: string;
          razorpay_payment_id?: string;
          amount_paise?: number;
          currency?: string;
          status?: "captured" | "failed" | "refunded" | "authorized";
          method?: string | null;
          signature?: string | null;
          error_code?: string | null;
          error_description?: string | null;
          raw_payload?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
      webhook_events: {
        Row: {
          id: string;
          event_id: string;
          event_type: string;
          payload: Json;
          status: WebhookStatus;
          error_message: string | null;
          processed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          event_type: string;
          payload: Json;
          status?: WebhookStatus;
          error_message?: string | null;
          processed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          event_type?: string;
          payload?: Json;
          status?: WebhookStatus;
          error_message?: string | null;
          processed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          order_id: string;
          invoice_number: string;
          issue_date: string;
          seller_snapshot: Json;
          buyer_snapshot: Json;
          items_snapshot: Json;
          subtotal_paise: number;
          tax_paise: number;
          shipping_paise: number;
          total_paise: number;
          currency: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          invoice_number: string;
          issue_date?: string;
          seller_snapshot: Json;
          buyer_snapshot: Json;
          items_snapshot: Json;
          subtotal_paise: number;
          tax_paise: number;
          shipping_paise: number;
          total_paise: number;
          currency?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          invoice_number?: string;
          issue_date?: string;
          seller_snapshot?: Json;
          buyer_snapshot?: Json;
          items_snapshot?: Json;
          subtotal_paise?: number;
          tax_paise?: number;
          shipping_paise?: number;
          total_paise?: number;
          currency?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
      refunds: {
        Row: {
          id: string;
          order_id: string;
          payment_id: string;
          razorpay_refund_id: string;
          amount_paise: number;
          reason: string;
          status: RefundStatus;
          credit_note_number: string | null;
          raw_payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          payment_id: string;
          razorpay_refund_id: string;
          amount_paise: number;
          reason?: string;
          status?: RefundStatus;
          credit_note_number?: string | null;
          raw_payload?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          payment_id?: string;
          razorpay_refund_id?: string;
          amount_paise?: number;
          reason?: string;
          status?: RefundStatus;
          credit_note_number?: string | null;
          raw_payload?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          }
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string;
          actor_email: string;
          action: string;
          target_type: string;
          target_id: string;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id: string;
          actor_email: string;
          action: string;
          target_type: string;
          target_id: string;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string;
          actor_email?: string;
          action?: string;
          target_type?: string;
          target_id?: string;
          details?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      order_status_history: {
        Row: {
          id: string;
          order_id: string;
          old_fulfillment_status: string | null;
          new_fulfillment_status: string;
          old_payment_status: string | null;
          new_payment_status: string | null;
          actor: string;
          note: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          old_fulfillment_status?: string | null;
          new_fulfillment_status: string;
          old_payment_status?: string | null;
          new_payment_status?: string | null;
          actor: string;
          note?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          old_fulfillment_status?: string | null;
          new_fulfillment_status?: string;
          old_payment_status?: string | null;
          new_payment_status?: string | null;
          actor?: string;
          note?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
      store_settings: {
        Row: {
          id: string;
          key: string;
          seller_legal_name: string | null;
          seller_trade_name: string | null;
          seller_gstin: string | null;
          seller_pan: string | null;
          seller_phone: string | null;
          seller_email: string | null;
          seller_address: Json | null;
          is_tax_configured: boolean;
          tax_status: "not_configured" | "configured" | "exempt";
          tax_configuration: Json;
          shipping_configuration: Json;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          seller_legal_name?: string | null;
          seller_trade_name?: string | null;
          seller_gstin?: string | null;
          seller_pan?: string | null;
          seller_phone?: string | null;
          seller_email?: string | null;
          seller_address?: Json | null;
          is_tax_configured?: boolean;
          tax_status?: "not_configured" | "configured" | "exempt";
          tax_configuration?: Json;
          shipping_configuration?: Json;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          seller_legal_name?: string | null;
          seller_trade_name?: string | null;
          seller_gstin?: string | null;
          seller_pan?: string | null;
          seller_phone?: string | null;
          seller_email?: string | null;
          seller_address?: Json | null;
          is_tax_configured?: boolean;
          tax_status?: "not_configured" | "configured" | "exempt";
          tax_configuration?: Json;
          shipping_configuration?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      inventory_audit_logs: {
        Row: {
          id: string;
          product_id: string;
          order_id: string | null;
          change_type: "reservation" | "consumption" | "release" | "restock" | "manual_adjustment";
          quantity_delta: number;
          stock_on_hand_before: number;
          stock_on_hand_after: number;
          stock_reserved_before: number;
          stock_reserved_after: number;
          actor: string;
          note: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          order_id?: string | null;
          change_type: "reservation" | "consumption" | "release" | "restock" | "manual_adjustment";
          quantity_delta: number;
          stock_on_hand_before: number;
          stock_on_hand_after: number;
          stock_reserved_before: number;
          stock_reserved_after: number;
          actor?: string;
          note?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          order_id?: string | null;
          change_type?: "reservation" | "consumption" | "release" | "restock" | "manual_adjustment";
          quantity_delta?: number;
          stock_on_hand_before?: number;
          stock_on_hand_after?: number;
          stock_reserved_before?: number;
          stock_reserved_after?: number;
          actor?: string;
          note?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_audit_logs_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      products_catalog: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string;
          price_paise: number;
          image_url: string;
          hsn_code: string;
          tax_rate_bps: number;
          is_active: boolean;
          metadata: Json;
          in_stock: boolean;
          available_quantity: number;
        };
        Relationships: [];
      };
      payment_events: {
        Row: {
          id: string;
          event_id: string;
          event_type: string;
          payload: Json;
          status: WebhookStatus;
          error_message: string | null;
          processed_at: string | null;
          created_at: string;
        };
        Relationships: [];
      };
      inventory_reservations: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          quantity: number;
          status: StockReservationStatus;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      reserve_stock_for_order: {
        Args: {
          p_order_id: string;
          p_items: Json;
          p_ttl_minutes?: number;
        };
        Returns: boolean;
      };
      consume_stock_for_order: {
        Args: {
          p_order_id: string;
        };
        Returns: boolean;
      };
      release_stock_for_order: {
        Args: {
          p_order_id: string;
        };
        Returns: boolean;
      };
      cleanup_expired_reservations: {
        Args: Record<string, never>;
        Returns: number;
      };
      get_public_order_tracking: {
        Args: {
          p_order_code: string;
        };
        Returns: Json;
      };
      issue_invoice_serial: {
        Args: {
          p_order_id: string;
        };
        Returns: string;
      };
      confirm_order_payment: {
        Args: {
          p_order_id: string;
          p_razorpay_order_id: string;
          p_razorpay_payment_id: string;
          p_amount_paise: number;
          p_signature?: string;
          p_method?: string;
          p_payload?: Json;
        };
        Returns: Json;
      };
      record_order_status_transition: {
        Args: {
          p_order_id: string;
          p_new_fulfillment: string;
          p_actor: string;
          p_note?: string;
        };
        Returns: boolean;
      };
    };
  };
}
