const { test, expect } = require('@playwright/test');

const { DashboardPage } = require('../../../pages/d365/sales/dashboard.page');
const { SalesorderdetailspagePage } = require('../../../pages/d365/sales/salesorderdetailspage.page');

// Helper to wait for D365 shell to be ready
async function waitForD365Shell(page) {
  const selectors = [
    '[data-dyn-role="shell"]',
    '.dyn-shell',
    '#shell',
    'div[aria-label*="Finance and Operations"]',
    'nav[role="navigation"]',
  ];

  // Try each selector in order, with a reasonable timeout
  for (const s of selectors) {
    try {
      await page.locator(s).first().waitFor({ state: 'visible', timeout: 60_000 });
      return;
    } catch {
      // ignore and try next selector
    }
  }

  throw new Error('D365 shell did not appear – maybe login page or wrong URL?');
}

test('Createsalesorder - auto generated', async ({ page }) => {
  test.setTimeout(120_000); // 2 minutes for D365 to wake up

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForD365Shell(page);
  await page.waitForTimeout(2000); // small extra buffer

  const dashboardPage = new DashboardPage(page);
  const salesorderdetailspage = new SalesorderdetailspagePage(page);

  await dashboardPage.clickModules();
  await dashboardPage.clickAccountsReceivable();
  // SalesOrderDetailsPage
  await salesorderdetailspage.clickNew();
  await salesorderdetailspage.clickCustomerAccount();
  await salesorderdetailspage.clickModeOfDelivery();
  await salesorderdetailspage.clickCancel();

  // TODO: add assertions manually
});
