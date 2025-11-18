const { Page } = require('@playwright/test');

class SalesorderdetailspagePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;

    // Locators
    this.newButton = page.getByRole('button', { name: ' New' });
    this.customerAccountInput = page.getByRole('textbox', { name: 'Customer account' });
    this.modeOfDeliveryInput = page.getByRole('textbox', { name: 'Mode of delivery' });
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
  }

  // Actions
  async clickNew() {
    await this.newButton.click();
  }

  async clickCustomerAccount() {
    await this.customerAccountInput.click();
  }

  async clickModeOfDelivery() {
    await this.modeOfDeliveryInput.click();
  }

  async clickCancel() {
    await this.cancelButton.click();
  }

}

module.exports = { SalesorderdetailspagePage };
