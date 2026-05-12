# Core Architecture & Inventory Logic Guide

## Core System Direction

This system must follow a single centralized inventory calculation architecture.

Do NOT calculate inventory independently on different pages/components.

Instead:

1. Load inventory + orders once after login/upload
2. Run all calculations through one centralized inventory engine/service
3. Store computed metrics in shared normalized state/data models
4. Every page must consume the same computed dataset

This is critical to prevent KPI mismatches and inconsistent inventory values across:

* Dashboard
* Orders
* Inventory List
* Box Lookup
* Analytics
* Exports

Consistency and data accuracy are the highest priorities.

It is acceptable to show:

* loading state
* processing indicator
* syncing overlay

while centralized calculations complete.

Never prioritize instant rendering over accuracy.

---

# Upload Architecture

Users will:

* download CSV templates
* edit inventory/orders in spreadsheet software
* upload files back in `.txt` format

Reason:
`.txt` tab-delimited uploads support easier bulk processing and more stable parsing for large datasets.

System requirements:

* support large uploads efficiently
* normalize uploaded data before calculations
* validate required columns before import
* reject malformed uploads safely

---

# Inventory Logic

## Physical Inventory Rules

Only actual fulfilled inventory-backed sales reduce stock.

The following should NEVER reduce physical inventory:

* phantom units
* phantom orders
* unknown SKU orders
* undefined SKUs

Remaining stock must NEVER go below 0 due to phantom demand.

---

# Phantom Logic

Phantom units are analytics/warning indicators only.

They exist to show:

* oversold demand
* attempted fulfillment beyond stock

Phantom units should:

* appear in analytics
* appear in box lookup
* appear in dashboard summaries

But phantom units must NOT:

* reduce physical inventory
* make remaining inventory negative
* affect SKU stock availability

Example:

Initial stock = 1
Units sold = 2
Phantom = 1

Correct behavior:

Actual units sold = 1
Remaining stock = 0
Phantom units = 1

Incorrect behavior:
Remaining = -1

Never allow negative remaining inventory caused by phantom sales.

---

# Dashboard KPI Logic

Use centralized calculations only.

Correct KPI behavior:

Total Units
= total uploaded inventory

Units Sold
= all order quantities

Actual Units Sold
= Units Sold - Phantom Units

Remaining Stock
= Total Units - Actual Units Sold

Phantom Units
= warning metric only

Undefined SKU Orders
= orders with no valid inventory match

Undefined/unknown orders must not reduce inventory.

---

# Box Lookup Logic

Users search by:

* part number
* SKU
* UPC

Results must show:

* Initial
* Actual Sold
* Phantom
* Remaining

Grouped by:

* box/SKU allocation

Remaining stock in box lookup must reflect actual physical inventory only.

Phantom values should be informational only.

Never allow phantom calculations to reduce remaining below zero.

---

# Orders Page Logic

Orders page is fulfillment management, not analytics.

Do NOT manage phantom orders at row level.

No phantom tagging/filtering logic per order row.

---

# Shipped SKU Reassignment

Users can change fulfillment SKU from the Orders page.

Example:

Original ordered SKU:
ARA1-123-321

Same part exists in other boxes:

* ARA2-123-321
* ARA3-123-321

The dropdown should:

* show only IN-STOCK compatible SKUs
* show full SKU values
* exclude out-of-stock alternatives

When reassigned:

Original order SKU remains in order history.

But inventory deduction must occur from the reassigned shipped SKU only.

Example:

Original ordered SKU:
ARA1-123-321

Shipped SKU changed to:
ARA2-123-321

Correct behavior:

* deduct inventory from ARA2-123-321
* do NOT deduct inventory from ARA1-123-321

This reassignment must update:

* dashboard KPIs
* inventory list
* box lookup
* exports
* analytics

All through centralized calculations only.

---

# Critical Engineering Requirement

Before building UI pages:

1. Build centralized inventory calculation engine first
2. Normalize all inventory/order relationships
3. Generate shared computed metrics
4. Feed all pages from the same source-of-truth dataset

Never duplicate calculation logic across pages.

Future fixes should happen in ONE centralized calculation layer, not page-by-page.

---

# UI/UX Direction

System should behave like a professional ERP/inventory management platform.

Priorities:

* consistency
* compact layouts
* responsive sizing
* operational clarity
* enterprise-style dashboards

Avoid:

* duplicated calculations
* inconsistent KPIs
* oversized UI elements
* spreadsheet-like layouts pretending to be dashboards

---

# Final Requirement

After every change:

* validate dashboard values
* validate inventory list values
* validate orders page values
* validate box lookup values
* validate exports

All numbers must match the centralized inventory engine exactly.
