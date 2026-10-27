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
