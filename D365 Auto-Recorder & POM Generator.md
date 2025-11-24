D365 F&O Automation Architecture & Implementation Guide1. Global Context: D365 Finance & OperationsWe are building an automation engine specifically for Microsoft Dynamics 365 Finance & Operations.D365 F&O is NOT a standard HTML website. It behaves like a desktop application running inside a browser.Critical D365 Constraints (MUST FOLLOW)Iframe Hell: The application is nested deep inside iframes. The main content usually lives in iframe[name^='b'] or iframe[data-dyn-role='contentFrame']. All locators must be frame-aware.The "Busy" State: D365 is heavily asynchronous. Standard Playwright auto-waits are insufficient. We must implement a custom waitForNotBusy() that checks for D365-specific loading indicators.Virtualization: Grids in D365 use row virtualization. You cannot await page.locator('tr').all() because only visible rows exist in the DOM.Blur Events: Input fields often require a Tab key press or a click outside to trigger validation/calculation logic.2. Architecture OverviewPhase 1: The Base Layer (Hardening)Before generating code, we must implement D365BasePage and d365-utils.ts.waitForNotBusy(): Checks for .d365-spinner, [aria-busy="true"], and disabled action panes.Frame Handling: A getter that automatically resolves the correct shell/content frame.Phase 2: Method #1 (POM Generation)Input: RecordedStep[] (from our recorder engine).Output: A .ts Page Object Model class.Rules:No Hardcoded Data: Methods accept parameters (e.g., fillCustomer(account: string)), not values.Semantic Naming: Derive method names from actions (e.g., confirmSalesOrder instead of clickButton5).D365 Locators: Prioritize data-dyn-controlname and aria-label over CSS classes or opaque IDs.Phase 3: Method #2 (Spec Generation)Input: A JSON Data file (Array of Test Objects) + The Generated POM.Output: A Playwright .spec.ts file.Logic:Import the JSON file.Iterate through the array (for const data of dataSet).Instantiate the POM.Map JSON keys to POM method arguments.3. Implementation Details for CursorA. The waitForNotBusy LogicImplementation must look for these specific D365 indicators:async function waitForNotBusy(page: Page) {
  // 1. Wait for global spinner to detach
  await page.locator('.d365-spinner, #SysLoading').waitFor({ state: 'detached' });
  
  // 2. Wait for form "Processing" overlay
  await page.locator('.modal-backdrop.processing').waitFor({ state: 'detached' });
  
  // 3. Short buffer for UI settling
  await page.waitForTimeout(300);
}
B. POM Structure (Method #1)The generator must produce classes structure like this:export class SalesOrderPage extends D365BasePage {
  // Locators defined in constructor with Frame handling
  constructor(page: Page) {
    super(page);
    this.custAccount = this.contentFrame.getByRole('textbox', { name: 'Customer account' });
  }

  // Methods are Atomic and Semantic
  async fillCustomerAccount(value: string) {
    await this.waitForNotBusy(); 
    await this.custAccount.fill(value);
    await this.custAccount.press('Tab'); // CRITICAL for D365 validation
    await this.waitForNotBusy();
  }
}
C. Spec Generator Logic (Method #2)The generator reads a JSON file and writes:import dataSet from './data/salesOrderData.json';
import { SalesOrderPage } from './pages/SalesOrderPage';

test.describe('Sales Order Data Driven', () => {
  for (const data of dataSet) {
    test(`Create SO: ${data.testCaseId}`, async ({ page }) => {
      const pom = new SalesOrderPage(page);
      
      // The generator maps JSON keys to Method calls
      await pom.fillCustomerAccount(data.customerAccount);
      await pom.addItem(data.itemId, data.qty);
      await pom.confirm();
    });
  }
});
D. Grid Handling StrategyWhen generating code for Grids:Do NOT generate nth-child selectors.Generate a helper method selectRowByValue(columnName, value).Use the "Filter" header in D365 if available, rather than scanning all rows (due to virtualization).4. Required Files to Create/Editsrc/utils/d365-base.ts: The abstract base class.src/generators/pom-generator.ts: The logic to write the class string.src/generators/spec-generator.ts: The logic to write the test string.src/types/recorder-types.ts: Definitions for RecordedStep.