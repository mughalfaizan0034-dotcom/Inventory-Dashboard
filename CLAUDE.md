# Patman Inventory System — Master Architecture & Operational Guide

# Core System Philosophy

Patman must operate as a centralized enterprise inventory and fulfillment platform with strict data consistency across all modules.

Primary priorities:

* inventory accuracy
* centralized calculations
* organization isolation
* secure session handling
* role-based permissions
* operational consistency
* maintainable architecture
* clean scalable codebase

The system should behave like a professional ERP/inventory platform, not a collection of disconnected pages.

---

# Centralized Inventory Calculation Engine

This is the MOST important architectural rule.

Never calculate inventory separately on different pages.

Instead:

1. Load inventory + orders data
2. Normalize data
3. Run all calculations through ONE centralized inventory engine/service
4. Store computed results in shared canonical state
5. Every page consumes the same processed dataset

Pages that MUST use the same source-of-truth:

* Dashboard
* Inventory List
* Orders
* Box Lookup
* Analytics
* Exports
* Reports

Future fixes should happen in ONE calculation layer only.

Never duplicate business logic across pages/components.

Accuracy is more important than instant rendering.

It is acceptable to:

* show loading overlays
* show syncing states
* process calculations before rendering

---

# Upload Architecture

Users:

* download CSV templates
* edit data in spreadsheet software
* upload back as `.txt` tab-delimited files

Reason:
`.txt` uploads support:

* better bulk ingestion
* simpler parsing
* stable large-file processing

System requirements:

* validate required fields
* normalize uploads before calculations
* reject malformed uploads safely
* support large batch processing

---

# Inventory Logic

## Physical Inventory Rules

Only actual fulfilled inventory-backed sales reduce stock.

The following MUST NOT reduce physical inventory:

* phantom units
* phantom orders
* undefined SKU orders
* unknown SKU orders

Remaining stock must NEVER go below zero because of phantom demand.

---

# Phantom Logic

Phantom units are informational analytics/warnings only.

Purpose:

* show oversold demand
* highlight attempted fulfillment beyond stock

Phantom units:

* appear in dashboard analytics
* appear in box lookup
* appear in inventory analytics

Phantom units MUST NOT:

* reduce physical stock
* create negative remaining inventory
* affect available inventory counts

Example:

Initial stock = 1
Units sold = 2
Phantom = 1

Correct:

* Actual Sold = 1
* Remaining = 0
* Phantom = 1

Incorrect:

* Remaining = -1

Never allow negative remaining caused by phantom sales.

---

# Dashboard KPI Logic

All KPIs must come from centralized calculations only.

Correct KPI formulas:

Total Units
= uploaded inventory quantity

Units Sold
= all order quantities

Actual Units Sold
= Units Sold - Phantom Units

Remaining Stock
= Total Units - Actual Units Sold

Phantom Units
= informational warning metric only

Undefined SKU Orders
= orders without valid inventory match

Undefined orders must not reduce stock.

---

# Box Lookup Logic

Users search by:

* part number
* SKU
* UPC

Results show:

* Initial
* Actual Sold
* Phantom
* Remaining

Grouped by:

* SKU
* box allocation

Remaining stock reflects REAL physical inventory only.

Phantom values are informational only.

Never reduce remaining below zero.

---

# Orders Page Logic

Orders page is a fulfillment management module.

It is NOT a phantom management page.

Do NOT:

* mark phantom orders at row level
* filter phantom rows
* assign phantom state to specific orders

Reason:
System cannot reliably determine WHICH oversold order became phantom.

Phantom logic exists ONLY at aggregated inventory analytics level.

---

# Shipped SKU Reassignment Logic

Users can reassign fulfillment SKU from Orders page.

Example:

Original ordered SKU:
ARA1-123-321

Alternative in-stock compatible SKUs:

* ARA2-123-321
* ARA3-123-321

Dropdown rules:

* show only compatible SKUs
* show only IN-STOCK SKUs
* show full SKU values
* exclude unavailable SKUs

Behavior:

Original order history remains unchanged.

Inventory deduction happens ONLY from reassigned shipped SKU.

Example:

Ordered:
ARA1-123-321

