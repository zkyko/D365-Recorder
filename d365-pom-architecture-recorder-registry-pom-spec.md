# D365 F&O Automation Architecture

## Recorder → Registry → POM Generator → Spec Generator

> **Goal:** Build a *deterministic*, RSAT-inspired, Leapwork-like automation stack for Dynamics 365 Finance & Operations using Playwright — without depending on an LLM for correctness.

This document defines the exact architecture and the **1:1 mapping** from Microsoft’s RSAT/Task Recorder world into your **Playwright + metadata + codegen** world.

---

## 0. High-Level Concept & 1:1 Mapping

### 0.1 Pipeline Overview

```text
User runs flow in D365
        │
        ▼
[ Recorder ]
  Captures actions + DOM metadata
        │
        ▼
[ NXTR Files (.nxtr) ]
  Structured recordings (JSON/ZIP)
        │
        ▼
[ Registry Builder ]
  Merges NXTR → Page + Control Registry
        │
        ▼
[ POM Generator ]
  Generates D365BasePage + Page Classes + Components
        │
        ▼
[ Spec Generator ]
  Generates Playwright specs (E2E flows) + data files
```

### 0.2 RSAT → Your Framework (1:1 Mapping)

| RSAT / D365 Artifact | Purpose in RSAT World                       | Your Equivalent                               |
| -------------------- | ------------------------------------------- | --------------------------------------------- |
| **.axtr**            | Task Recorder package (zipped XML/JSON)     | **.nxtr** (zipped JSON `recording.json`)      |
| **Recording.xml**    | Step-by-step actions + AOT metadata         | **RecordedActions.json**                      |
| **BPM (LCS)**        | Central store of business processes + steps | **Control & Page Registry** (`registry.json`) |
| **RSAT**             | Playback + Excel-param UI test executor     | **Playwright POM + Spec Generator**           |

Conceptually:

* **AXTR → NXTR**: You define your own richer, JSON-based recording format.
* **Recording.xml → RecordedActions.json**: Same idea, but aligned with Playwright and D365 DOM.
* **BPM → Control Registry**: Instead of BPM hierarchies, you maintain a code-friendly registry of pages & controls.
* **RSAT → POM Generator + Specs**: Instead of Excel + black-box playback, you emit TypeScript POMs and Playwright specs.

---

## 1. Recorder Layer (NXTR)

### 1.1 Responsibilities

The Recorder runs while a user interacts with D365 F&O:

* Observe **every meaningful action**:

  * Navigation (open form/workspace)
  * Clicks, fills, selects, toggles
  * Grid actions (add line, set cell, filter)
  * Dialogs / lookups
* Capture **D365-aware metadata**, not just DOM:

  * `data-dyn-controlname`
  * Associated label text
  * Form name, data source, data field when detectable
* Capture **iframe context**:

  * Which `contentIFrame*` (and nested frames) the element lives in.
* Persist everything as **RecordedActions.json** (inside an NXTR “recording package”).

A key idea from the research: D365 exposes stable attributes like `data-dyn-controlname` and predictable iframe patterns; these should be your primary selectors instead of brittle IDs or XPaths. 

### 1.2 RecordedAction Schema

```ts
export type ActionType =
  | "navigate"
  | "click"
  | "dblclick"
  | "fill"
  | "select"
  | "toggle"
  | "gridAddLine"
  | "gridSetCell"
  | "gridFilter"
  | "openDialog"
  | "confirmDialog"
  | "custom";

export interface LocatorSnapshot {
  dataDynControlName?: string;    // data-dyn-controlname
  ariaLabel?: string;
  ariaRole?: string;
  text?: string;                  // visible text, trimmed
  css?: string;                   // fallback
  xpath?: string;                 // last-resort / debugging
}

export interface ControlMetadata {
  controlId: string;              // canonical ID (e.g. SalesTable.CustAccount)
  label?: string;                 // e.g. "Customer account"
  formName?: string;              // AOT form name if known
  dataSource?: string;            // e.g. "SalesTable"
  dataField?: string;             // e.g. "CustAccount"
  controlType?: string;           // TextBox, Grid, Button, Lookup, etc.
  locatorSnapshot: LocatorSnapshot;
}

export interface FramePathSegment {
  type: "main" | "iframe";
  selector: string;              // e.g. 'iframe[name^="contentIFrame"]'
  indexHint?: number;            // e.g. 0, 1 (for contentIFrame0/1)
}

export interface RecordedAction {
  id: string;
  timestamp: string;

  pageId: string;                  // logical page ID (e.g. "SalesOrderList")
  pageType: "Workspace" | "List" | "Details" | "Dialog";

  framePath: FramePathSegment[];   // path to the element’s frame
  actionType: ActionType;

  control: ControlMetadata;

  value?: string | number | boolean | null;
  description?: string;            // human-readable "Click New"
}
```

