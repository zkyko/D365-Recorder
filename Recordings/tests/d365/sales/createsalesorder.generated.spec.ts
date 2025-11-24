import { test, expect } from '@playwright/test';

// CHANGE: Import the correct class names
import { ActionCenterPage } from '../../../pages/d365/sales/dashboard.page';
import { SalesOrderDetailsPage } from '../../../pages/d365/sales/salesorderdetailspage.page';

test('Createsalesorder - auto generated', async ({ page }) => {
  test.setTimeout(120_000);

  // 1. Initialize POMs
  const dashboardPage = new ActionCenterPage(page);
  const salesOrderPage = new SalesOrderDetailsPage(page);

  // 2. Navigate (Use the POM's static goto)
  await ActionCenterPage.goto(page, { cmp: 'FH' });

  // 3. Dashboard Actions
  await dashboardPage.clickModules();
  await dashboardPage.clickAccountsReceivable();

  // 4. Navigate to Sales Order Creation
  // You can either click through the UI *OR* use the deep link URL.
  // If testing the UI flow:
  // await dashboardPage.clickAllSalesOrders(); 
  
  // If using deep link shortcut (faster):
  await SalesOrderDetailsPage.goto(page, { cmp: 'FH' });

  // 5. Create Order
  await salesOrderPage.clickNew();
  
  // CHANGE: Pass data to these methods
  await salesOrderPage.fillName('Test Order 123'); 
  await salesOrderPage.fillModeOfDelivery('10'); 
  
  await salesOrderPage.clickOk();
  await salesOrderPage.clickSave();
  
  // assert success before deleting
  // expect(page.getByText('Saved')).toBeVisible();

  await salesOrderPage.clickDelete();
});