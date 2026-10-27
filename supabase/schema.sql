-- ==============================================================================
-- RoboShop-Forge Initial Database Schema Migration
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. Products Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_paise BIGINT NOT NULL CHECK (price_paise >= 0),
    image_url TEXT NOT NULL DEFAULT '',
    hsn_code TEXT NOT NULL DEFAULT '84795000', -- HSN for industrial robots / automation equipment
    tax_rate_bps INTEGER NOT NULL DEFAULT 1800 CHECK (tax_rate_bps >= 0 AND tax_rate_bps <= 10000), -- 18% standard GST
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active);

-- ------------------------------------------------------------------------------
-- 2. Inventory Table (1-to-1 with products)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory (
    product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
    stock_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (stock_on_hand >= 0),
    stock_reserved INTEGER NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_stock_integrity CHECK (stock_reserved <= stock_on_hand)
);

-- ------------------------------------------------------------------------------
-- 3. Orders Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_code TEXT NOT NULL UNIQUE, -- >= 128-bit unpredictable cryptographically secure string
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    shipping_address JSONB NOT NULL,
    subtotal_paise BIGINT NOT NULL CHECK (subtotal_paise >= 0),
    tax_paise BIGINT NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
    shipping_paise BIGINT NOT NULL DEFAULT 0 CHECK (shipping_paise >= 0),
    total_paise BIGINT NOT NULL CHECK (total_paise >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'partially_refunded')),
    delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_orders_order_code ON public.orders(order_code);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON public.orders(delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order_id ON public.orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- ------------------------------------------------------------------------------
-- 4. Order Items Table (Immutable historical snapshots)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    product_name_snapshot TEXT NOT NULL,
    product_slug_snapshot TEXT NOT NULL,
    unit_price_paise_snapshot BIGINT NOT NULL CHECK (unit_price_paise_snapshot >= 0),
    tax_rate_bps_snapshot INTEGER NOT NULL DEFAULT 1800 CHECK (tax_rate_bps_snapshot >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_paise_snapshot BIGINT NOT NULL CHECK (total_paise_snapshot >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- ------------------------------------------------------------------------------
-- 5. Stock Reservations Table (Transactional Stock Locking)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'consumed', 'released')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_order_id ON public.stock_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_status_expires ON public.stock_reservations(status, expires_at);

-- ------------------------------------------------------------------------------
-- 6. Payments Table (Razorpay Transactions)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    razorpay_order_id TEXT NOT NULL,
    razorpay_payment_id TEXT NOT NULL UNIQUE,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL CHECK (status IN ('captured', 'failed', 'refunded', 'authorized')),
    method TEXT,
    signature TEXT,
    error_code TEXT,
    error_description TEXT,
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment_id ON public.payments(razorpay_payment_id);

-- ------------------------------------------------------------------------------
-- 7. Webhook Events Table (Idempotent Event Processing)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'ignored', 'failed')),
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON public.webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON public.webhook_events(status);

-- ------------------------------------------------------------------------------
-- 8. Invoices Table (Immutable Accounting Records - ZERO PDF Bytes in DB)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
    invoice_number TEXT NOT NULL UNIQUE,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    seller_snapshot JSONB NOT NULL,
    buyer_snapshot JSONB NOT NULL,
    items_snapshot JSONB NOT NULL,
    subtotal_paise BIGINT NOT NULL CHECK (subtotal_paise >= 0),
    tax_paise BIGINT NOT NULL CHECK (tax_paise >= 0),
    shipping_paise BIGINT NOT NULL CHECK (shipping_paise >= 0),
    total_paise BIGINT NOT NULL CHECK (total_paise >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON public.invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);

-- ------------------------------------------------------------------------------
-- 9. Refunds Table (Authorized & Audited Adjustments)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
    razorpay_refund_id TEXT NOT NULL UNIQUE,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
    credit_note_number TEXT UNIQUE,
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON public.refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_razorpay_refund_id ON public.refunds(razorpay_refund_id);

-- ------------------------------------------------------------------------------
-- 10. Audit Logs Table (Admin & Sensitive Mutations Trail)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ------------------------------------------------------------------------------
-- Stored Procedures: Atomic Inventory Operations
-- ------------------------------------------------------------------------------