Reassigned shipped SKU:
ARA2-123-321

Correct behavior:

* deduct from ARA2-123-321
* do NOT deduct from ARA1-123-321

All related pages must instantly reflect this:

* dashboard
* inventory list
* box lookup
* exports
* analytics

Through centralized calculations only.

---

# Multi-User & Organization Management

The system supports:

* multiple organizations
* multiple users
* role-based permissions
* organization-level isolation

This architecture must be strict and secure.

---

# User Roles

## 1. Admin

Admins can:

* create organizations
* update organizations
* remove organizations
* create users
* update users
* remove users
* assign organizations
* assign user roles
* reset/change passwords
* manage uploads
* manage shipped SKU reassignment
* access all analytics
* access all reports
* manage system settings

Admins have full platform access.

---

## 2. Standard Users

Users can:

* access assigned organizations only
* upload inventory/orders
* manage shipped SKU reassignment
* use operational tools
* download reports
* access analytics

Users CANNOT:

* manage users
* manage organizations
* assign permissions
* change platform security settings

---

## 3. Viewers

Viewers are read-only users.

Viewers can:

* view dashboards
* view reports
* view analytics
* download reports

Viewers CANNOT:

* upload files
* edit shipped SKU
* modify inventory
* modify orders
* manage users
* manage organizations

---

# Organization Isolation & Security

Critical requirement:

Users must NEVER:

* access organizations not assigned to them
* inherit another user session
* view another organization's data
* cross-access protected records

Session handling must be strict.

Implement:

* proper auth isolation
* organization-scoped queries
* organization-level middleware validation
* role validation on every protected route
* secure session invalidation
* token validation
* organization permission checks

This is mandatory for every backend endpoint and frontend state load.

---

# Password & Access Management

If users need:

* password changes
* new organization access
* role changes

They must contact an admin.

Display clear notices inside profile/settings pages.

Only admins can:

* change passwords
* assign organizations
* update permissions

---

# UI & Dashboard Direction

System should resemble a professional ERP platform.

Priorities:

* compact layouts
* responsive sizing
* operational clarity
* clean analytics
* enterprise styling

Avoid:

* oversized cards
* spreadsheet-like dashboards
* duplicated KPI sections
* inconsistent spacing
* excessive scrolling

---

# Dashboard Layout Direction

Dashboard is the centralized control center.

Contains:

* KPI cards
* analytics
* reporting
* operational insights

Use:

* responsive KPI cards
* chart grids
* compact enterprise layout

Avoid:

* table-strip KPI rows
* fake cards
* oversized whitespace

Desktop should minimize scrolling.

---

# Performance & Responsiveness

Use:

* CSS grid
* minmax()
* flex layouts
* viewport-aware sizing
* internal scroll regions

Avoid:

* giant fixed heights
* excessive page scroll
* overflowing layouts

---

# Uploads Page

Upload controls should:

* remain sticky
* stay compact
* support fast operational workflows

Guide panel:

* displayed beside uploads
* compact
* scroll internally if needed

---

# Box Lookup Page

Dedicated operational page.

Requirements:

* sticky search
* empty state illustration
* proper no-results state
* responsive result layout

---

# Engineering & Maintenance Standards

Continuously audit:

* backend structure
* BigQuery schema
* API consistency
* legacy code
* unused CSS
* dead routes
* obsolete calculations

Clean old architecture aggressively after refactors.

Never allow:

* duplicate calculation paths
* outdated KPI logic
* legacy UI wrappers
* abandoned routes/components

---

# BigQuery & Backend Maintenance

Regularly validate:

* schema integrity
* organization isolation
* inventory consistency
* auth/session behavior
* permissions
* query performance

Ensure:

* migrations remain clean
* no stale columns
* no orphaned data structures
* no conflicting inventory logic

---

# Deployment & QA Rules

After every major change:

1. validate KPI consistency
2. validate inventory accuracy
3. validate organization isolation
4. validate role permissions
5. validate shipped SKU reassignment
6. validate uploads
7. validate exports
8. validate responsive layouts

Then:

* clean legacy code
* push changes to git
* redeploy backend/frontend if required
* verify production behavior

Accuracy, consistency, and maintainability are the highest priorities.