### 1.3 NXTR File Format

You can model NXTR as:

```text
MyFlow-CreateSalesOrder.nxtr
 ├── metadata.json     // flow name, author, environment, D365 build
 └── recording.json    // Array<RecordedAction>
```

Optionally zipped into `.nxtr.zip` or just `.nxtr` (zip with custom extension).

**Key property:** This file is your **source of truth** for how a business process behaves in the UI — just like `.axtr` is for RSAT.

---

## 2. Registry Layer (Page + Control Registry)

### 2.1 Purpose

The Recorder gives you *raw, sequential actions per flow*.
The Registry normalizes that into **stable, reusable objects**:

* **Pages**: “Sales Order List”, “Sales Order Details”, “Shipment Builder”…
* **Controls**: “customer account field”, “New button”, “Confirm button”, “Order grid”…

This is your equivalent of **BPM**:

* BPM stores business processes + steps for RSAT.
* Your registry stores page + control metadata for POM generation.

### 2.2 Data Structures

#### Page Registry

```ts
export interface PageRegistryEntry {
  pageId: string;                    // "SalesOrderList"
  pageType: "Workspace" | "List" | "Details" | "Dialog";
  routePatterns: string[];           // URL patterns or menu paths
  formName?: string;                 // AOT form name if known

  frameSignature: {
    mainSelector: string;            // iframe[name^="contentIFrame"]
    // any extra hints to spot active frame (e.g. visibility attributes)
  };

  controlIds: string[];              // references into ControlRegistry
}
```

#### Control Registry

```ts
export type InteractionKind =
  | "click"
  | "fill"
  | "select"
  | "toggle"
  | "gridCell"
  | "gridFilter"
  | "dialog"
  | "lookup";

export interface ControlRegistryEntry {
  controlId: string;            // stable canonical key, e.g. "SalesTable.CustAccount"
  pageId: string;               // parent page

  semanticName: string;         // "customerAccount", "newButton"
  displayLabel?: string;        // "Customer account"

  formName?: string;
  dataSource?: string;
  dataField?: string;
  controlType?: string;         // TextBox, Button, Grid, Lookup, etc.

  framePath: FramePathSegment[]; // default frame path for this control

  locator: {
    strategy: "dataDyn" | "roleName" | "ariaLabel" | "custom";
    selector: string;           // actual Playwright selector string
  };

  interactionKinds: InteractionKind[];
  isDataField?: boolean;        // likely test data (customer, item, qty)
  paramName?: string;           // recommended param name (e.g. "customerAccount")
}
```

#### Registry Container

```ts
export interface Registry {
  pages: Record<string, PageRegistryEntry>;
  controls: Record<string, ControlRegistryEntry>;
}
```

### 2.3 Building the Registry

Algorithm:

1. **Ingest all NXTR recordings** (multiple flows).
2. For each `RecordedAction`:

   * Derive **pageId** (from URL, menu path, formName).
   * Create / update a `PageRegistryEntry` if missing.
   * Derive a stable **controlId**:

     * Prefer `dataSource + "." + dataField` (e.g. `SalesTable.CustAccount`).
     * If not available, fallback to `formName + "." + slug(label)`.
   * Create / update a `ControlRegistryEntry`:

     * Aggregate all `interactionKinds`.
     * Stabilize locator (see selector strategy below).
3. Persist to `registry.json` under `/registry/registry.json`.

### 2.4 Selector Strategy

Use the hierarchy from the research document: 

1. **Primary**: `data-dyn-controlname`

   * `locator: page.locator('[data-dyn-controlname="CustAccount"]')`
2. **Secondary**: `getByLabel("Customer account")`
3. **Tertiary**: `getByRole('button', { name: 'Save' })` for command bar
4. **Anti-patterns**: No full XPath, no fragile IDs.

The registry stores **final resolved selector** and **strategy** so generated POMs don’t need to re-derive.

---

## 3. POM Generator Layer

The POM Generator takes `registry.json` and emits **TypeScript Page Objects** aligned with D365’s architecture.

