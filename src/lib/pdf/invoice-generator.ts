import "server-only";
import { PDFDocument, StandardFonts, rgb, RGB } from "pdf-lib";
import type { InvoiceSnapshot, CreditNoteSnapshot } from "@/types/domain";
import { formatINRAscii, amountToWordsINR } from "@/lib/domain/money";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2; // 523.28 pt

// Color palette
const COLOR_BLACK = rgb(0.08, 0.1, 0.13);
const COLOR_MUTED = rgb(0.4, 0.45, 0.5);
const COLOR_BORDER = rgb(0.82, 0.85, 0.89);
const COLOR_BG_HEADER = rgb(0.94, 0.96, 0.98);
const COLOR_ACCENT = rgb(0.05, 0.4, 0.75);

/**
 * Generates an on-demand, GST-compliant or Commercial PDF invoice from an immutable snapshot.
 * Guarantees 0 PDF bytes stored in the database.
 * Supports:
 * - Real seller tax configuration (never labels as GST tax invoice unless seller supports it).
 * - Multi-item orders with dynamic pagination.
 * - Long addresses without boundary overflows.
 * - Reliable ASCII/INR fallback for Unicode Rupee compatibility.
 */
export async function generateInvoicePdf(invoice: InvoiceSnapshot): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let currentY = PAGE_HEIGHT - MARGIN;

  const drawRightText = (
    text: string,
    rightX: number,
    y: number,
    font: typeof helvetica,
    size: number,
    color: RGB = COLOR_BLACK
  ) => {
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: rightX - textWidth,
      y,
      size,
      font,
      color,
    });
  };

  const drawCenteredText = (
    text: string,
    centerX: number,
    y: number,
    font: typeof helvetica,
    size: number,
    color: RGB = COLOR_BLACK
  ) => {
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: centerX - textWidth / 2,
      y,
      size,
      font,
      color,
    });
  };

  // Helper to draw text with automatic word wrapping
  const drawWrappedText = (
    text: string,
    x: number,
    startY: number,
    maxWidth: number,
    fontSize: number,
    font: typeof helvetica,
    color: RGB = COLOR_BLACK,
    lineHeight = fontSize + 2
  ): number => {
    const words = text.split(" ");
    let line = "";
    let y = startY;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + (line === "" ? "" : " ") + words[i];
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      if (testWidth > maxWidth && i > 0) {
        page.drawText(line, { x, y, size: fontSize, font, color });
        line = words[i];
        y -= lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line !== "") {
      page.drawText(line, { x, y, size: fontSize, font, color });
      y -= lineHeight;
    }
    return y;
  };

  const isGst = invoice.is_gst_invoice !== false && !invoice.seller.gstin.includes("UNREGISTERED");

  // ==========================================
  // 1. TOP HEADER & STATUS BAR
  // ==========================================
  const docTitle = isGst ? "TAX INVOICE" : "Invoice";
  const docSubtitle = isGst ? "ORIGINAL FOR RECIPIENT - GST TAX INVOICE" : "ORIGINAL FOR RECIPIENT - BILL OF SUPPLY";

  page.drawText(docTitle, {
    x: MARGIN,
    y: currentY - 14,
    size: 16,
    font: helveticaBold,
    color: COLOR_ACCENT,
  });

  page.drawText(docSubtitle, {
    x: MARGIN,
    y: currentY - 26,
    size: 7,
    font: helveticaBold,
    color: COLOR_MUTED,
  });

  drawRightText(`Invoice No: ${invoice.invoice_number}`, PAGE_WIDTH - MARGIN, currentY - 12, helveticaBold, 10, COLOR_BLACK);
  drawRightText(`Date of Issue: ${invoice.issue_date}`, PAGE_WIDTH - MARGIN, currentY - 24, helvetica, 9, COLOR_MUTED);

  currentY -= 36;

  page.drawLine({
    start: { x: MARGIN, y: currentY },
    end: { x: PAGE_WIDTH - MARGIN, y: currentY },
    thickness: 1,
    color: COLOR_BORDER,
  });

  currentY -= 14;

  page.drawText(`Order Reference Token: ${invoice.order_code}`, {
    x: MARGIN,
    y: currentY,
    size: 8,
    font: helveticaBold,
    color: COLOR_MUTED,
  });

  currentY -= 18;

  // ==========================================
  // 2. SUPPLIER & BUYER SNAPSHOT (2 Columns)
  // ==========================================
  const colWidth = (CONTENT_WIDTH - 12) / 2;
  const cardHeight = 120;
  const sellerX = MARGIN;
  const buyerX = MARGIN + colWidth + 12;

  // Supplier Card Box
  page.drawRectangle({
    x: sellerX,
    y: currentY - cardHeight,
    width: colWidth,
    height: cardHeight,
    borderWidth: 0.75,
    borderColor: COLOR_BORDER,
    color: rgb(0.99, 0.99, 1),
  });

  // Buyer Card Box
  page.drawRectangle({
    x: buyerX,
    y: currentY - cardHeight,
    width: colWidth,
    height: cardHeight,
    borderWidth: 0.75,
    borderColor: COLOR_BORDER,
    color: rgb(0.99, 0.99, 1),
  });

  // Supplier Content
  let sY = currentY - 14;
  page.drawText("Supplier", { x: sellerX + 8, y: sY, size: 8, font: helveticaBold, color: COLOR_ACCENT });
  sY -= 12;
  page.drawText(invoice.seller.legal_name, { x: sellerX + 8, y: sY, size: 8.5, font: helveticaBold, color: COLOR_BLACK });
  sY -= 11;
  if (isGst) {
    page.drawText(`GSTIN: ${invoice.seller.gstin}`, { x: sellerX + 8, y: sY, size: 7.5, font: helveticaBold, color: COLOR_BLACK });
    sY -= 10;
    page.drawText(`PAN: ${invoice.seller.pan}`, { x: sellerX + 8, y: sY, size: 7.5, font: helvetica, color: COLOR_MUTED });
    sY -= 10;
  }
  // Multi-line address wrapping for supplier
  const fullSellerAddr = `${invoice.seller.address_line1}${invoice.seller.address_line2 ? ", " + invoice.seller.address_line2 : ""}`;
  sY = drawWrappedText(fullSellerAddr, sellerX + 8, sY, colWidth - 16, 7.5, helvetica, COLOR_BLACK, 9.5);
  page.drawText(`${invoice.seller.city}, ${invoice.seller.state} - ${invoice.seller.postal_code}`, { x: sellerX + 8, y: sY, size: 7.5, font: helvetica, color: COLOR_BLACK });
  sY -= 10;
  page.drawText(`State Code: ${invoice.seller.state_code} | Country: ${invoice.seller.country}`, { x: sellerX + 8, y: sY, size: 7.5, font: helvetica, color: COLOR_MUTED });
  sY -= 10;
  page.drawText(`Email: ${invoice.seller.email} | Phone: ${invoice.seller.phone}`, { x: sellerX + 8, y: sY, size: 7, font: helvetica, color: COLOR_MUTED });

  // Buyer Content
  let bY = currentY - 14;
  page.drawText("Billed to", { x: buyerX + 8, y: bY, size: 8, font: helveticaBold, color: COLOR_ACCENT });
  bY -= 12;
  page.drawText(invoice.buyer.name, { x: buyerX + 8, y: bY, size: 8.5, font: helveticaBold, color: COLOR_BLACK });
  bY -= 11;
  page.drawText(`Email: ${invoice.buyer.email}`, { x: buyerX + 8, y: bY, size: 7.5, font: helvetica, color: COLOR_MUTED });
  bY -= 10;
  page.drawText(`Contact: ${invoice.buyer.phone}`, { x: buyerX + 8, y: bY, size: 7.5, font: helvetica, color: COLOR_MUTED });
  bY -= 10;
  // Multi-line address wrapping for buyer
  const fullBuyerAddr = `Address: ${invoice.buyer.shipping_address.line1}${invoice.buyer.shipping_address.line2 ? ", " + invoice.buyer.shipping_address.line2 : ""}`;
  bY = drawWrappedText(fullBuyerAddr, buyerX + 8, bY, colWidth - 16, 7.5, helvetica, COLOR_BLACK, 9.5);
  page.drawText(`${invoice.buyer.shipping_address.city}, ${invoice.buyer.shipping_address.state} - ${invoice.buyer.shipping_address.postal_code}`, { x: buyerX + 8, y: bY, size: 7.5, font: helvetica, color: COLOR_BLACK });

  currentY -= cardHeight + 16;

  // ==========================================
  // 3. LINE ITEMS TABLE
  // ==========================================
  const cols = [
    { label: "#", width: 25, align: "center" as const },
    { label: "Items List", width: 298.28, align: "left" as const },
    { label: "Qty", width: 40, align: "center" as const },
    { label: "Unit Rate", width: 80, align: "right" as const },
    { label: "Total Amount", width: 80, align: "right" as const },
  ];

  const tableHeaderHeight = 20;

  const drawTableHeader = (y: number) => {
    page.drawRectangle({
      x: MARGIN,
      y: y - tableHeaderHeight,
      width: CONTENT_WIDTH,
      height: tableHeaderHeight,
      borderWidth: 0.75,
      borderColor: COLOR_BORDER,
      color: COLOR_BG_HEADER,
    });

    let curX = MARGIN;
    for (const col of cols) {
      if (col.align === "center") {
        drawCenteredText(col.label, curX + col.width / 2, y - 13, helveticaBold, 7.5, COLOR_BLACK);
      } else if (col.align === "right") {
        drawRightText(col.label, curX + col.width - 4, y - 13, helveticaBold, 7.5, COLOR_BLACK);
      } else {
        page.drawText(col.label, { x: curX + 4, y: y - 13, size: 7.5, font: helveticaBold, color: COLOR_BLACK });
      }
      curX += col.width;
    }
  };

  drawTableHeader(currentY);
  currentY -= tableHeaderHeight;

  // Draw Line Items with pagination if necessary
  const rowHeight = 22;

  invoice.items.forEach((item, index) => {
    // If not enough vertical room for row + summary box and declarations, create new page
    if (currentY < 220) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      currentY = PAGE_HEIGHT - MARGIN;
      drawTableHeader(currentY);
      currentY -= tableHeaderHeight;
    }

    page.drawRectangle({
      x: MARGIN,
      y: currentY - rowHeight,
      width: CONTENT_WIDTH,
      height: rowHeight,
      borderWidth: 0.5,
      borderColor: COLOR_BORDER,
      color: index % 2 === 0 ? rgb(1, 1, 1) : rgb(0.98, 0.99, 1),
    });

    let cellX = MARGIN;

    // Index
    drawCenteredText(String(index + 1), cellX + cols[0].width / 2, currentY - 14, helvetica, 7.5, COLOR_MUTED);
    cellX += cols[0].width;

    // Items List Description
    const itemDesc = item.sku ? `${item.product_name} [${item.sku}]` : item.product_name;
    const truncatedDesc = itemDesc.length > 58 ? itemDesc.slice(0, 55) + "..." : itemDesc;
    page.drawText(truncatedDesc, { x: cellX + 4, y: currentY - 14, size: 7.5, font: helveticaBold, color: COLOR_BLACK });
    cellX += cols[1].width;

    // Qty
    drawCenteredText(String(item.quantity), cellX + cols[2].width / 2, currentY - 14, helveticaBold, 7.5, COLOR_BLACK);
    cellX += cols[2].width;

    // Unit Rate
    drawRightText(formatINRAscii(item.unit_price_paise), cellX + cols[3].width - 4, currentY - 14, helvetica, 7, COLOR_MUTED);
    cellX += cols[3].width;

    // Total Amount
    drawRightText(formatINRAscii(item.total_paise), cellX + cols[4].width - 4, currentY - 14, helveticaBold, 7.5, COLOR_BLACK);

    currentY -= rowHeight;
  });

  currentY -= 14;

  // ==========================================
  // 4. TAX BREAKDOWN & GRAND TOTAL
  // ==========================================
  const summaryBoxWidth = 240;
  const summaryBoxX = PAGE_WIDTH - MARGIN - summaryBoxWidth;

  const isIntraState =
    invoice.seller.state_code &&
    invoice.buyer.shipping_address.state_code &&
    invoice.seller.state_code === invoice.buyer.shipping_address.state_code;

  const cgstPaise = isGst && isIntraState ? Math.round(invoice.tax_paise / 2) : 0;
  const sgstPaise = isGst && isIntraState ? invoice.tax_paise - cgstPaise : 0;
  const igstPaise = isGst && !isIntraState ? invoice.tax_paise : 0;

  // Build appropriate summary lines based on real tax configuration
  const summaryLines: Array<{ label: string; value: string; bold: boolean }> = [
    { label: "Taxable Value (Subtotal):", value: formatINRAscii(invoice.subtotal_paise), bold: false },
  ];

  if (isGst) {
    if (isIntraState) {
      summaryLines.push(
        { label: "CGST (9.00%):", value: formatINRAscii(cgstPaise), bold: false },
        { label: "SGST (9.00%):", value: formatINRAscii(sgstPaise), bold: false }
      );
    } else {
      summaryLines.push({ label: "Integrated GST (IGST 18.00%):", value: formatINRAscii(igstPaise), bold: false });
    }
  }

  summaryLines.push(
    { label: "Shipping charges:", value: formatINRAscii(invoice.shipping_paise), bold: false },
    { label: "Grand Total:", value: formatINRAscii(invoice.total_paise), bold: true }
  );

  const summaryHeight = summaryLines.length * 18 + 8;

  page.drawRectangle({
    x: summaryBoxX,
    y: currentY - summaryHeight,
    width: summaryBoxWidth,
    height: summaryHeight,
    borderWidth: 0.75,
    borderColor: COLOR_BORDER,
    color: rgb(0.97, 0.98, 1),
  });

  let sumY = currentY - 15;
  summaryLines.forEach((line, idx) => {
    const isTotal = idx === summaryLines.length - 1;
    page.drawText(line.label, {
      x: summaryBoxX + 8,
      y: sumY,
      size: isTotal ? 8.5 : 7.5,
      font: line.bold ? helveticaBold : helvetica,
      color: isTotal ? COLOR_ACCENT : COLOR_BLACK,
    });

    drawRightText(
      line.value,
      PAGE_WIDTH - MARGIN - 8,
      sumY,
      line.bold ? helveticaBold : helvetica,
      isTotal ? 9 : 8,
      isTotal ? COLOR_ACCENT : COLOR_BLACK
    );

    sumY -= 18;
  });

  // Amount In Words (Left Column beside Summary Box)
  const wordsX = MARGIN;
  const wordsWidth = summaryBoxX - MARGIN - 12;

  page.drawText("Amount Chargeable in Words:", {
    x: wordsX,
    y: currentY - 12,
    size: 7.5,
    font: helveticaBold,
    color: COLOR_MUTED,
  });

  const amountInWords = amountToWordsINR(invoice.total_paise);
  page.drawText(amountInWords, {
    x: wordsX,
    y: currentY - 24,
    size: 8,
    font: helveticaBold,
    color: COLOR_BLACK,
    maxWidth: wordsWidth,
  });

  page.drawText("Payment Settlement Status: Confirmed", {
    x: wordsX,
    y: currentY - 44,
    size: 7.5,
    font: helvetica,
    color: rgb(0.1, 0.6, 0.25),
  });

  const paymentMethodLabel = (() => {
    switch ((invoice.payment_method || "").toLowerCase()) {
      case "upi": return "UPI";
      case "card": return "Card (Credit / Debit)";
      case "netbanking": return "Net Banking";
      case "wallet": return "Wallet";
      case "emi": return "EMI";
      case "paylater": return "Pay Later";
      default: return invoice.payment_method ? invoice.payment_method : "Online";
    }
  })();

  page.drawText(`Mode of Payment: ${paymentMethodLabel}`, {
    x: wordsX,
    y: currentY - 56,
    size: 7.5,
    font: helvetica,
    color: COLOR_MUTED,
  });

  currentY -= Math.max(summaryHeight, 64) + 24;

  // ==========================================
  // 5. STATUTORY DECLARATIONS & SIGN-OFF
  // ==========================================
  page.drawLine({
    start: { x: MARGIN, y: currentY },
    end: { x: PAGE_WIDTH - MARGIN, y: currentY },
    thickness: 0.75,
    color: COLOR_BORDER,
  });

  currentY -= 14;

  const bottomSectionY = currentY;

  // Right Column: Authorized Signatory (aligned strictly to right edge, clean spacing)
  const rightAlignX = PAGE_WIDTH - MARGIN;

  drawRightText(`For ${invoice.seller.legal_name}`, rightAlignX, bottomSectionY, helveticaBold, 8, COLOR_BLACK);
  drawRightText("Authorized Signatory", rightAlignX, bottomSectionY - 26, helvetica, 7, COLOR_MUTED);
  drawRightText(
    "(Computer Generated Invoice - No physical signature required)",
    rightAlignX,
    bottomSectionY - 36,
    helvetica,
    5.5,
    COLOR_MUTED
  );

  // Footer stamp
  page.drawText("RoboForge", {
    x: MARGIN,
    y: MARGIN / 2,
    size: 6,
    font: helvetica,
    color: COLOR_MUTED,
  });

  return await pdfDoc.save();
}

