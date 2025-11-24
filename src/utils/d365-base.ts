import { Page, FrameLocator, Locator } from '@playwright/test';

/**
 * Base class for all D365 Page Object Models
 * Provides D365-specific utilities and frame handling
 */
export abstract class D365BasePage {
  protected page: Page;
  private _contentFrame: FrameLocator | null = null;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Get the D365 content frame (where the actual form/grid content lives)
   * D365 F&O nests content in iframes, typically iframe[name^='b'] or iframe[data-dyn-role='contentFrame']
   */
  protected get contentFrame(): FrameLocator {
    if (!this._contentFrame) {
      // Try multiple selectors to find the content frame
      // Most common: iframe[name^='b'] or iframe[data-dyn-role='contentFrame']
      const frameSelector = "iframe[name^='b'], iframe[data-dyn-role='contentFrame'], iframe.d365-content-frame";
      this._contentFrame = this.page.frameLocator(frameSelector).first();
    }
    return this._contentFrame;
  }

  /**
   * Wait for D365 to finish processing/loading
   * Checks for multiple D365-specific loading indicators
   */
  protected async waitForNotBusy(): Promise<void> {
    // 1. Wait for global spinner to detach
    try {
      await this.page.locator('.d365-spinner, #SysLoading').first().waitFor({ 
        state: 'detached', 
        timeout: 5000 
      });
    } catch {
      // Spinner might not exist, continue
    }

    // 2. Wait for form "Processing" overlay
    try {
      await this.page.locator('.modal-backdrop.processing').first().waitFor({ 
        state: 'detached', 
        timeout: 5000 
      });
    } catch {
      // Overlay might not exist, continue
    }

    // 3. Wait for aria-busy to be false or removed
    try {
      await this.page.locator('[aria-busy="true"]').first().waitFor({ 
        state: 'detached', 
        timeout: 3000 
      });
    } catch {
      // No busy elements, continue
    }

    // 4. Wait for disabled action panes to be enabled
    try {
      await this.page.locator('div[data-dyn-role="ActionPane"][aria-disabled="true"]').first().waitFor({ 
        state: 'detached', 
        timeout: 3000 
      });
    } catch {
      // Action pane might not be disabled, continue
    }

    // 5. Short buffer for UI settling
    await this.page.waitForTimeout(300);
  }

  /**
   * Select a row in a virtualized grid by column value
   * D365 grids use row virtualization, so we can't use nth-child selectors
   * 
   * @param columnName - The column name/header to search
   * @param value - The value to match
   * @param frame - Optional frame locator (defaults to contentFrame)
   */
  protected async selectRowByValue(
    columnName: string, 
    value: string, 
    frame?: FrameLocator
  ): Promise<void> {
    const targetFrame = frame || this.contentFrame;
    
    // Try to use filter if available (more efficient than scanning rows)
    const filterInput = targetFrame.locator(`input[aria-label*="${columnName}"], input[placeholder*="${columnName}"]`).first();
    const filterExists = await filterInput.count() > 0;
    
    if (filterExists) {
      await this.waitForNotBusy();
      await filterInput.fill(value);
      await filterInput.press('Enter');
      await this.waitForNotBusy();
      
      // Then click the row
      const row = targetFrame.locator(`tr:has-text("${value}")`).first();
      await row.click();
      await this.waitForNotBusy();
      return;
    }

    // Fallback: scan visible rows (limited by virtualization)
    const rows = targetFrame.locator('tbody tr');
    const rowCount = await rows.count();
    
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const cellText = await row.locator('td').first().textContent();
      if (cellText?.includes(value)) {
        await row.click();
        await this.waitForNotBusy();
        return;
      }
    }
    
    throw new Error(`Row with value "${value}" not found in column "${columnName}"`);
  }
}

