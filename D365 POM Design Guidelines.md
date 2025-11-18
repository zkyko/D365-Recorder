D365 POM Design Guidelines

For Playwright-based automated testing of Dynamics 365 Finance & Operations

📘 Purpose

This document defines the official guidelines for designing, generating, and maintaining Page Object Models (POMs) for automated testing of Dynamics 365 Finance & Operations (F&O) using Playwright.

Our automation framework must scale to 500–600+ test cases, be maintainable by multiple team members, and integrate with auto-generated POMs from our Recorder Tool.
These guidelines ensure consistency, stability, and long-term maintainability.

1. Understanding D365 F&O UI Structure (from Microsoft UX Patterns)

D365 F&O UI is not free-form HTML — it is built on a set of official form patterns, documented by Microsoft as the foundation for all F&O screens.

These patterns define:

Layout structure

Control behavior

Naming consistency

Interaction rules

1.1 Major D365 Form Patterns
Pattern	Description	Examples
List Page	Browse & select records	All sales orders, All customers
Details Master/Details Transaction	Header + lines workflow forms	Sales order details, Purchase order
Simple List or List & Details	Lightweight lists with a side pane	Charges, Parameters
Workspace	Dashboard with tiles, work queues, links	Sales order processing workspace
Dialog / Drop Dialog	Popups with actionable fields	Posting dialog, Filter dialog, Date selection
Table-of-Contents Form	Setup / configuration with left TOC	AR Parameters, Inventory Parameters

Understanding these patterns is crucial because our POMs map directly to these patterns.
A list page behaves differently from a details page, so each needs unique POM logic.

2. POM Architecture Strategy for D365

A clean POM design uses a three-layer architecture:

Test Scenarios (flows)
    ↓
Page Objects (D365 form patterns)
    ↓
UI Components (common reusable widgets)

2.1 Layer 1 — Test Scenarios

This is where business flows live:

Examples:

Create & Confirm Sales Order

Create RMA

Post Packing Slip

Process Shipment in Koerber

Generate Customer Invoice

Test files should never contain locators or UI actions.
They simply orchestrate POM methods.

2.2 Layer 2 — Page Objects (aligned to D365 form patterns)

Each major D365 form becomes one dedicated POM class:

AllSalesOrdersListPage

SalesOrderDetailsPage

SalesOrderProcessingWorkspace

PackingSlipPostingDialog

AccountsReceivableParametersPage

Each POM contains:

Stable locators (generated)

Action methods (hand-written or generated)

No business logic — only UI interactions

POMs follow Microsoft’s form patterns:

Examples:

List Page POM

openModule()

filterGrid(column, value)

openRecord(orderNumber)

Details Page POM

setCustomer()

addLine()

confirmOrder()

Dialog POM

setPostingParameters()

clickOK()

2.3 Layer 3 — Components

Reusable building blocks extracted from F&O UI:

GridComponent → for SalesLine/InventTrans grids

LookupDialogComponent → Customer/Item lookup

ActionPaneComponent → New/Edit/Delete buttons

MessageBarComponent → Info/warning/error messages

DropDialogComponent → Parameter dialogs

NavigationPaneComponent → Left module navigation

Breaking these into components:

Prevents duplication across POMs

Makes generator output much cleaner

Gives stability when F&O updates layout

3. Locator Strategy That Scales to 500–600 Tests

To avoid fragile tests, we enforce a strict locator hierarchy.

3.1 Locator Priority Order

Your Recorder Tool must generate locators using this exact order:

1️⃣ ARIA Role + Name (preferred)

D365 uses accessible UI patterns consistently.

Example:

page.getByRole('button', { name: 'New' })
page.getByRole('textbox', { name: 'Customer account' })

2️⃣ getByLabel() (when form controls have labels)
page.getByLabel('Delivery mode')

3️⃣ Role + text
page.getByRole('link', { name: 'All sales orders' })

4️⃣ Text with filters
page.getByText('Confirm', { exact: true })

5️⃣ Custom data-test-id attributes (if available)
page.locator('[data-test-id="sales-order-new-button"]')

6️⃣ CSS/XPath (fallback ONLY)

These must be wrapped centrally and flagged for later improvements.

3.2 Naming conventions for generated locator fields

newButton

customerAccountInput

deliveryModeDropdown

confirmButton

Field → describes TYPE + PURPOSE.

3.3 POM Method Naming Rules

Methods must represent business actions:

clickNew()