/**
 * Generates an on-demand Credit Note / Adjustment Document PDF.
 * Implements the required credit-note/adjustment document data model.
 */
export async function generateCreditNotePdf(creditNote: CreditNoteSnapshot): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let currentY = PAGE_HEIGHT - MARGIN;

  const drawRightText = (text: string, rightX: number, y: number, font: typeof helvetica, size: number, color: RGB = COLOR_BLACK) => {
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: rightX - textWidth, y, size, font, color });
  };

  // Header
  page.drawText("CREDIT NOTE / ADJUSTMENT VOUCHER", {
    x: MARGIN,
    y: currentY - 14,
    size: 15,
    font: helveticaBold,
    color: rgb(0.8, 0.15, 0.15),
  });

  page.drawText("STATUTORY ADJUSTMENT DOCUMENT", {
    x: MARGIN,
    y: currentY - 26,
    size: 7,
    font: helveticaBold,
    color: COLOR_MUTED,
  });

  drawRightText(`Credit Note No: ${creditNote.credit_note_number}`, PAGE_WIDTH - MARGIN, currentY - 12, helveticaBold, 10, COLOR_BLACK);
  drawRightText(`Original Invoice: ${creditNote.original_invoice_number}`, PAGE_WIDTH - MARGIN, currentY - 24, helvetica, 8.5, COLOR_MUTED);
  drawRightText(`Date of Issue: ${creditNote.issue_date}`, PAGE_WIDTH - MARGIN, currentY - 36, helvetica, 8.5, COLOR_MUTED);

  currentY -= 48;

  page.drawLine({
    start: { x: MARGIN, y: currentY },
    end: { x: PAGE_WIDTH - MARGIN, y: currentY },
    thickness: 1,
    color: COLOR_BORDER,
  });

  currentY -= 20;

  // Credit Note Details Box
  const boxHeight = 120;
  page.drawRectangle({
    x: MARGIN,
    y: currentY - boxHeight,
    width: CONTENT_WIDTH,
    height: boxHeight,
    borderWidth: 0.75,
    borderColor: COLOR_BORDER,
    color: rgb(0.99, 0.98, 0.98),
  });

  let boxY = currentY - 16;
  page.drawText(`Supplier: ${creditNote.seller.legal_name} (GSTIN: ${creditNote.seller.gstin})`, {
    x: MARGIN + 12,
    y: boxY,
    size: 8.5,
    font: helveticaBold,
    color: COLOR_BLACK,
  });

  boxY -= 14;
  page.drawText(`Customer / Consignee: ${creditNote.buyer.name} (${creditNote.buyer.email})`, {
    x: MARGIN + 12,
    y: boxY,
    size: 8,
    font: helvetica,
    color: COLOR_BLACK,
  });

  boxY -= 14;
  page.drawText(`Order Reference: ${creditNote.order_code}`, {
    x: MARGIN + 12,
    y: boxY,
    size: 8,
    font: helvetica,
    color: COLOR_BLACK,
  });

  boxY -= 16;
  page.drawText(`Adjustment / Refund Reason:`, {
    x: MARGIN + 12,
    y: boxY,
    size: 8,
    font: helveticaBold,
    color: COLOR_MUTED,
  });

  boxY -= 12;
  page.drawText(creditNote.reason, {
    x: MARGIN + 12,
    y: boxY,
    size: 8,
    font: helvetica,
    color: COLOR_BLACK,
    maxWidth: CONTENT_WIDTH - 24,
  });

  boxY -= 20;
  page.drawText(`Credited / Refunded Amount: ${formatINRAscii(creditNote.refund_amount_paise)}`, {
    x: MARGIN + 12,
    y: boxY,
    size: 10,
    font: helveticaBold,
    color: rgb(0.8, 0.15, 0.15),
  });

  currentY -= boxHeight + 30;

  // Signatory
  page.drawText(`For ${creditNote.seller.legal_name}`, {
    x: PAGE_WIDTH - MARGIN - 180,
    y: currentY,
    size: 8,
    font: helveticaBold,
    color: COLOR_BLACK,
  });

  page.drawText("Authorized Signatory (Accounting)", {
    x: PAGE_WIDTH - MARGIN - 180,
    y: currentY - 20,
    size: 7,
    font: helvetica,
    color: COLOR_MUTED,
  });

  return await pdfDoc.save();
}
