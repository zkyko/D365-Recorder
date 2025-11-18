const { Page } = require('@playwright/test');

class DashboardPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;

    // Locators
    this.modulesItem = page.getByRole('treeitem', { name: 'Modules' });
    this.accountsReceivableItem = page.getByRole('treeitem', { name: 'Accounts receivable' });
  }

  // Actions
  async clickModules() {
    await this.modulesItem.click();
  }

  async clickAccountsReceivable() {
    await this.accountsReceivableItem.click();
  }

}

module.exports = { DashboardPage };
