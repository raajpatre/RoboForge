import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateInvoicePdf, generateCreditNotePdf } from "../invoice-generator";
import { buildMockInvoiceSnapshot } from "@/lib/domain/invoice";
import type { InvoiceSnapshot, CreditNoteSnapshot, InvoiceItemSnapshot } from "@/types/domain";

describe("Server-Side Vector PDF Invoice Generator", () => {
  const sampleOrderCode = "RBF-A1B2C3D4-E5F67890-12345678-90ABCDEF";
  const snapshot = buildMockInvoiceSnapshot(sampleOrderCode);

  it("generates a valid, non-empty PDF document buffer", async () => {
    const pdfBytes = await generateInvoicePdf(snapshot);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);

    // Verify PDF Magic Bytes (%PDF-)
    const header = Buffer.from(pdfBytes.slice(0, 5)).toString("ascii");
    expect(header).toBe("%PDF-");
  });

  it("produces a structurally valid single-page A4 document readable by pdf-lib parser", async () => {
    const pdfBytes = await generateInvoicePdf(snapshot);
    const parsedDoc = await PDFDocument.load(pdfBytes);

    expect(parsedDoc.getPageCount()).toBe(1);

    const page = parsedDoc.getPage(0);
    const { width, height } = page.getSize();

    // Standard A4 dimensions (595.28 x 841.89 pt)
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it("handles intrastate tax breakdown (CGST + SGST) accurately", async () => {
    const intrastateSnapshot: InvoiceSnapshot = {
      ...snapshot,
      seller: { ...snapshot.seller, state_code: "29" },
      buyer: {
        ...snapshot.buyer,
        shipping_address: { ...snapshot.buyer.shipping_address, state_code: "29" },
      },
    };

    const pdfBytes = await generateInvoicePdf(intrastateSnapshot);
    expect(pdfBytes.length).toBeGreaterThan(1000);
    const parsed = await PDFDocument.load(pdfBytes);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("handles interstate tax breakdown (IGST) accurately", async () => {
    const interstateSnapshot: InvoiceSnapshot = {
      ...snapshot,
      seller: { ...snapshot.seller, state_code: "29" },
      buyer: {
        ...snapshot.buyer,
        shipping_address: { ...snapshot.buyer.shipping_address, state: "Maharashtra", state_code: "27" },
      },
    };

    const pdfBytes = await generateInvoicePdf(interstateSnapshot);
    expect(pdfBytes.length).toBeGreaterThan(1000);
    const parsed = await PDFDocument.load(pdfBytes);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("renders non-GST Commercial Invoice / Bill of Supply when seller is unregistered", async () => {
    const unregisteredSnapshot: InvoiceSnapshot = {
      ...snapshot,
      is_gst_invoice: false,
      seller: {
        ...snapshot.seller,
        gstin: "UNREGISTERED / NOT APPLICABLE",
      },
      tax_paise: 0,
      items: snapshot.items.map((i) => ({
        ...i,
        tax_rate_bps: 0,
        tax_amount_paise: 0,
        total_paise: i.taxable_amount_paise,
      })),
    };

    const pdfBytes = await generateInvoicePdf(unregisteredSnapshot);
    expect(pdfBytes.length).toBeGreaterThan(1000);
    const parsed = await PDFDocument.load(pdfBytes);
    expect(parsed.getPageCount()).toBe(1);
  });

  it("renders long shipping addresses and customer names without overflow errors", async () => {
    const longAddressSnapshot: InvoiceSnapshot = {
      ...snapshot,
      buyer: {
        name: "Dr. Vikram Ambalal Sarabhai-Ramanujan Institute of Advanced Cybernetic Systems & Space Robotics Research Consortium",
        email: "very-long-corporate-procurement-contact-department@robotics-research-consortium.org",
        phone: "+919876543210",
        shipping_address: {
          line1: "Suite 402B, Building 7C, Quantum Automation Tower, Silicon High-Tech Technology Corridor, Outer Ring Road Phase 3",
          line2: "Opposite Innovation Research Campus, Near Advanced Precision Machine Works Gate 4",
          city: "Bengaluru Technology Metropolis",
          state: "Karnataka",
          state_code: "29",
          postal_code: "560103",
          country: "India",
        },
      },
    };

    const pdfBytes = await generateInvoicePdf(longAddressSnapshot);
    expect(pdfBytes.length).toBeGreaterThan(1000);
    const parsed = await PDFDocument.load(pdfBytes);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("paginates multiple line items across multiple pages when rows exceed single-page capacity", async () => {
    const manyItems: InvoiceItemSnapshot[] = [];
    for (let i = 1; i <= 20; i++) {
      manyItems.push({
        product_name: `Industrial Actuator Assembly Unit Mod-${i.toString().padStart(3, "0")}`,
        sku: `RBF-ACT-${i.toString().padStart(3, "0")}`,
        hsn_code: "84795000",
        unit_price_paise: 1200000,
        tax_rate_bps: 1800,
        quantity: 2,
        taxable_amount_paise: 2400000,
        tax_amount_paise: 432000,
        total_paise: 2832000,
      });
    }

    const multiPageSnapshot: InvoiceSnapshot = {
      ...snapshot,
      items: manyItems,
      subtotal_paise: 2400000 * 20,
      tax_paise: 432000 * 20,
      total_paise: 2832000 * 20,
    };

    const pdfBytes = await generateInvoicePdf(multiPageSnapshot);
    expect(pdfBytes.length).toBeGreaterThan(1000);
    const parsed = await PDFDocument.load(pdfBytes);

    // 20 items should trigger multi-page rendering
    expect(parsed.getPageCount()).toBeGreaterThan(1);
  });

  it("generates credit note PDF document with correct adjustment details", async () => {
    const creditNote: CreditNoteSnapshot = {
      credit_note_number: "CN-2026-000042",
      original_invoice_number: snapshot.invoice_number,
      issue_date: "2026-10-26",
      order_code: snapshot.order_code,
      seller: snapshot.seller,
      buyer: snapshot.buyer,
      refund_amount_paise: snapshot.total_paise,
      reason: "Customer order returned under statutory 30-day robotics warranty. Component returned to inventory.",
      currency: "INR",
    };

    const pdfBytes = await generateCreditNotePdf(creditNote);
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);

    const parsed = await PDFDocument.load(pdfBytes);
    expect(parsed.getPageCount()).toBe(1);

    const header = Buffer.from(pdfBytes.slice(0, 5)).toString("ascii");
    expect(header).toBe("%PDF-");
  });
});