### 3.1 Base Class: `D365BasePage`

Responsibilities:

* Handle **iframe labyrinth** with Playwright’s `frameLocator`.
* Provide **`waitForNotBusy()`** sync helper to avoid flaky interactions.
* Optionally hold shared helpers (toasts, nav, Copilot, etc.).

Example (simplified):

```ts
// d365-base.page.ts
import { Page, FrameLocator } from "@playwright/test";

export abstract class D365BasePage {
  constructor(protected readonly page: Page) {}

  protected get activeFrame(): FrameLocator {
    // Stateless resolution of active D365 frame
    return this.page.frameLocator('iframe[name^="contentIFrame"]').first();
    // You can enhance this using visibility checks or active-tab hints.
  }

  protected frameFor(control: ControlRegistryEntry): FrameLocator {
    // Use control.framePath if needed, else fallback to activeFrame
    return this.activeFrame;
  }

  async waitForNotBusy(): Promise<void> {
    const spinner = this.page.locator(".ms-Spinner,.processing-overlay,.loader");
    if (await spinner.count()) {
      await spinner.first().waitFor({ state: "detached", timeout: 30000 });
    }

    const workingToast = this.page.locator('text=Working on it...');
    if (await workingToast.isVisible()) {
      await workingToast.waitFor({ state: "detached" });
    }

    // Optional: networkidle or other heuristics
  }
}
```

### 3.2 Component Objects

Use reusable **component POMs** for shared controls:

* `CommandBar` (New, Save, Post, Confirm)
* `D365Grid`
* `LookupControl`
* `SysBoxDialog`

Example: CommandBar (generated + hand-tuned):

```ts
export class CommandBar {
  constructor(private root: FrameLocator) {}

  get newButton() {
    return this.root.getByRole("button", { name: "New" }); // or data-dyn-controlname
  }

  get saveButton() {
    return this.root.getByRole("button", { name: "Save" });
  }

  async clickNew() {
    await this.newButton.click();
  }

  async clickSave() {
    await this.saveButton.click();
  }
}
```

### 3.3 Page Classes from Registry

The generator uses `PageRegistryEntry` + `ControlRegistryEntry[]` to emit pages like:

```ts
// sales-order-details.page.ts
import { D365BasePage } from "../core/d365-base.page";

export class SalesOrderDetailsPage extends D365BasePage {
  // Controls
  get customerAccount() {
    return this.activeFrame.locator('[data-dyn-controlname="CustAccount"]');
  }

  get salesOrderId() {
    return this.activeFrame.locator('[data-dyn-controlname="SalesId"]');
  }

  // Example methods generated per control
  async fillCustomerAccount(customer: string) {
    await this.waitForNotBusy();
    await this.customerAccount.fill(customer);
    await this.customerAccount.press("Tab");
    await this.waitForNotBusy();
  }

  // Derived from pattern in recordings (grouped actions)
  async createSalesOrder(customer: string, item: string, quantity: number) {
    await this.fillCustomerAccount(customer);
    await this.addLine(item, quantity);
    await this.confirmOrder();
  }

  async addLine(item: string, quantity: number) {
    // Use D365Grid component, generated from grid controls in registry
  }

  async confirmOrder() {
    // CommandBar interaction or special confirm button
  }
}
```

#### How Generator Decides What to Emit

1. For each `ControlRegistryEntry`:

   * Emit a getter with proper locator.
   * Emit basic interaction methods:

     * `fillXxx`, `clickXxx`, `selectXxx`, etc.
2. For each **Recorded Flow** (from NXTR):

   * Group actions into **flow methods**:

     * e.g. `createSalesOrder`, `confirmSalesOrder`.
   * Use `paramName` of `isDataField` controls to define method signatures.

> Grouping/pretty naming can be deterministic or optionally enhanced later via LLM, but core generation does **not depend on AI**.

---

## 4. Spec Generator Layer

The Spec Generator converts **flows + POM methods** into executable **Playwright tests**.

### 4.1 Flow Definition

Store derived flows in a JSON format (one step away from a Leapwork-like canvas):

```json
{
  "flowId": "createConfirmSalesOrder",
  "description": "Create + confirm a standard sales order",
  "steps": [
    {
      "page": "SalesOrderListPage",
      "action": "openFromDashboard",
      "params": []
    },
    {
      "page": "SalesOrderListPage",
      "action": "clickNew",
      "params": []
    },
    {
      "page": "SalesOrderDetailsPage",
      "action": "fillCustomerAccount",
      "params": ["${customerAccount}"]
    },
    {
      "page": "SalesOrderDetailsPage",
      "action": "addLine",
      "params": ["${itemId}", "${quantity}"]
    },
    {
      "page": "SalesOrderDetailsPage",
      "action": "confirmOrder",
      "params": []
    }
  ]
}
```

