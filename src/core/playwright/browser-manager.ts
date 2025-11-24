import { chromium, Browser, BrowserContext, Page, LaunchOptions } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Manages Playwright browser lifecycle and D365 navigation
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  /**
   * Check if storage state file exists and is valid (basic check)
   */
  isStorageStateValid(storageStatePath?: string): boolean {
    if (!storageStatePath) return false;
    
    try {
      if (!fs.existsSync(storageStatePath)) {
        return false;
      }
      
      const state = JSON.parse(fs.readFileSync(storageStatePath, 'utf-8'));
      // Check if it has cookies (basic validation)
      return state.cookies && Array.isArray(state.cookies) && state.cookies.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Test if storage state is valid and working by attempting to use it
   */
  async testStorageState(storageStatePath: string, d365Url: string): Promise<{
    isValid: boolean;
    isWorking: boolean;
    error?: string;
    details: {
      exists: boolean;
      hasCookies: boolean;
      cookieCount: number;
      canAccessD365: boolean;
    };
  }> {
    const result = {
      isValid: false,
      isWorking: false,
      details: {
        exists: false,
        hasCookies: false,
        cookieCount: 0,
        canAccessD365: false,
      }
    };

    // Check 1: File exists
    if (!fs.existsSync(storageStatePath)) {
      return { ...result, error: 'Storage state file does not exist' };
    }
    result.details.exists = true;

    // Check 2: Valid JSON structure with cookies
    try {
      const state = JSON.parse(fs.readFileSync(storageStatePath, 'utf-8'));
      result.details.hasCookies = state.cookies && Array.isArray(state.cookies);
      result.details.cookieCount = result.details.hasCookies ? state.cookies.length : 0;
      result.isValid = result.details.hasCookies && result.details.cookieCount > 0;
    } catch (error: any) {
      return { ...result, error: `Invalid JSON: ${error.message}` };
    }

    if (!result.isValid) {
      return { ...result, error: 'Storage state has no cookies' };
    }

    // Check 3: Actually test if it works by trying to use it
    let testBrowser: Browser | null = null;
    try {
      testBrowser = await chromium.launch({ headless: true });
      const context = await testBrowser.newContext({
        storageState: storageStatePath,
      });
      const page = await context.newPage();
      
      // Try to navigate to D365
      await page.goto(d365Url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      
      // Check if we're logged in (not on login page)
      const currentUrl = page.url();
      const isOnLoginPage = currentUrl.includes('login.microsoft.com') || 
                            currentUrl.includes('microsoftonline.com');
      
      result.details.canAccessD365 = !isOnLoginPage;
      result.isWorking = result.details.canAccessD365;
      
      await context.close();
      await testBrowser.close();
    } catch (error: any) {
      if (testBrowser) {
        await testBrowser.close().catch(() => {});
      }
      return { ...result, error: `Test failed: ${error.message}` };
    }

    return result;
  }

  /**
   * Launch Chromium browser with optional storage state for D365 auth
   */
  async launch(options?: {
    storageStatePath?: string;
    headless?: boolean;
    slowMo?: number;
  }): Promise<Page> {
    const launchOptions: LaunchOptions = {
      headless: options?.headless ?? false,
      slowMo: options?.slowMo,
    };

    this.browser = await chromium.launch(launchOptions);

    const contextOptions: any = {};
    if (options?.storageStatePath && this.isStorageStateValid(options.storageStatePath)) {
      contextOptions.storageState = options.storageStatePath;
    }

    this.context = await this.browser.newContext(contextOptions);
    this.page = await this.context.newPage();

    return this.page;
  }

  /**
   * Save storage state to file
   */
  async saveStorageState(filePath: string): Promise<void> {
    if (!this.context) {
      throw new Error('Browser context not available. Launch browser first.');
    }

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await this.context.storageState({ path: filePath });
  }

  /**
   * Perform D365 login and save storage state
   */
  async performLogin(
    d365Url: string,
    username: string,
    password: string,
    storageStatePath: string,
    onProgress?: (message: string) => void
  ): Promise<boolean> {
    try {
      if (!this.page) {
        throw new Error('Browser not launched. Call launch() first.');
      }

      onProgress?.('Navigating to D365...');
      // Navigate with 60 second timeout for app startup (reduced from 2 minutes)
      await this.page.goto(d365Url, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 // 60 second timeout for initial navigation
      });
      
      onProgress?.('Waiting for D365 to load...');
      // Wait for D365 to be ready (look for the app shell or navigation)
      await this.waitForD365Ready();

      // Wait for sign-in page
      onProgress?.('Waiting for sign-in page...');
      try {
        await this.page.waitForSelector('input[type="email"], input[name="loginfmt"], input[type="text"]', { 
          timeout: 10000 
        });
      } catch (error) {
        // Maybe already logged in or different login flow
        const currentUrl = this.page.url();
        if (currentUrl.includes(d365Url) || currentUrl.includes('dynamics.com')) {
          onProgress?.('Already authenticated or different login flow detected');
          await this.saveStorageState(storageStatePath);
          return true;
        }
        throw error;
      }

      // Fill username
      onProgress?.('Entering username...');
      const emailInput = this.page.locator('input[type="email"], input[name="loginfmt"], input[type="text"]').first();
      await emailInput.fill(username);
      await emailInput.press('Enter');
      await this.page.waitForTimeout(1000);

      // Wait for password field
      onProgress?.('Waiting for password field...');
      try {
        await this.page.waitForSelector('input[type="password"]', { timeout: 10000 });
      } catch (error) {
        // Might be MFA or different flow
        onProgress?.('Password field not found, might be MFA or different authentication flow');
        // Wait a bit and check if we're already logged in
        await this.page.waitForTimeout(3000);
        const currentUrl = this.page.url();
        if (currentUrl.includes(d365Url) || currentUrl.includes('dynamics.com')) {
          await this.saveStorageState(storageStatePath);
          return true;
        }
        throw new Error('Password field not found. Please check authentication flow.');
      }

      // Fill password
      onProgress?.('Entering password...');
      const passwordInput = this.page.locator('input[type="password"]').first();
      await passwordInput.fill(password);
      await passwordInput.press('Enter');
      await this.page.waitForTimeout(2000);

      // Wait for D365 to load (60 second timeout for app startup)
      onProgress?.('Waiting for D365 to load...');
      try {
        // Wait for URL to contain D365 domain or wait for D365-specific elements
        await Promise.race([
          this.page.waitForURL(url => url.toString().includes('dynamics.com') || url.toString().includes('operations.dynamics.com'), { timeout: 60000 }),
          this.page.waitForSelector('[data-dyn-role="workspace"], .workspace, [aria-label*="workspace"]', { timeout: 60000 })
        ]);
      } catch (error) {
        // Check if page was closed
        if (this.page.isClosed()) {
          throw new Error('Browser page was closed during login');
        }
        
        // Check if we're on an MFA or consent page
        const currentUrl = this.page.url();
        if (currentUrl.includes('microsoftonline.com') || currentUrl.includes('login.microsoft.com')) {
          onProgress?.('MFA or additional authentication required. Please complete in browser...');
          // Wait for user to complete MFA manually (longer timeout for MFA)
          await this.page.waitForURL(url => url.toString().includes('dynamics.com') || url.toString().includes('operations.dynamics.com'), { timeout: 300000 });
        } else {
          throw error;
        }
      }

      // Wait for D365 to be ready instead of networkidle
      await this.waitForD365Ready();
      await this.page.waitForTimeout(3000);

      // Save storage state
      onProgress?.('Saving authentication state...');
      await this.saveStorageState(storageStatePath);
      onProgress?.('Authentication successful!');

      return true;
    } catch (error: any) {
      onProgress?.(`Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Navigate to D365 URL
   */
  async navigateToD365(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    // Navigate with 60 second timeout (reduced from 2 minutes for faster recording start)
    await this.page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 // 60 second timeout
    });
    
    // Wait for D365 to be ready
    await this.waitForD365Ready();
  }

  /**
   * Wait for D365 to be fully loaded and ready
   * This waits for the D365 app shell to be present rather than just network idle
   */
  private async waitForD365Ready(): Promise<void> {
    if (!this.page) {
      return;
    }

    // Check if page is still open
    if (this.page.isClosed()) {
      console.warn('Page was closed before waitForD365Ready could complete');
      return;
    }

    try {
      // First, wait for DOM to be ready (with shorter timeout for app startup)
      try {
        await this.page.waitForLoadState('domcontentloaded', { timeout: 60000 });
      } catch (error) {
        if (this.page.isClosed()) {
          console.warn('Page closed during DOM ready wait');
          return;
        }
        throw error;
      }
      
      // Wait for D365 app shell indicators - try multiple selectors with a reasonable timeout
      const selectors = [
        '[data-dyn-role="shell"]',
        '.dyn-shell',
        '#shell',
        'div[aria-label*="Finance and Operations"]',
        'nav[role="navigation"]',
        'body', // Fallback - body should always exist
      ];

      // Try to find at least one D365 shell element
      // Use a simpler approach: try each selector with a shorter timeout
      let found = false;
      for (const selector of selectors) {
        // Check if page is still open before each wait
        if (this.page.isClosed()) {
          console.warn('Page closed during selector wait');
          return;
        }
        
        try {
          await this.page.waitForSelector(selector, { 
            timeout: 10000, // 10 second timeout per selector
            state: 'attached'
          });
          found = true;
          break; // Found one, we're done
        } catch (error) {
          // Try next selector
          continue;
        }
      }
      
      if (!found) {
        // If none of the selectors match, check if we're at least on a D365 URL
        if (!this.page.isClosed()) {
          const currentUrl = this.page.url();
          if (currentUrl.includes('dynamics.com') || currentUrl.includes('operations.dynamics.com')) {
            console.log('D365 URL detected, proceeding even without shell elements');
          } else {
            console.warn('Could not detect D365 shell elements and not on D365 URL');
          }
        }
      }
      
      // Give D365 a moment to finish initializing (only if page is still open)
      if (!this.page.isClosed()) {
        await this.page.waitForTimeout(2000);
      }
    } catch (error: any) {
      // If page is closed, don't try to recover
      if (this.page.isClosed()) {
        console.warn('Page was closed during waitForD365Ready');
        return;
      }
      
      // If we can't find specific elements, at least wait for DOM to be ready
      console.warn('Error waiting for D365 ready, falling back to DOM ready:', error.message);
      try {
        if (!this.page.isClosed()) {
          await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 });
        }
      } catch (e: any) {
        // Even DOM ready failed, but we'll proceed anyway
        if (!this.page.isClosed()) {
          console.warn('Could not wait for DOM ready:', e.message);
        }
      }
    }
  }

  /**
   * Get the current page instance
   */
  getPage(): Page | null {
    return this.page;
  }

  /**
   * Get the current browser context
   */
  getContext(): BrowserContext | null {
    return this.context;
  }

  /**
   * Close the browser and cleanup
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  /**
   * Check if browser is currently open
   */
  isOpen(): boolean {
    return this.browser !== null && this.page !== null;
  }
}

