# Threadline Operations

Inventory, procurement, production, and multi-location operations prototype for one online apparel business.

## Architecture

- **Frontend:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4
- **Application API:** Next.js REST route handlers
- **Data and authentication:** Payload 4 on the Figma Make managed backend
- **Admin:** Payload Admin at `/admin`

The project began as an empty React/Vite scaffold. Enabling the Figma Make backend transitioned it to the platform-managed Next.js + Payload runtime. That runtime owns its database adapter, authentication bootstrap, storage, and deployment configuration, so a parallel Express/Prisma/Supabase stack cannot be added without breaking the connected environment. The implemented boundaries remain separated: routes and route-private UI under `src/app/(frontend)`, thin REST boundaries under `src/app/(frontend)/api`, server-only services under `src/backend`, framework-independent business rules under `src/domain`, and Payload schemas under `src/collections`. See `src/README.md` for the dependency map.

## Included workflows

- Separate staff authentication with HTTP-only app sessions
- Administrator, inventory, sales, procurement, and manager roles
- Categories, products, size/color variants, unique SKUs, prices, and costs
- Server-owned quantity-on-hand fields and immutable inventory transactions
- Sales, sale items, cancellations/returns data model
- Suppliers, lead time, variant availability, and supplier unit cost
- Purchase-order statuses, manager decisions, item-level ordered/received quantities, and multiple receipts
- Low-stock views, reorder suggestions, movement classes, dashboard, and reports
- Responsive role-aware staff interface with loading-safe empty states
- Multi-location and 3PL inventory balances, stock transfers, and location access
- Raw materials, material allocation, work-order stages, and finished-goods receiving
- Style–color–size matrix with broken-size-run and replenishment workflows
- Mobile barcode/RFID scanner prototype with success, duplicate, mismatch, and manual-entry states
- Planning, landed-cost estimation, and explicitly demo-only integration connection states

## Local setup

The Figma Make development server is managed automatically. For a local clone:

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local` only to configure the public currency display. Figma Make injects all Payload backend variables; do not add database credentials or platform secrets manually.

## Demo accounts

All demo accounts use the password `ThreadlineDemo!2026`.

| Role                   | Email                         |
| ---------------------- | ----------------------------- |
| Administrator          | `admin@threadline.demo`       |
| Inventory staff        | `inventory@threadline.demo`   |
| Sales staff            | `sales@threadline.demo`       |
| Procurement staff      | `procurement@threadline.demo` |
| Manager / Owner        | `manager@threadline.demo`     |
| Production / Warehouse | `production@threadline.demo`  |

Demo data was inserted through the installed Payload CLI after schema discovery and verified with fresh reads. It includes three products, six variants, four locations, ten per-location balances, two stock transfers, four materials, three work orders, five prototype-only integration states, two suppliers, three sales, two purchase orders, one partial receipt, and inventory transactions.

## Prototype honesty

Shopify, WooCommerce, wholesale, accounting, CRM, barcode, and RFID surfaces are visual prototype workflows. They do not authenticate with, send data to, receive data from, or sync with any external service or hardware. Every integration surface is labeled with `Demo`, `Prototype only`, or `Not connected`.

## Commands

```bash
pnpm test                 # domain-rule tests
pnpm exec tsc --noEmit   # TypeScript
pnpm run build           # production build
pnpm run format          # format source
figma make verify-deploy # production delivery verification
```

## Inventory calculations

Reorder suggestions use:

```text
ceil((units sold in last 30 days / 30) × supplier lead-time days
     + safety stock
     - quantity on hand
     - outstanding purchase quantity)
```

The result cannot be negative. Staff review and edit suggestions; the system never places orders automatically.

Movement uses the last 30 days:

- **Fast-moving:** 10 or more units sold
- **Normal:** 3–9 units sold
- **Slow-moving:** 0–2 units sold

These are transparent configurable operating assumptions, not AI forecasting.

## Reliability notes

- Password hashing and token validation are handled by Payload authentication.
- Collection access rules enforce roles server-side; navigation visibility is only a secondary UI convenience.
- Important operational collections do not allow hard deletion.
- Stock cannot be edited through ordinary variant updates.
- Domain rules reject negative stock, duplicate cancellation effects, excessive returns, unexplained adjustments, invalid purchase-order transitions, and over-receiving.

### Platform limitation

The connected Figma-managed Payload adapter currently returns `null` when a multi-operation database transaction is requested. The REST mutation endpoint therefore validates all quantities, roles, statuses, and required values before its first write and applies writes in dependency order, but it cannot guarantee atomic rollback across several documents in this environment. Moving this endpoint to a self-managed PostgreSQL adapter with transaction support is required before production use where strict multi-record atomicity is mandatory.
#
