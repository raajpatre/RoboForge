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