setCustomerAccount(value)

selectDeliveryMode(value)

confirmSalesOrder()

Never:

button1Click()

clickElement("//div[3]/span[2]")

3.4 Why this matters at 600+ tests

If you follow this strategy:

All selectors become consistent

Updating a locator updates all 600 tests

POMs stay predictable

Generator can reuse POMs instead of creating duplicates

New tests become “lego pieces” instead of custom scripts

4. How Microsoft Task Recorder & RSAT Concepts Guide Our POM Design

Microsoft’s Task Recorder + RSAT introduce a standard way of thinking about D365 automation.

We borrow their principles but implement them better with Playwright.

4.1 Task Recorder Principles to Adopt
✔ Break business processes into tasks

Create Sales Order

Confirm Order

Post Packing Slip

Invoice

Ship in WMS

Each task maps to:

1 test

Or a reusable test helper

Or a POM method

✔ Steps are sequential and human-readable

Recorder should capture steps like:

"Open All sales orders"

"Click New"

"Enter Customer"

"Add Line"

Your tool should convert these into structured data → then into POM methods.

4.2 RSAT Principles to Adopt

RSAT (Regression Suite Automation Tool) runs recordings as automated tests.
We adopt:

✔ Business-process-driven automation

Tests should represent ERP workflows, not raw UI actions.

✔ Data-driven tests

The POM makes tests reusable; testers plug data in.

✔ Stability over low-level interaction

POM enforces robust selectors.

✔ Shared components across modules

Dialogs, grids, lookups, buttons behave the same across forms.
Perfect for reusable components.

5. Comprehensive POM Structure and Directory Layout

Your POM repo structure should look like:

pages/
  d365/
    base/
      d365-base.page.ts
      dialog.component.ts
      grid.component.ts
      lookup.component.ts
    sales/
      all-sales-orders-list.page.ts
      sales-order-details.page.ts
    inventory/
      on-hand-inquiry.page.ts
    ar/
      ar-parameters.page.ts
tests/
  d365/
    sales/
      create-sales-order.spec.ts
      confirm-sales-order.spec.ts
    rma/
      create-rma.spec.ts
locators/
  sales-order.json
  customer-page.json

6. POM Rules Summary (Quick Checklist)
🔵 Page Object naming

Follow D365 form names and Microsoft UX pattern names.

🔵 Structure POMs along form patterns

List → details → dialog → workspace.

🔵 One POM per major screen

No huge megaclasses.

🔵 Components extract repetitive patterns

Grids, dialogs, navigation.

🔵 No business logic in POM

Only UI logic.

🔵 Always prefer ARIA roles

F&O uses accessibility → this is gold for locators.

🔵 Avoid direct XPaths

Only generator fallback.

🔵 Generated POMs must not duplicate existing methods

Idempotent generation required.

🔵 Tests orchestrate POMs

Not vice versa.

7. Example: Full End-to-End POM Flow (D365 Create & Confirm SO)
Test (Flow Level)
test('Create & Confirm SO', async ({ page }) => {
  const list = new AllSalesOrdersListPage(page);
  const details = new SalesOrderDetailsPage(page);

  await list.goto();
  await list.clickNew();

  await details.setCustomer('US-001');
  await details.addLine('D0001', 5);
  await details.confirmOrder();
});

POMs
List Page POM
export class AllSalesOrdersListPage extends D365BasePage {
  async goto() {
    await this.openModule(['Sales and marketing', 'Sales orders', 'All sales orders']);
  }

  async clickNew() {
    await this.page.getByRole('button', { name: 'New' }).click();
  }
}

Details Page POM
export class SalesOrderDetailsPage extends D365BasePage {
  async setCustomer(value: string) {
    await this.page.getByLabel('Customer account').fill(value);
  }

  async addLine(item: string, qty: number) {
    await this.lines.setCellValue(0, 'Item number', item);
    await this.lines.setCellValue(0, 'Quantity', qty.toString());
  }

  async confirmOrder() {
    await this.page.getByRole('button', { name: 'Confirm' }).click();
  }
}

8. Conclusion

These guidelines ensure that our automation framework:

Follows Microsoft’s D365 UI structure

Produces stable, future-proof POMs

Scales to 600+ tests without collapsing

Works perfectly with auto-generation from our Recorder Tool

Mirrors RSAT/Task Recorder philosophy but with more flexibility and modern tooling

This is the foundation of a world-class D365 test automation framework.