These flows are:

* Generated from NXTR actions + registry.
* Executed using generated POMs.

### 4.2 Test Data Files

Use JSON/CSV/Excel to hold concrete data:

```json
[
  {
    "testName": "Create standard SO for US-004 with item D0001",
    "customerAccount": "US-004",
    "itemId": "D0001",
    "quantity": 1
  },
  {
    "testName": "Create SO for DE-001 with item D0002",
    "customerAccount": "DE-001",
    "itemId": "D0002",
    "quantity": 5
  }
]
```

### 4.3 Generated Playwright Spec (Example)

```ts
// create-confirm-sales-order.spec.ts
import { test } from "@playwright/test";
import { SalesOrderListPage } from "../pages/d365/sales-order-list.page";
import { SalesOrderDetailsPage } from "../pages/d365/sales-order-details.page";
import testData from "../data/create-confirm-sales-order.json";

for (const dataRow of testData) {
  test(`Create + confirm sales order: ${dataRow.testName}`, async ({ page }) => {
    const listPage = new SalesOrderListPage(page);
    const detailsPage = new SalesOrderDetailsPage(page);

    // Pre-authenticated state / login handled by test fixture
    await listPage.goto();                 // navigate to All Sales Orders
    await listPage.clickNewSalesOrder();

    await detailsPage.fillCustomerAccount(dataRow.customerAccount);
    await detailsPage.addLine(dataRow.itemId, dataRow.quantity);
    await detailsPage.confirmOrder();

    await detailsPage.assertOrderConfirmed(); // generated or hand-written
  });
}
```

The **Spec Generator**:

1. Reads flow JSON (`flows/create-confirm-sales-order.flow.json`).
2. Reads data JSON (`data/create-confirm-sales-order.json`).
3. Produces `.spec.ts` that:

   * Instantiates relevant POMs.
   * Calls methods in the order defined by the flow.
   * Maps `${parameter}` placeholders to actual data keys.

---

## 5. Putting It All Together

### 5.1 End-to-End Lifecycle

1. **Record a flow** using your Recorder in D365:

   * NXTR file is produced (`MyFlow.nxtr`).
2. **Registry Builder** ingests all NXTRs:

   * Updates `registry.json` with pages + controls.
3. **POM Generator** consumes `registry.json`:

   * Emits/updates `pages/d365/*.page.ts` and shared component classes.
4. **Flow + Spec Generator** consumes:

   * NXTR (for step sequence).
   * Registry (for method mapping).
   * Test data sources.
   * Emits `tests/d365/*.spec.ts`.
5. **Playwright Runner** executes suites:

   * Leverages D365BasePage (iframe handling, waitForNotBusy).
   * Uses stable selectors from registry (e.g. `data-dyn-controlname`).
   * Uses filtering pattern for grids, lookup patterns for references, etc. 

### 5.2 Where AI Can Plug In (Optional Layer)

**Not required**, but possible future upgrades:

* **Naming refiner**: LLM improves method/param/flow names.
* **Flow grouper**: LLM suggests better grouping of low-level actions into business steps.
* **Self-healing**: via Playwright MCP, an LLM can recover when a target changes label but is still logically the same control.
* **Doc Generator**: Generate human-readable documentation from registry + flows.

Core correctness, however, remains **fully deterministic and metadata-driven**.

---

## 6. Summary

* You now have a **clear, implementable architecture** mirroring RSAT’s strengths but using **Playwright, POMs, and JSON**, not Excel and black-box playback.
* The mapping is clean:

  * **AXTR → NXTR**
  * **Recording.xml → RecordedActions.json**
  * **BPM → Control & Page Registry**
  * **RSAT → POM & Spec Generator (Playwright)**
* This design:

  * Leverages **D365 metadata** (`data-dyn-controlname`, grids, lookups, iframe patterns). 
  * Avoids fragile selectors and scrolling.
  * Gives you a foundation to later add **Leapwork-style visual flows** and optional AI enhancements — without depending on AI for the core engine.

You can drop this file straight into your repo as something like:

`/docs/d365-pom-architecture-recorder-registry-pom-spec.md`
