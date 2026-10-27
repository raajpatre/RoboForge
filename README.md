# RoboShop-Forge 🤖⚡

> **Industrial Robotics & Automation Hardware Storefront**  
> Engineered for research laboratories, aerospace prototyping, and automation engineering teams. Built with Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Supabase (PostgreSQL), and Razorpay Standard Checkout.

---

## Table of Contents

1. [Architecture & System Tenets](#architecture--system-tenets)
2. [Quick Start (Local Development)](#quick-start-local-development)
3. [Supabase Database & Migrations](#supabase-database--migrations)
4. [Initial Admin Account Provisioning](#initial-admin-account-provisioning)
5. [Razorpay Test Mode Integration](#razorpay-test-mode-integration)
6. [Razorpay Webhook Configuration](#razorpay-webhook-configuration)
7. [Configurable Business, Policies & Tax Modes](#configurable-business-policies--tax-modes)
8. [Vercel Production Deployment](#vercel-production-deployment)
9. [Automated Test Suite & Quality Gates](#automated-test-suite--quality-gates)
10. [Live-Launch Fail-Closed Checklist](#live-launch-fail-closed-checklist)

---

## Architecture & System Tenets

RoboShop-Forge is engineered around strict reliability, security, and statutory compliance principles:

- **Server-Authoritative Integer Math:** All monetary figures, order subtotals, GST components, and shipping fees are calculated as integer paise (`1 INR = 100 paise`). Browser-submitted prices, discounts, and totals are never trusted.
- **Atomic 15-Minute Inventory Holds:** Checkout creation reserves stock with a 15-minute TTL using PostgreSQL row-level pessimistic locking (`FOR UPDATE` RPC: `reserve_stock_for_order`). Unpaid orders release held inventory automatically.
- **Zero-PII Public Order Tracking (`/track`):** Public lookups require only the cryptographically secure 128-bit tracking code generated at checkout (`RBF-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX`). The public tracking endpoint returns fulfillment states and item names while strictly withholding customer names, email addresses, phone numbers, and physical delivery addresses.
- **Immutable Invoicing with 0 PDF Bytes in DB:** Tax invoices and credit notes are captured as immutable JSON snapshots in PostgreSQL upon payment confirmation. Downloadable PDF bytes are generated on-demand using `@pdf-lib`, guaranteeing 0 binary bytes pollute the primary relational store.
- **Pre-Shipment Cancellation & Exactly-Once Restocking:** Administrative cancellation is restricted to orders in `Processing` state. Orders that have reached `Shipped` or `Delivered` cannot be cancelled. Cancelling paid orders automatically initiates a Razorpay refund, generates a formal Credit Note snapshot, and safely restocks inventory exactly once.
- **Fail-Closed Live Mode Guard:** If `PAYMENT_MODE=live` is configured without verified statutory seller information, valid GST registration, reviewed policies, or production Razorpay credentials, the server halts all payment creation immediately.

---

## Quick Start (Local Development)

### 1. Prerequisites
- **Node.js:** `v20.x` or later (LTS recommended)
- **Package Manager:** `npm` (v10+)
- **Git**

### 2. Installation
```bash
git clone https://github.com/your-username/roboshop-forge.git
cd roboshop-forge
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

> **Offline / Demonstrator Note:**  
> By default, `.env.example` points to `https://placeholder.supabase.co` and uses `rzp_test_placeholder`. RoboShop-Forge includes an in-memory test store with verified robotics seed hardware, allowing full storefront browsing, cart management, checkout emulation, tracking, and invoice generation without needing external database or gateway connections.

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Supabase Database & Migrations

For persistent multi-user staging or production environments, connect to a PostgreSQL instance via Supabase.

### 1. Create a Supabase Project
1. Log in to [https://supabase.com](https://supabase.com) and create a new project.
2. Under **Project Settings -> API**, copy:
   - **Project URL**
   - **anon / public key**
   - **service_role key** (server-only; secret)

### 2. Apply Migrations
Execute the version-controlled SQL files in `supabase/migrations/` in chronological order using the Supabase SQL Editor or Supabase CLI:

```bash
# Using Supabase CLI:
supabase db push
```

The migrations establish:
- Tables: `products`, `orders`, `order_items`, `stock_reservations`, `invoices`, `refunds`, `payments`, `order_status_history`, `audit_logs`.
- PostgreSQL Sequences: `invoice_serial_seq` with atomic RPC `issue_invoice_serial()`.
- Concurrency Procedures:
  - `reserve_stock_for_order(p_order_id, p_items, p_ttl_minutes)`
  - `consume_stock_for_order(p_order_id)`
  - `release_stock_for_order(p_order_id)`
- Row Level Security (RLS): All direct client inserts/updates to orders, invoices, and payments are revoked; mutations are restricted exclusively to verified server-side actions via `SUPABASE_SERVICE_ROLE_KEY`.

---

## Initial Admin Account Provisioning

The administrative dashboard (`/admin`) is protected by Supabase Auth and an environment allowlist (`ADMIN_EMAILS`).

### 1. Create Staff Account
In the Supabase Dashboard, navigate to **Authentication -> Users** and click **Add User -> Create User**:
- Enter the admin email (e.g., `owner@yourdomain.com`).
- Set a strong password.
- Toggle "Auto Confirm Email" to true.

### 2. Authorize Admin Email in Environment
Add the exact email to the comma-separated `ADMIN_EMAILS` variable in `.env.local` or Vercel:
```env
ADMIN_EMAILS=owner@yourdomain.com,staff@yourdomain.com
```

### 3. Log In to Admin Dashboard
Navigate to [http://localhost:3000/admin/login](http://localhost:3000/admin/login). Upon entering valid credentials, staff can:
- Create, edit, and categorize robotics hardware (`/admin/products`).
- Manage stock allocations and adjust reserve buffers.
- View and filter orders by payment, fulfillment, and refund states (`/admin/orders`).
- Update fulfillment status (`Processing -> Shipped -> Delivered`).
- Execute pre-shipment cancellations, trigger Razorpay refunds, and generate statutory Credit Notes.
- Download authenticated tax invoice PDFs (`/api/admin/orders/[id]/invoice`).

---

## Razorpay Test Mode Integration

RoboShop-Forge uses Razorpay Standard Checkout in Test Mode during development and staging.

### 1. Generate Test API Keys
1. Log in to the [Razorpay Dashboard](https://dashboard.razorpay.com).
2. Toggle the mode switch in the header to **Test Mode**.
3. Go to **Account & Settings -> API Keys** and click **Generate Test Key**.
4. Copy `Key Id` (`rzp_test_...`) and `Key Secret`.

### 2. Configure Environment Variables
```env
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_yourKeyHere
RAZORPAY_KEY_ID=rzp_test_yourKeyHere
RAZORPAY_KEY_SECRET=your_test_key_secret_here
PAYMENT_MODE=test
```

### 3. Test Payment Cards
When checking out in Test Mode:
- **Success Card:** Any 16-digit number starting with `4111 1111 1111 1111`, expiry any future date, CVV `123`, OTP `123456`.
- **UPI:** Enter any valid VPA format (e.g., `success@razorpay`).

---

## Razorpay Webhook Configuration

Webhooks guarantee eventual consistency if a customer closes their browser before signature callback completion.

### 1. Configure Webhook in Razorpay Dashboard
1. In Razorpay Dashboard (Test Mode), navigate to **Account & Settings -> Webhooks -> Add New Webhook**.
2. **Webhook URL:**
   - Production: `https://your-domain.vercel.app/api/webhooks/razorpay`
   - Local Development: Use a tunnel such as `ngrok http 3000` (`https://<ngrok-id>.ngrok-free.app/api/webhooks/razorpay`).
3. **Secret:** Generate a strong 32+ character random secret string and enter it in the dashboard.
4. **Active Events to Subscribe:**
   - `payment.captured`
   - `payment.failed`
   - `refund.created`
   - `refund.processed`

### 2. Save Secret in Environment
```env
RAZORPAY_WEBHOOK_SECRET=your_strong_webhook_secret_here
```

### 3. Signature & Idempotency Guarantees
- The webhook endpoint verifies HMAC SHA256 signatures over the exact raw UTF-8 body.
- Processed event IDs are persisted in `webhook_events`. Duplicate deliveries return `200 OK` with `{ status: "already_processed" }` without re-executing state transitions or double-crediting invoices.
- Amount and currency are strictly verified against expected order paise.

---

## Configurable Business, Policies & Tax Modes

RoboShop-Forge does not hardcode fictitious company identities, addresses, or arbitrary tax percentages. All operational and statutory metadata is dynamically driven via configuration.

### Statutory Entity Details
```env
SELLER_LEGAL_NAME=RoboShop Forge Hardware Lab Pvt Ltd
SELLER_TRADE_NAME=RoboShop Forge
SELLER_EMAIL=support@yourdomain.com
SELLER_PHONE=+919876543210
STORE_SUPPORT_HOURS=Monday - Saturday, 9:00 AM - 6:00 PM IST

SELLER_ADDRESS_LINE1=Industrial Area, 4th Phase, Peenya
SELLER_ADDRESS_LINE2=Plot No. 42
SELLER_CITY=Bengaluru
SELLER_STATE=Karnataka
SELLER_STATE_CODE=29
SELLER_POSTAL_CODE=560058
SELLER_COUNTRY=India
```

### Tax Modes (`SELLER_TAX_MODE`)
RoboShop-Forge supports 3 statutory tax modes:

1. **`gst_registered`** *(Default with valid GSTIN)*
   - Requires valid 15-character Indian GSTIN in `SELLER_GSTIN`.
   - Calculates 18% GST server-side, shows HSN breakdown, and labels documents as **TAX INVOICE** (Original for Recipient).
2. **`unregistered`**
   - For businesses not registered under GST.
   - Calculates ₹0 tax, does not collect GST at checkout, and generates a commercial **BILL OF SUPPLY**.
3. **`composition`**
   - For dealers under the GST Composition Scheme.
   - Generates Bills of Supply with the mandatory statutory disclaimer: *"Composition taxable person, not eligible to collect tax on supplies"*.

```env
SELLER_TAX_MODE=gst_registered
SELLER_GSTIN=29AABCR1234F1Z5
SELLER_PAN=AABCR1234F
```

### Shipping, Cancellation & Refund Timelines
```env
SHIPPING_PROCESSING_DAYS=1 - 2 business days
SHIPPING_TRANSIT_DAYS=3 - 5 business days across India
SHIPPING_PARTNERS=BlueDart Express, Delhivery Freight, DTDC Air Cargo

CANCELLATION_WINDOW=Permitted strictly prior to freight carrier dispatch / shipment
REFUND_TURNAROUND=5 - 7 business days
POLICIES_CONFIRMED=true
```

### Public Policy Pages
The storefront automatically renders and links all statutory policies in the navigation footer and at checkout:
- **About Us:** [`/about`](file:///Users/raaj.dev/Documents/AntiGravity/RoboShop-Forge/src/app/about/page.tsx)
- **Contact Desk & Grievance Officer:** [`/contact`](file:///Users/raaj.dev/Documents/AntiGravity/RoboShop-Forge/src/app/contact/page.tsx)
- **Terms and Conditions:** [`/terms`](file:///Users/raaj.dev/Documents/AntiGravity/RoboShop-Forge/src/app/terms/page.tsx)
- **Privacy Policy (Zero-PII Architecture):** [`/privacy`](file:///Users/raaj.dev/Documents/AntiGravity/RoboShop-Forge/src/app/privacy/page.tsx)
- **Shipping & Delivery Policy:** [`/shipping-policy`](file:///Users/raaj.dev/Documents/AntiGravity/RoboShop-Forge/src/app/shipping-policy/page.tsx)
- **Cancellation & Refund Policy:** [`/cancellation-refund-policy`](file:///Users/raaj.dev/Documents/AntiGravity/RoboShop-Forge/src/app/cancellation-refund-policy/page.tsx)

---

## Vercel Production Deployment

### 1. Push to Remote Git Repository
Ensure all code is committed. Secrets in `.env*` are automatically excluded by `.gitignore`.

### 2. Import into Vercel
1. In the Vercel Dashboard, click **Add New -> Project**.
2. Select your repository and choose **Next.js** framework preset.

### 3. Add Production Environment Variables in Vercel
In **Project Settings -> Environment Variables**, configure:

| Variable Name | Required Environment | Description |
|---|---|---|
| `NODE_ENV` | Production | Set to `production` |
| `NEXT_PUBLIC_APP_URL` | Production | Canonical HTTPS domain (e.g. `https://roboshopforge.com`) |
| `NEXT_PUBLIC_SUPABASE_URL` | All | Production Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Public Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production (Secret) | Server-only Supabase service role key |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Production | Razorpay Key ID |
| `RAZORPAY_KEY_ID` | Production | Razorpay Key ID |
| `RAZORPAY_KEY_SECRET` | Production (Secret) | Razorpay Secret |
| `RAZORPAY_WEBHOOK_SECRET` | Production (Secret) | Razorpay Webhook Secret |
| `PAYMENT_MODE` | Production | Keep as `test` until live checklist is completed |
| `ADMIN_EMAILS` | Production | Comma-separated allowlist of admin staff emails |
| `SELLER_LEGAL_NAME` | Production | Registered legal company entity name |
| `SELLER_TRADE_NAME` | Production | Commercial trade name |
| `SELLER_EMAIL` | Production | Official operational support email |
| `SELLER_PHONE` | Production | Operational support phone number |
| `SELLER_ADDRESS_LINE1` | Production | Operating facility address |
| `SELLER_CITY` | Production | Operating city |
| `SELLER_STATE` | Production | Operating state |
| `SELLER_STATE_CODE` | Production | 2-digit Indian State code (e.g. `29` for Karnataka) |
| `SELLER_POSTAL_CODE` | Production | 6-digit postal PIN code |
| `SELLER_TAX_MODE` | Production | `gst_registered`, `unregistered`, or `composition` |
| `SELLER_GSTIN` | Production (if GST registered) | 15-character statutory GST identification number |
| `SELLER_PAN` | Production | Permanent Account Number |
| `SHIPPING_PROCESSING_DAYS` | Production | Bench testing and crating timeline |
| `SHIPPING_TRANSIT_DAYS` | Production | Regional transit duration |
| `SHIPPING_PARTNERS` | Production | Certified logistics partners |
| `CANCELLATION_WINDOW` | Production | Pre-shipment cancellation rule |
| `REFUND_TURNAROUND` | Production | Bank refund reflection turnaround |
| `POLICIES_CONFIRMED` | Production | Set to `true` after owner reviews published policies |

### 4. Deploy & Verify
Click **Deploy**. Verify that build output completes cleanly and all 27 routes are generated.

---

## Automated Test Suite & Quality Gates

The test suite covers unit logic, concurrency-safe inventory holds, payment webhooks, signature verification, zero-PII privacy, and administrative fulfillment controls.

### Run All Tests
```bash
npm test
```
*Expected: 25 test files passed, 189/189 tests passing.*

### Run Type Checking
```bash
npx tsc --noEmit
```
*Expected: 0 errors.*

### Run Linting
```bash
npm run lint
```
*Expected: 0 errors, 0 warnings.*

### Validate Production Build
```bash
npm run build
```
*Expected: All static and dynamic server routes compile successfully.*

---

## Live-Launch Fail-Closed Checklist

> [!CAUTION]
> **Keep live payments disabled (`PAYMENT_MODE=test`)** until every item in this checklist has been verified by the store owner and technical lead. Do not assume or claim Razorpay live merchant approval has been granted until formal confirmation is received from Razorpay.

The codebase includes an active fail-closed safety guard (`assertLiveLaunchSafety()`). If `PAYMENT_MODE=live` is enabled while any required configuration is missing or using placeholder data, checkout creation fails immediately.

- [ ] **1. Legal & Statutory Identity**
  - [ ] Real legal company entity name configured in `SELLER_LEGAL_NAME`.
  - [ ] Real registered principal facility address configured in `SELLER_ADDRESS_*`.
  - [ ] Active customer support email configured in `SELLER_EMAIL`.
  - [ ] Active customer telephone line configured in `SELLER_PHONE`.
  - [ ] Statutory Grievance Redressal officer confirmed on the `/contact` page.

- [ ] **2. Tax Registration & Mode Verification**
  - [ ] Tax mode explicitly selected in `SELLER_TAX_MODE` (`gst_registered`, `unregistered`, or `composition`).
  - [ ] If `gst_registered`: 15-character GSTIN verified on the official GST portal and set in `SELLER_GSTIN`.
  - [ ] If `unregistered` or `composition`: Verified that ₹0 tax is collected at checkout and documents are labeled as commercial Bills of Supply.

- [ ] **3. Published Store Policies Review**
  - [ ] About Us page reviewed (`/about`).
  - [ ] Contact Us & Grievance channels reviewed (`/contact`).
  - [ ] Terms and Conditions reviewed (`/terms`).
  - [ ] Privacy Policy reviewed for zero-PII compliance (`/privacy`).
  - [ ] Shipping & Delivery timelines verified with freight carriers (`/shipping-policy`).
  - [ ] Pre-shipment cancellation rules and refund turnaround verified (`/cancellation-refund-policy`).
  - [ ] `POLICIES_CONFIRMED=true` explicitly set in environment variables.

- [ ] **4. Razorpay Production Activation & Keys**
  - [ ] Merchant KYC submitted and formally approved by Razorpay.
  - [ ] Switch header to **Live Mode** in Razorpay Dashboard.
  - [ ] Generate Live Key ID (`rzp_live_...`) and Live Key Secret.
  - [ ] Update `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_ID`, and `RAZORPAY_KEY_SECRET`.
  - [ ] Configure live webhook endpoint (`https://<domain>/api/webhooks/razorpay`) with secret `RAZORPAY_WEBHOOK_SECRET`.

- [ ] **5. Database & Security Verification**
  - [ ] Supabase production database instance provisioned (no `placeholder` URLs).
  - [ ] All database migrations applied.
  - [ ] RLS policies active on all tables.
  - [ ] Admin emails allowlisted in `ADMIN_EMAILS`.
  - [ ] SSL/TLS 1.3 certificate active on custom domain.
  - [ ] Security response headers verified (`X-Frame-Options`, `nosniff`, `Cache-Control: no-store` on sensitive routes).

- [ ] **6. Final Cutover**
  - [ ] Set `PAYMENT_MODE=live` in Vercel environment variables.
  - [ ] Perform a live micro-transaction (e.g. ₹10 test order) to verify live capture, immutable invoice issuance, and refund processing.
# RoboForge
