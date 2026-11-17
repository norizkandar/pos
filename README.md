# Eonix POS — Starter App

A responsive point-of-sale starter for small retail businesses, cafes, boutiques and service counters.

## Stack
- Frontend: HTML, CSS, vanilla JavaScript
- Hosting: GitHub Pages
- Backend: Supabase Auth + Postgres + Row Level Security
- No separate Node server required for this starter

## Included
- Owner sign-in and account creation
- Business workspace and currency setting
- Product catalogue, SKU/barcode field, stock quantities and low-stock alerts
- Checkout cart, optional customer, discount amount and payment-method recording
- Sales history, simple receipt view/print and CSV export
- Customer directory
- Overview and 7-day/monthly sales summaries
- Responsive layout and dark/light theme switcher
- Supabase schema with RLS, member/role and branch foundation

## Setup
1. Create a Supabase project.
2. Open **SQL Editor** and run `supabase/schema.sql`.
3. In **Project Settings → API**, copy the Project URL and anon/public key.
4. Paste both into `assets/js/config.js`. Never use the `service_role` key in frontend code.
5. Upload the project files to a GitHub repository.
6. In GitHub, open **Settings → Pages**, select the branch and root folder, then save.
7. Open the published site, create an owner account and sign in.

## Important limitations before real-world use
This is a functional starter, not a certified or production-hardened POS.
- Checkout currently inserts the sale, inserts sale items, then updates stock as separate requests. A production release should move checkout into a single Postgres RPC or trusted server function with transaction locking, stock validation, and rollback.
- Payment options only record the method selected. This app does **not** process card, FPX, e-wallet or online payments and does not collect card details.
- Receipt printing uses the browser print dialog. No thermal printer integration is included.
- Staff and branch tables/policies are groundwork; staff invitation, granular permissions and branch-specific inventory UI are not implemented yet.
- Tax configuration, refunds/void workflow, barcode scanner hardware integration, offline mode, cash drawer and accounting integrations are future upgrades.
- For a business deployment, test RLS with separate owner/staff accounts, add backups/monitoring, and have the checkout database function reviewed.

## Suggested next upgrade
Build a secure `complete_sale` Postgres RPC that checks current product prices and stock, inserts the receipt and line items, and deducts stock atomically. Then add manager/cashier screens and branch selection.