-- Reserve stock transactionally with TTL
CREATE OR REPLACE FUNCTION public.reserve_stock_for_order(
    p_order_id UUID,
    p_items JSONB,
    p_ttl_minutes INTEGER DEFAULT 15
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_on_hand INTEGER;
    v_reserved INTEGER;
    v_expires_at TIMESTAMPTZ;
BEGIN
    v_expires_at := timezone('utc'::text, now()) + (p_ttl_minutes || ' minutes')::interval;

    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (item->>'product_id')::UUID;
        v_quantity := (item->>'quantity')::INTEGER;

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'Invalid reservation quantity: %', v_quantity;
        END IF;

        -- Pessimistic lock row for atomic check
        SELECT stock_on_hand, stock_reserved
        INTO v_on_hand, v_reserved
        FROM public.inventory
        WHERE product_id = v_product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Inventory record not found for product %', v_product_id;
        END IF;

        IF (v_on_hand - v_reserved) < v_quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %',
                v_product_id, (v_on_hand - v_reserved), v_quantity;
        END IF;

        -- Update reserved count
        UPDATE public.inventory
        SET stock_reserved = stock_reserved + v_quantity,
            updated_at = timezone('utc'::text, now())
        WHERE product_id = v_product_id;

        -- Insert reservation record
        INSERT INTO public.stock_reservations (
            order_id,
            product_id,
            quantity,
            status,
            expires_at
        ) VALUES (
            p_order_id,
            v_product_id,
            v_quantity,
            'reserved',
            v_expires_at
        );
    END LOOP;

    RETURN TRUE;
END;
$$;

-- Consume stock permanently upon confirmed payment
CREATE OR REPLACE FUNCTION public.consume_stock_for_order(
    p_order_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    res RECORD;
BEGIN
    FOR res IN
        SELECT id, product_id, quantity
        FROM public.stock_reservations
        WHERE order_id = p_order_id AND status = 'reserved'
        FOR UPDATE
    LOOP
        UPDATE public.inventory
        SET stock_on_hand = stock_on_hand - res.quantity,
            stock_reserved = stock_reserved - res.quantity,
            updated_at = timezone('utc'::text, now())
        WHERE product_id = res.product_id;

        UPDATE public.stock_reservations
        SET status = 'consumed',
            updated_at = timezone('utc'::text, now())
        WHERE id = res.id;
    END LOOP;

    RETURN TRUE;
END;
$$;

-- Release stock upon cancellation, payment failure, or checkout abandonment
CREATE OR REPLACE FUNCTION public.release_stock_for_order(
    p_order_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    res RECORD;
BEGIN
    FOR res IN
        SELECT id, product_id, quantity
        FROM public.stock_reservations
        WHERE order_id = p_order_id AND status = 'reserved'
        FOR UPDATE
    LOOP
        UPDATE public.inventory
        SET stock_reserved = stock_reserved - res.quantity,
            updated_at = timezone('utc'::text, now())
        WHERE product_id = res.product_id;

        UPDATE public.stock_reservations
        SET status = 'released',
            updated_at = timezone('utc'::text, now())
        WHERE id = res.id;
    END LOOP;

    RETURN TRUE;
END;
$$;

-- Release expired reservations (safe background cleanup task)
CREATE OR REPLACE FUNCTION public.cleanup_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    res RECORD;
    v_released_count INTEGER := 0;
BEGIN
    FOR res IN
        SELECT id, product_id, quantity
        FROM public.stock_reservations
        WHERE status = 'reserved'
          AND expires_at < timezone('utc'::text, now())
        FOR UPDATE
    LOOP
        UPDATE public.inventory
        SET stock_reserved = GREATEST(0, stock_reserved - res.quantity),
            updated_at = timezone('utc'::text, now())
        WHERE product_id = res.product_id;

        UPDATE public.stock_reservations
        SET status = 'released',
            updated_at = timezone('utc'::text, now())
        WHERE id = res.id;

        v_released_count := v_released_count + 1;
    END LOOP;

    RETURN v_released_count;
END;
$$;

-- ------------------------------------------------------------------------------
-- Public Views
-- ------------------------------------------------------------------------------

-- Public catalog view with computed stock status (safe: hides exact warehouse stock)
CREATE OR REPLACE VIEW public.products_catalog AS
SELECT 
    p.id,
    p.slug,
    p.name,
    p.description,
    p.price_paise,
    p.image_url,
    p.hsn_code,
    p.tax_rate_bps,
    p.is_active,
    p.metadata,
    COALESCE(i.stock_on_hand - i.stock_reserved, 0) > 0 AS in_stock,
    GREATEST(0, COALESCE(i.stock_on_hand - i.stock_reserved, 0)) AS available_quantity
FROM public.products p
LEFT JOIN public.inventory i ON p.id = i.product_id
WHERE p.is_active = true;

-- ------------------------------------------------------------------------------
-- Zero-PII Public Order Tracking RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_order_tracking(
    p_order_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_items JSONB;
BEGIN
    SELECT id, order_code, payment_status, delivery_status, created_at, total_paise, currency
    INTO v_order
    FROM public.orders
    WHERE order_code = p_order_code;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'product_name', product_name_snapshot,
            'quantity', quantity
        )
    )
    INTO v_items
    FROM public.order_items
    WHERE order_id = v_order.id;

    -- Return strictly minimal zero-PII data structure:
    -- NO customer name, NO email, NO phone, NO street address!
    RETURN jsonb_build_object(
        'order_code', v_order.order_code,
        'created_at', v_order.created_at,
        'payment_status', v_order.payment_status,
        'delivery_status', v_order.delivery_status,
        'total_paise', v_order.total_paise,
        'currency', v_order.currency,
        'items', COALESCE(v_items, '[]'::jsonb)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Row Level Security (RLS) Configuration
-- ------------------------------------------------------------------------------

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Products: Public can read active products only
CREATE POLICY "Public can view active products"
    ON public.products
    FOR SELECT
    USING (is_active = true);

-- Products: Authenticated admin users can perform full CRUD
CREATE POLICY "Admins have full access to products"
    ON public.products
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Inventory: Authenticated admin users can view and update
CREATE POLICY "Admins have full access to inventory"
    ON public.inventory
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Orders: Authenticated admin users can view and update
CREATE POLICY "Admins have full access to orders"
    ON public.orders
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Order Items: Authenticated admin users have full access
CREATE POLICY "Admins have full access to order items"
    ON public.order_items
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Stock Reservations: Authenticated admin users have full access
CREATE POLICY "Admins have full access to stock reservations"
    ON public.stock_reservations
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Payments: Authenticated admin users have full access
CREATE POLICY "Admins have full access to payments"
    ON public.payments
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Webhook Events: Authenticated admin users have full access
CREATE POLICY "Admins have full access to webhook events"
    ON public.webhook_events
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Invoices: Authenticated admin users have full access
CREATE POLICY "Admins have full access to invoices"
    ON public.invoices
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Refunds: Authenticated admin users have full access
CREATE POLICY "Admins have full access to refunds"
    ON public.refunds
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Audit Logs: Authenticated admin users have read access
CREATE POLICY "Admins can view audit logs"
    ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (true);

-- Note: All privileged public mutations (customer checkout, webhook handling, stock reservation)
-- are executed via server-side Next.js route handlers using the Supabase Service Role key,
-- which securely bypasses RLS while keeping secret keys completely isolated from the browser.
-- ==============================================================================
-- RoboShop-Forge Phase 2 Schema Enhancements & Access Control
-- ==============================================================================
-- Enhancements for:
-- 1. Products SKU and Category columns
-- 2. Orders order_number & fulfillment_status compatibility columns
-- 3. Dedicated order_status_history table
-- 4. store_settings table with explicit unconfigured tax state
-- 5. inventory_audit_logs table
-- 6. Sequential invoice number sequence and idempotent issuance RPC
-- 7. Atomic & idempotent order payment confirmation RPC
-- 8. Idempotent inventory consumption & release guarantees
-- 9. Row Level Security policies & least-privilege role permissions
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Products: Add SKU and Category
-- ------------------------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'robotics';

-- Backfill SKU for any existing rows if empty
UPDATE public.products 
SET sku = UPPER(REPLACE(slug, '-', '_'))
WHERE sku IS NULL OR sku = '';

ALTER TABLE public.products ALTER COLUMN sku SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);

-- ------------------------------------------------------------------------------
-- 2. Orders: Order Number & Fulfillment Status Compatibility
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number TEXT;
UPDATE public.orders SET order_number = order_code WHERE order_number IS NULL;
ALTER TABLE public.orders ALTER COLUMN order_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);

-- ------------------------------------------------------------------------------
-- 3. Order Status History Table (Audit of payment & delivery state transitions)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    old_fulfillment_status TEXT,
    new_fulfillment_status TEXT NOT NULL,
    old_payment_status TEXT,
    new_payment_status TEXT,
    actor TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON public.order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_created_at ON public.order_status_history(created_at DESC);

-- ------------------------------------------------------------------------------
-- 4. Store Settings Table (Verified Seller Identity & Tax Configuration)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    seller_legal_name TEXT,
    seller_trade_name TEXT,
    seller_gstin TEXT,
    seller_pan TEXT,
    seller_phone TEXT,
    seller_email TEXT,
    seller_address JSONB,
    is_tax_configured BOOLEAN NOT NULL DEFAULT false, -- Explicit: unconfigured tax state must be explicit!
    tax_status TEXT NOT NULL DEFAULT 'not_configured' CHECK (tax_status IN ('not_configured', 'configured', 'exempt')),
    tax_configuration JSONB NOT NULL DEFAULT '{"status": "not_configured", "standard_rate_bps": 1800}'::jsonb,
    shipping_configuration JSONB NOT NULL DEFAULT '{"standard_shipping_paise": 0}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Seed default explicit not-configured settings row if none exists
INSERT INTO public.store_settings (
    key,
    seller_legal_name,
    seller_trade_name,
    seller_gstin,
    seller_pan,
    seller_phone,
    seller_email,
    seller_address,
    is_tax_configured,
    tax_status,
    tax_configuration
) VALUES (
    'default',
    NULL,
    'RoboShop Forge',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    false,
    'not_configured',
    '{"status": "not_configured", "standard_rate_bps": 1800}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 5. Inventory Audit Logs Table (Tracks stock adjustments & reservations)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    change_type TEXT NOT NULL CHECK (change_type IN ('reservation', 'consumption', 'release', 'restock', 'manual_adjustment')),
    quantity_delta INTEGER NOT NULL,
    stock_on_hand_before INTEGER NOT NULL CHECK (stock_on_hand_before >= 0),
    stock_on_hand_after INTEGER NOT NULL CHECK (stock_on_hand_after >= 0),
    stock_reserved_before INTEGER NOT NULL CHECK (stock_reserved_before >= 0),
    stock_reserved_after INTEGER NOT NULL CHECK (stock_reserved_after >= 0),
    actor TEXT NOT NULL DEFAULT 'system',
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_inventory_audit_logs_product ON public.inventory_audit_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_logs_order ON public.inventory_audit_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_logs_created ON public.inventory_audit_logs(created_at DESC);

-- ------------------------------------------------------------------------------
-- 6. Aliases & Compatibility Views
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.inventory_reservations AS
SELECT * FROM public.stock_reservations;

CREATE OR REPLACE VIEW public.payment_events AS
SELECT 
    id,
    event_id,
    event_type,
    payload,
    status,
    error_message,
    processed_at,
    created_at
FROM public.webhook_events;

-- ------------------------------------------------------------------------------
-- 7. Sequence for Sequential Invoice Numbers
-- ------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.invoice_serial_seq START WITH 1001;

-- ------------------------------------------------------------------------------
-- 8. Idempotent Invoice Number Issuance RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_invoice_serial(
    p_order_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_existing_invoice TEXT;
    v_seq_val BIGINT;
    v_year TEXT;
    v_new_invoice_number TEXT;
BEGIN
    -- Idempotency check: if an invoice already exists for this order, return existing number immediately
    SELECT invoice_number INTO v_existing_invoice
    FROM public.invoices
    WHERE order_id = p_order_id;

    IF v_existing_invoice IS NOT NULL THEN
        RETURN v_existing_invoice;
    END IF;

    -- Generate next unique serial in format INV-YYYY-XXXXXX
    v_seq_val := nextval('public.invoice_serial_seq');
    v_year := to_char(timezone('utc'::text, now()), 'YYYY');
    v_new_invoice_number := 'INV-' || v_year || '-' || lpad(v_seq_val::text, 6, '0');

    RETURN v_new_invoice_number;
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. Hardened Atomic Inventory Functions with Idempotency & Audit Logging
-- ------------------------------------------------------------------------------

-- Reserve stock transactionally with TTL and pessimistic locking
CREATE OR REPLACE FUNCTION public.reserve_stock_for_order(
    p_order_id UUID,
    p_items JSONB,
    p_ttl_minutes INTEGER DEFAULT 15
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_on_hand INTEGER;
    v_reserved INTEGER;
    v_expires_at TIMESTAMPTZ;
BEGIN
    v_expires_at := timezone('utc'::text, now()) + (p_ttl_minutes || ' minutes')::interval;

    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (item->>'product_id')::UUID;
        v_quantity := (item->>'quantity')::INTEGER;

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'Invalid reservation quantity: %. Must be positive integer.', v_quantity;
        END IF;

        -- Pessimistic lock row to prevent race conditions during concurrent checkouts
        SELECT stock_on_hand, stock_reserved
        INTO v_on_hand, v_reserved
        FROM public.inventory
        WHERE product_id = v_product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Inventory record not found for product %', v_product_id;
        END IF;

        IF (v_on_hand - v_reserved) < v_quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %',
                v_product_id, (v_on_hand - v_reserved), v_quantity;
        END IF;

        -- Increment reserved count
        UPDATE public.inventory
        SET stock_reserved = stock_reserved + v_quantity,
            updated_at = timezone('utc'::text, now())
        WHERE product_id = v_product_id;

        -- Insert reservation record
        INSERT INTO public.stock_reservations (
            order_id,
            product_id,
            quantity,
            status,
            expires_at
        ) VALUES (
            p_order_id,
            v_product_id,
            v_quantity,
            'reserved',
            v_expires_at
        );

        -- Audit log entry
        INSERT INTO public.inventory_audit_logs (
            product_id,
            order_id,
            change_type,
            quantity_delta,
            stock_on_hand_before,
            stock_on_hand_after,
            stock_reserved_before,
            stock_reserved_after,
            actor,
            note
        ) VALUES (
            v_product_id,
            p_order_id,
            'reservation',
            v_quantity,
            v_on_hand,
            v_on_hand,
            v_reserved,
            v_reserved + v_quantity,
            'system:checkout',
            'Stock locked with ' || p_ttl_minutes || ' min TTL'
        );
    END LOOP;

    RETURN TRUE;
END;
$$;

-- Consume stock permanently upon confirmed payment (IDEMPOTENT)
CREATE OR REPLACE FUNCTION public.consume_stock_for_order(
    p_order_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    res RECORD;
    v_on_hand INTEGER;
    v_reserved INTEGER;
BEGIN
    -- Idempotent check: only process reservations in 'reserved' state
    FOR res IN
        SELECT id, product_id, quantity
        FROM public.stock_reservations
        WHERE order_id = p_order_id AND status = 'reserved'
        FOR UPDATE
    LOOP
        SELECT stock_on_hand, stock_reserved
        INTO v_on_hand, v_reserved
        FROM public.inventory
        WHERE product_id = res.product_id
        FOR UPDATE;

        -- Deduct from both on_hand and reserved
        UPDATE public.inventory
        SET stock_on_hand = GREATEST(0, stock_on_hand - res.quantity),
            stock_reserved = GREATEST(0, stock_reserved - res.quantity),
            updated_at = timezone('utc'::text, now())
        WHERE product_id = res.product_id;

        UPDATE public.stock_reservations
        SET status = 'consumed',
            updated_at = timezone('utc'::text, now())
        WHERE id = res.id;

        -- Audit log entry
        INSERT INTO public.inventory_audit_logs (
            product_id,
            order_id,
            change_type,
            quantity_delta,
            stock_on_hand_before,
            stock_on_hand_after,
            stock_reserved_before,
            stock_reserved_after,
            actor,
            note
        ) VALUES (
            res.product_id,
            p_order_id,
            'consumption',
            -res.quantity,
            v_on_hand,
            GREATEST(0, v_on_hand - res.quantity),
            v_reserved,
            GREATEST(0, v_reserved - res.quantity),
            'system:payment_capture',
            'Stock consumed upon payment capture'
        );
    END LOOP;

    RETURN TRUE;
END;
$$;

-- Release stock upon cancellation, payment failure, or abandonment (IDEMPOTENT)
CREATE OR REPLACE FUNCTION public.release_stock_for_order(
    p_order_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    res RECORD;
    v_on_hand INTEGER;
    v_reserved INTEGER;
BEGIN
    -- Idempotent check: only process reservations in 'reserved' state
    FOR res IN
        SELECT id, product_id, quantity
        FROM public.stock_reservations
        WHERE order_id = p_order_id AND status = 'reserved'
        FOR UPDATE
    LOOP
        SELECT stock_on_hand, stock_reserved
        INTO v_on_hand, v_reserved
        FROM public.inventory
        WHERE product_id = res.product_id
        FOR UPDATE;

        UPDATE public.inventory
        SET stock_reserved = GREATEST(0, stock_reserved - res.quantity),
            updated_at = timezone('utc'::text, now())
        WHERE product_id = res.product_id;

        UPDATE public.stock_reservations
        SET status = 'released',
            updated_at = timezone('utc'::text, now())
        WHERE id = res.id;

        -- Audit log entry
        INSERT INTO public.inventory_audit_logs (
            product_id,
            order_id,
            change_type,
            quantity_delta,
            stock_on_hand_before,
            stock_on_hand_after,
            stock_reserved_before,
            stock_reserved_after,
            actor,
            note
        ) VALUES (
            res.product_id,
            p_order_id,
            'release',
            res.quantity,
            v_on_hand,
            v_on_hand,
            v_reserved,
            GREATEST(0, v_reserved - res.quantity),
            'system:order_cancellation',
            'Stock reservation released'
        );
    END LOOP;

    RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 10. Atomic Payment Confirmation & Status Transition Function
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_order_payment(
    p_order_id UUID,
    p_razorpay_order_id TEXT,
    p_razorpay_payment_id TEXT,
    p_amount_paise BIGINT,
    p_signature TEXT DEFAULT NULL,
    p_method TEXT DEFAULT NULL,
    p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
BEGIN
    -- Row lock to prevent concurrent webhook/redirect race conditions
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Idempotency check: if already paid, return status cleanly without re-executing
    IF v_order.payment_status = 'paid' THEN
        RETURN jsonb_build_object(
            'already_processed', true,
            'order_id', v_order.id,
            'payment_status', v_order.payment_status,
            'delivery_status', v_order.delivery_status
        );
    END IF;

    -- Mark order as paid
    UPDATE public.orders
    SET payment_status = 'paid',
        delivery_status = CASE WHEN delivery_status = 'pending' THEN 'processing' ELSE delivery_status END,
        razorpay_payment_id = COALESCE(p_razorpay_payment_id, razorpay_payment_id),
        razorpay_order_id = COALESCE(p_razorpay_order_id, razorpay_order_id),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id;

    -- Record payment record
    INSERT INTO public.payments (
        order_id,
        razorpay_order_id,
        razorpay_payment_id,
        amount_paise,
        currency,
        status,
        method,
        signature,
        raw_payload
    ) VALUES (
        p_order_id,
        p_razorpay_order_id,
        p_razorpay_payment_id,
        p_amount_paise,
        'INR',
        'captured',
        p_method,
        p_signature,
        p_payload
    )
    ON CONFLICT (razorpay_payment_id) DO NOTHING;

    -- Atomically consume reserved stock
    PERFORM public.consume_stock_for_order(p_order_id);

    -- Record status transition in history
    INSERT INTO public.order_status_history (
        order_id,
        old_fulfillment_status,
        new_fulfillment_status,
        old_payment_status,
        new_payment_status,
        actor,
        note
    ) VALUES (
        p_order_id,
        v_order.delivery_status,
        'processing',
        v_order.payment_status,
        'paid',
        'system:razorpay',
        'Payment captured and inventory atomically consumed'
    );

    RETURN jsonb_build_object(
        'already_processed', false,
        'order_id', p_order_id,
        'payment_status', 'paid',
        'delivery_status', 'processing'
    );
END;
$$;

-- Record fulfillment transition helper
CREATE OR REPLACE FUNCTION public.record_order_status_transition(
    p_order_id UUID,
    p_new_fulfillment TEXT,
    p_actor TEXT,
    p_note TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_fulfillment TEXT;
    v_payment_status TEXT;
BEGIN
    SELECT delivery_status, payment_status
    INTO v_old_fulfillment, v_payment_status
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- If no status change, no-op
    IF v_old_fulfillment = p_new_fulfillment THEN
        RETURN TRUE;
    END IF;

    UPDATE public.orders
    SET delivery_status = p_new_fulfillment,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id;

    INSERT INTO public.order_status_history (
        order_id,
        old_fulfillment_status,
        new_fulfillment_status,
        old_payment_status,
        new_payment_status,
        actor,
        note
    ) VALUES (
        p_order_id,
        v_old_fulfillment,
        p_new_fulfillment,
        v_payment_status,
        v_payment_status,
        p_actor,
        p_note
    );

    RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. Row Level Security & Least-Privilege Grants
-- ------------------------------------------------------------------------------
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_audit_logs ENABLE ROW LEVEL SECURITY;

-- Order status history: Admins have full access
CREATE POLICY "Admins have full access to order_status_history"
    ON public.order_status_history
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Store settings: Public can read store settings; Admins have full access
CREATE POLICY "Public can view store settings"
    ON public.store_settings
    FOR SELECT
    USING (true);

CREATE POLICY "Admins have full access to store_settings"
    ON public.store_settings
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Inventory audit logs: Admins have full access
CREATE POLICY "Admins have full access to inventory_audit_logs"
    ON public.inventory_audit_logs
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Revoke write privileges from public (anon and authenticated) roles on critical tables
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.invoices FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.refunds FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.stock_reservations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.inventory FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.inventory_audit_logs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_status_history FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.store_settings FROM anon;

-- Grant SELECT only to anonymous viewers for products and public store settings
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.products_catalog TO anon;
GRANT SELECT ON public.store_settings TO anon;
-- ==============================================================================
-- RoboShop-Forge Seed Data (Explicitly Marked Robotics Demo Products)
-- ==============================================================================
-- Notice: These products represent illustrative demo robotics components.
-- Replacing demo data with production hardware is straightforward:
-- simply update or insert rows into public.products and public.inventory.
-- ==============================================================================

DO $$
DECLARE
    p1 UUID := 'a1111111-1111-4111-8111-111111111111';
    p2 UUID := 'a2222222-2222-4222-8222-222222222222';
    p3 UUID := 'a3333333-3333-4333-8333-333333333333';
    p4 UUID := 'a4444444-4444-4444-8444-444444444444';
    p5 UUID := 'a5555555-5555-4555-8555-555555555555';
    p6 UUID := 'a6666666-6666-4666-8666-666666666666';
BEGIN
    -- Product 1: ForgeBot 6-DOF Robotic Arm
    INSERT INTO public.products (id, slug, sku, category, name, description, price_paise, image_url, hsn_code, tax_rate_bps, is_active, metadata)
    VALUES (
        p1,
        'forgebot-alpha-6dof',
        'RBF-ARM-6DOF',
        'manipulators',
        'ForgeBot Alpha 6-DOF Robotic Arm',
        'Precision articulated 6-axis collaborative robotic arm with harmonic drive gearboxes, 3.5kg payload capacity, 0.05mm repeatability, and native ROS2 Galactic/Humble drivers.',
        18500000, -- ₹1,85,000.00
        'https://images.unsplash.com/photo-1618042164219-62c820f10723?auto=format&fit=crop&w=800&q=80',
        '84795000',
        1800,
        true,
        '{"payload_kg": 3.5, "reach_mm": 650, "degrees_of_freedom": 6, "interface": "Ethernet / CAN"}'::jsonb
    ) ON CONFLICT (id) DO UPDATE SET 
        sku = EXCLUDED.sku,
        category = EXCLUDED.category,
        price_paise = EXCLUDED.price_paise;

    INSERT INTO public.inventory (product_id, stock_on_hand, stock_reserved)
    VALUES (p1, 5, 0)
    ON CONFLICT (product_id) DO UPDATE SET stock_on_hand = EXCLUDED.stock_on_hand;

    -- Product 2: LiDAR-Scan 360 Pro
    INSERT INTO public.products (id, slug, sku, category, name, description, price_paise, image_url, hsn_code, tax_rate_bps, is_active, metadata)
    VALUES (
        p2,
        'lidar-scan-360-pro',
        'RBF-LIDAR-360',
        'sensors',
        'LiDAR-Scan 360 Pro SLAM Sensor',
        '360-degree Time-of-Flight 2D/3D LiDAR sensor with 25-meter radius range, 12Hz scanning frequency, and industrial IP65 dust/waterproof enclosure.',
        2499900, -- ₹24,999.00
        'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
        '90151000',
        1800,
        true,
        '{"range_m": 25, "scan_rate_hz": 12, "sample_rate_khz": 16, "interface": "USB-C / UART"}'::jsonb
    ) ON CONFLICT (id) DO UPDATE SET 
        sku = EXCLUDED.sku,
        category = EXCLUDED.category,
        price_paise = EXCLUDED.price_paise;

    INSERT INTO public.inventory (product_id, stock_on_hand, stock_reserved)
    VALUES (p2, 14, 0)
    ON CONFLICT (product_id) DO UPDATE SET stock_on_hand = EXCLUDED.stock_on_hand;

    -- Product 3: OmniDrive 4WD AMR Platform
    INSERT INTO public.products (id, slug, sku, category, name, description, price_paise, image_url, hsn_code, tax_rate_bps, is_active, metadata)
    VALUES (
        p3,
        'omnidrive-4wd-mobile-base',
        'RBF-AMR-4WD',
        'mobility',
        'OmniDrive 4WD Heavy-Duty Mobile Platform',
        'Holonomic Mecanum-wheel autonomous mobile robotics chassis. CNC aluminum structure, four 24V brushless hub motors with built-in optical encoders, 50kg load capacity.',
        6850000, -- ₹68,500.00
        'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?auto=format&fit=crop&w=800&q=80',
        '84795000',
        1800,
        true,
        '{"payload_kg": 50, "max_speed_ms": 1.8, "voltage": "24V", "wheel_type": "Mecanum 152mm"}'::jsonb
    ) ON CONFLICT (id) DO UPDATE SET 
        sku = EXCLUDED.sku,
        category = EXCLUDED.category,
        price_paise = EXCLUDED.price_paise;

    INSERT INTO public.inventory (product_id, stock_on_hand, stock_reserved)
    VALUES (p3, 8, 0)
    ON CONFLICT (product_id) DO UPDATE SET stock_on_hand = EXCLUDED.stock_on_hand;

    -- Product 4: NeuroNav Stereo Depth Camera V2
    INSERT INTO public.products (id, slug, sku, category, name, description, price_paise, image_url, hsn_code, tax_rate_bps, is_active, metadata)
    VALUES (
        p4,
        'neuronav-stereo-depth-v2',
        'RBF-CAM-STEREO',
        'sensors',
        'NeuroNav Stereo Depth Camera V2',
        'Active infrared stereoscopic 3D camera with integrated 6-DoF IMU and neural depth processor. Delivers 90fps depth point clouds directly over USB 3.1 Gen 1.',
        3200000, -- ₹32,000.00
        'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=800&q=80',
        '85258900',
        1800,
        true,
        '{"depth_resolution": "1280x720", "fps": 90, "shutter": "Global", "baseline_mm": 95}'::jsonb
    ) ON CONFLICT (id) DO UPDATE SET 
        sku = EXCLUDED.sku,
        category = EXCLUDED.category,
        price_paise = EXCLUDED.price_paise;

    INSERT INTO public.inventory (product_id, stock_on_hand, stock_reserved)
    VALUES (p4, 12, 0)
    ON CONFLICT (product_id) DO UPDATE SET stock_on_hand = EXCLUDED.stock_on_hand;

    -- Product 5: TitanCore Dual BLDC Motor ESC 60A
    INSERT INTO public.products (id, slug, sku, category, name, description, price_paise, image_url, hsn_code, tax_rate_bps, is_active, metadata)
    VALUES (
        p5,
        'titancore-dual-bldc-esc-60a',
        'RBF-ESC-60A',
        'controllers',
        'TitanCore Dual BLDC Motor ESC 60A',
        'Field-Oriented Control (FOC) dual brushless motor speed controller. Supports 12V-54V input, 60A continuous per channel, CAN bus telemetry, and programmable regen braking.',
        1150000, -- ₹11,500.00
        'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80',
        '85044090',
        1800,
        true,
        '{"voltage_range": "12V-54V", "current_continuous_a": 60, "bus": "CAN / UART / PWM"}'::jsonb
    ) ON CONFLICT (id) DO UPDATE SET 
        sku = EXCLUDED.sku,
        category = EXCLUDED.category,
        price_paise = EXCLUDED.price_paise;

    INSERT INTO public.inventory (product_id, stock_on_hand, stock_reserved)
    VALUES (p5, 25, 0)
    ON CONFLICT (product_id) DO UPDATE SET stock_on_hand = EXCLUDED.stock_on_hand;

    -- Product 6: GripperForge Adaptive Soft-Touch Gripper
    INSERT INTO public.products (id, slug, sku, category, name, description, price_paise, image_url, hsn_code, tax_rate_bps, is_active, metadata)
    VALUES (
        p6,
        'gripperforge-soft-touch',
        'RBF-GRP-SOFT',
        'end_effectors',
        'GripperForge Adaptive Soft-Touch Gripper',
        'Electric parallel 2-finger gripper with integrated force-torque feedback and exchangeable high-friction silicone pads. Stroke 85mm, gripping force 20N-120N.',
        1980000, -- ₹19,800.00
        'https://images.unsplash.com/photo-1589254065878-42c9da997008?auto=format&fit=crop&w=800&q=80',
        '84799090',
        1800,
        true,
        '{"stroke_mm": 85, "grip_force_n": "20-120", "actuation": "Electric Servo"}'::jsonb
    ) ON CONFLICT (id) DO UPDATE SET 
        sku = EXCLUDED.sku,
        category = EXCLUDED.category,
        price_paise = EXCLUDED.price_paise;

    INSERT INTO public.inventory (product_id, stock_on_hand, stock_reserved)
    VALUES (p6, 10, 0)
    ON CONFLICT (product_id) DO UPDATE SET stock_on_hand = EXCLUDED.stock_on_hand;

END $$;
