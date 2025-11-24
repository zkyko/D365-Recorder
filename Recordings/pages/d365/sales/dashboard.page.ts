import { Page } from '@playwright/test';
import { D365BasePage } from '../../utils/d365-base';

export class ActionCenterPage extends D365BasePage {
  static pageId = 'Dashboard--Page';
  static mi = 'DefaultDashboard';
  static caption = 'Action center';
  static type = 'details';

  /**
   * Generate URL for this page
   */
  static url({ cmp = 'FH' }: { cmp?: string } = {}): string {
    const params = new URLSearchParams();
    if (cmp) params.set('cmp', cmp);
    if (this.mi) params.set('mi', this.mi);
    const search = params.toString();
    return search ? `/?${search}` : '/';
  }

  /**
   * Check if a URL matches this page
   */
  static matchesUrl(url: string): boolean {
    try {
      const u = new URL(url, 'https://dummy'); // base for parsing
      const mi = u.searchParams.get('mi');
      return mi === this.mi;
    } catch {
      return false;
    }
  }

  /**
   * Navigate to this page
   */
  static async goto(page: Page, opts: { cmp?: string } = {}): Promise<void> {
    // Navigate with reasonable timeout for D365
    await page.goto(this.url(opts), { waitUntil: 'domcontentloaded', timeout: 120_000 });
    // Wait for D365 to be ready
    await this.waitForD365Ready(page);
  }

  /**
   * Wait for D365 to be fully loaded
   * @private
   */
  private static async waitForD365Ready(page: Page): Promise<void> {
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
        await page.waitForTimeout(2000); // small extra buffer
        return;
      } catch {
        // ignore and try next selector
      }
    }

    // If none found, check if we're on D365 URL and proceed anyway
    const currentUrl = page.url();
    if (currentUrl.includes('dynamics.com') || currentUrl.includes('operations.dynamics.com')) {
      await page.waitForTimeout(2000);
      return;
    }

    throw new Error('D365 shell did not appear – maybe login page or wrong URL?');
  }

  constructor(page: Page) {
    super(page);

    // Locators
    this.modulesItem = this.contentFrame.getByRole('treeitem', { name: 'Modules' });
    this.accountsReceivableItem = this.contentFrame.getByRole('treeitem', { name: 'Accounts receivable' });
  }

  // Actions
  async clickModules(): Promise<void> {
    await this.waitForNotBusy();
    await this.modulesItem.click();
    await this.waitForNotBusy();
  }

  async clickAccountsReceivable(): Promise<void> {
    await this.waitForNotBusy();
    await this.accountsReceivableItem.click();
    await this.waitForNotBusy();
  }

}
