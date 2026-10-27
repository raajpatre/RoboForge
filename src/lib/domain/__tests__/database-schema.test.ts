import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Database Migrations, Constraints, Idempotency & RLS Specification", () => {
  const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
  const migrationFiles = fs.readdirSync(migrationsDir).sort();
  const allSqlContent = migrationFiles
    .map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf-8"))
    .join("\n\n");

  it("includes migrations for all required tables and sequence", () => {
    const requiredTables = [
      "public.products",
      "public.inventory",
      "public.orders",
      "public.order_items",
      "public.stock_reservations",
      "public.invoices",
      "public.refunds",
      "public.webhook_events",
      "public.order_status_history",
      "public.store_settings",
      "public.inventory_audit_logs",
    ];

    for (const table of requiredTables) {
      expect(allSqlContent).toContain(table);
    }

    // Invoice serial sequence
    expect(allSqlContent).toContain("invoice_serial_seq");
    // Views
    expect(allSqlContent).toContain("public.payment_events");
    expect(allSqlContent).toContain("public.inventory_reservations");
  });

  it("enforces strict check constraints to prevent negative quantities and corrupt amounts", () => {
    // Inventory non-negative checks
    expect(allSqlContent).toMatch(/stock_on_hand INTEGER NOT NULL DEFAULT 0 CHECK \(stock_on_hand >= 0\)/);
    expect(allSqlContent).toMatch(/stock_reserved INTEGER NOT NULL DEFAULT 0 CHECK \(stock_reserved >= 0\)/);
    expect(allSqlContent).toMatch(/CONSTRAINT chk_stock_integrity CHECK \(stock_reserved <= stock_on_hand\)/);

    // Reservation positive quantity check
    expect(allSqlContent).toMatch(/quantity INTEGER NOT NULL CHECK \(quantity > 0\)/);

    // Integer paise non-negative checks
    expect(allSqlContent).toMatch(/price_paise BIGINT NOT NULL CHECK \(price_paise >= 0\)/);
    expect(allSqlContent).toMatch(/subtotal_paise BIGINT NOT NULL CHECK \(subtotal_paise >= 0\)/);
    expect(allSqlContent).toMatch(/total_paise BIGINT NOT NULL CHECK \(total_paise >= 0\)/);
  });

  it("enforces unique constraints to prevent duplicate orders, payments, and invoices", () => {
    // Unique invoice number
    expect(allSqlContent).toMatch(/invoice_number TEXT NOT NULL UNIQUE/);
    // Unique order code / order number
    expect(allSqlContent).toMatch(/order_code TEXT NOT NULL UNIQUE/);
    expect(allSqlContent).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number");
    // Unique payment ID and webhook event ID
    expect(allSqlContent).toMatch(/razorpay_payment_id TEXT NOT NULL UNIQUE/);
    expect(allSqlContent).toMatch(/event_id TEXT NOT NULL UNIQUE/);
  });

  it("separates payment status from delivery / fulfillment status", () => {
    expect(allSqlContent).toMatch(/payment_status TEXT NOT NULL DEFAULT 'pending' CHECK \(payment_status IN \('pending', 'paid', 'failed', 'refunded', 'partially_refunded'\)\)/);
    expect(allSqlContent).toMatch(/delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK \(delivery_status IN \('pending', 'processing', 'shipped', 'delivered', 'cancelled'\)\)/);
  });

  it("implements idempotent invoice generation that prevents duplicate invoices for the same order", () => {
    // issue_invoice_serial must check if invoice already exists for order_id
    expect(allSqlContent).toContain("FUNCTION public.issue_invoice_serial");
    expect(allSqlContent).toContain("SELECT invoice_number INTO v_existing_invoice");
    expect(allSqlContent).toContain("WHERE order_id = p_order_id");
    expect(allSqlContent).toContain("IF v_existing_invoice IS NOT NULL THEN");
    expect(allSqlContent).toContain("RETURN v_existing_invoice");
  });

  it("implements idempotent inventory consumption and release logic", () => {
    // consume_stock_for_order only selects 'reserved' status
    expect(allSqlContent).toContain("WHERE order_id = p_order_id AND status = 'reserved'");
    // release_stock_for_order only selects 'reserved' status
    expect(allSqlContent).toContain("FUNCTION public.release_stock_for_order");
  });

  it("implements atomic payment confirmation with duplicate execution prevention", () => {
    expect(allSqlContent).toContain("FUNCTION public.confirm_order_payment");
    expect(allSqlContent).toContain("IF v_order.payment_status = 'paid' THEN");
    expect(allSqlContent).toContain("'already_processed', true");
  });

  it("enforces explicit unconfigured state for store tax settings", () => {
    expect(allSqlContent).toMatch(/tax_status TEXT NOT NULL DEFAULT 'not_configured'/);
    expect(allSqlContent).toMatch(/is_tax_configured BOOLEAN NOT NULL DEFAULT false/);
    expect(allSqlContent).toContain("'not_configured'");
  });

  it("enables Row Level Security (RLS) on all exposed public tables", () => {
    const tablesWithRLS = [
      "public.products",
      "public.inventory",
      "public.orders",
      "public.order_items",
      "public.stock_reservations",
      "public.payments",
      "public.webhook_events",
      "public.invoices",
      "public.refunds",
      "public.audit_logs",
      "public.order_status_history",
      "public.store_settings",
      "public.inventory_audit_logs",
    ];

    for (const table of tablesWithRLS) {
      expect(allSqlContent).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it("revokes unauthorized write grants to protect customer and financial data from anon/authenticated roles", () => {
    expect(allSqlContent).toContain("REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated;");
    expect(allSqlContent).toContain("REVOKE INSERT, UPDATE, DELETE ON public.invoices FROM anon, authenticated;");
    expect(allSqlContent).toContain("REVOKE INSERT, UPDATE, DELETE ON public.payments FROM anon, authenticated;");
    expect(allSqlContent).toContain("REVOKE INSERT, UPDATE, DELETE ON public.stock_reservations FROM anon, authenticated;");
    expect(allSqlContent).toContain("GRANT SELECT ON public.products TO anon;");
  });
});
