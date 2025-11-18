import { Page } from 'playwright';
import { PageClassification, PageIdentity } from '../../types';

/**
 * Classifies D365 pages into logical page IDs based on URL patterns, titles, and breadcrumbs
 */
export class PageClassifier {
  private urlPatterns: Map<string, { pageId: string; pageName: string; pattern: PageClassification['pattern'] }> = new Map([
    // Sales patterns
    ['SalesTable', { pageId: 'SalesOrderDetailsPage', pageName: 'Sales Order Details', pattern: 'DetailsPage' }],
    ['SalesTableListPage', { pageId: 'AllSalesOrdersListPage', pageName: 'All Sales Orders', pattern: 'ListPage' }],
    
    // Customer patterns
    ['CustTable', { pageId: 'CustomerPage', pageName: 'Customer', pattern: 'DetailsPage' }],
    ['CustTableListPage', { pageId: 'AllCustomersListPage', pageName: 'All Customers', pattern: 'ListPage' }],
    
    // Inventory patterns
    ['InventTable', { pageId: 'ItemPage', pageName: 'Item', pattern: 'DetailsPage' }],
    ['InventTableListPage', { pageId: 'AllItemsListPage', pageName: 'All Items', pattern: 'ListPage' }],
    
    // AR patterns
    ['CustParameters', { pageId: 'AccountsReceivableParametersPage', pageName: 'AR Parameters', pattern: 'TableOfContents' }],
    
    // Common patterns
    ['Workspace', { pageId: 'WorkspacePage', pageName: 'Workspace', pattern: 'Workspace' }],
    ['Dialog', { pageId: 'DialogPage', pageName: 'Dialog', pattern: 'Dialog' }],
  ]);

  /**
   * Classify the current page
   */
  async classifyPage(page: Page): Promise<PageClassification> {
    let url: string;
    let title: string = '';
    let breadcrumbs: string[] = [];

    try {
      url = page.url();
    } catch (error: any) {
      // Execution context destroyed - page is navigating
      if (String(error.message || '').includes('Execution context was destroyed')) {
        return {
          pageId: 'UnknownPage',
          pageName: 'Unknown Page',
          pattern: 'Unknown',
          ignoreForPOM: true,
        };
      }
      throw error;
    }

    try {
      // Wait for page to be stable before reading title
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      title = await page.title();
    } catch (error: any) {
      // Execution context destroyed - page is navigating
      if (String(error.message || '').includes('Execution context was destroyed')) {
        return {
          pageId: 'UnknownPage',
          pageName: 'Unknown Page',
          pattern: 'Unknown',
          url,
          ignoreForPOM: true,
        };
      }
      // If title fails, continue with empty title
    }

    try {
      breadcrumbs = await this.extractBreadcrumbs(page);
    } catch (error: any) {
      // Ignore breadcrumb extraction errors
      breadcrumbs = [];
    }

    // Filter out auth and redirect pages
    let host = '';
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch (error) {
      // Invalid URL, skip host check
    }
    
    if (host && (host.includes('login.microsoftonline.com') || 
        host.includes('login.live.com') ||
        host.includes('sts.windows.net'))) {
      return {
        pageId: 'AuthPage',
        pageName: 'Authentication',
        pattern: 'Unknown',
        url,
        title,
        ignoreForPOM: true,
      };
    }

    // Filter out redirect pages
    if (title.match(/^Redirecting/i) || 
        title.match(/redirecting/i) ||
        title.match(/we're redirecting/i)) {
      return {
        pageId: 'RedirectingPage',
        pageName: 'Redirecting',
        pattern: 'Unknown',
        url,
        title,
        ignoreForPOM: true,
      };
    }

    // Filter out sign-in pages
    if (title.match(/sign in to your account/i) ||
        title.match(/sign in/i) && title.match(/microsoft/i)) {
      return {
        pageId: 'SignInPage',
        pageName: 'Sign In',
        pattern: 'Unknown',
        url,
        title,
        ignoreForPOM: true,
      };
    }

    // Try URL pattern matching first
    for (const [pattern, classification] of this.urlPatterns.entries()) {
      if (url.includes(pattern) || title.includes(pattern)) {
        return {
          ...classification,
          url,
          title,
          breadcrumbs,
          ignoreForPOM: false,
        };
      }
    }

    // Try breadcrumb analysis
    if (breadcrumbs.length > 0) {
      const breadcrumbText = breadcrumbs.join(' > ');
      for (const [pattern, classification] of this.urlPatterns.entries()) {
        if (breadcrumbText.includes(pattern)) {
          return {
            ...classification,
            url,
            title,
            breadcrumbs,
          };
        }
      }
    }

    // Infer from URL structure
    const pageId = this.inferPageIdFromUrl(url, title);
    const pattern = this.inferPatternFromUrl(url);

    // Mark unknown pages as ignoreForPOM unless we're confident it's a D365 page
    const isD365Page = url.includes('.dynamics.com') || 
                       url.includes('dynamics365') ||
                       url.includes('/namespaces/') ||
                       pattern !== 'Unknown';

    return {
      pageId,
      pageName: title || 'Unknown Page',
      pattern,
      url,
      title,
      breadcrumbs,
      ignoreForPOM: !isD365Page, // Ignore if not a D365 page
    };
  }

  /**
   * Extract breadcrumbs from D365 page
   */
  private async extractBreadcrumbs(page: Page): Promise<string[]> {
    try {
      const breadcrumbs = await page.evaluate(() => {
        // D365 breadcrumbs are typically in nav elements or specific classes
        const breadcrumbElements = document.querySelectorAll(
          '[aria-label*="breadcrumb"], .breadcrumb, nav[aria-label*="navigation"]'
        );
        
        if (breadcrumbElements.length > 0) {
          const items: string[] = [];
          breadcrumbElements.forEach((el: Element) => {
            const text = el.textContent?.trim();
            if (text) items.push(text);
          });
          return items;
        }

        // Fallback: try to find navigation links
        const navLinks = document.querySelectorAll('nav a, [role="navigation"] a');
        const items: string[] = [];
        navLinks.forEach((link: Element) => {
          const text = link.textContent?.trim();
          if (text && text.length < 50) {
            items.push(text);
          }
        });
        return items;
      });

      return breadcrumbs || [];
    } catch (error) {
      console.error('Error extracting breadcrumbs:', error);
      return [];
    }
  }

  /**
   * Infer page ID from URL
   */
  private inferPageIdFromUrl(url: string, title: string): string {
    // Extract form name from URL if possible
    const formMatch = url.match(/form=([^&]+)/);
    if (formMatch) {
      const formName = formMatch[1];
      // Convert form name to Page ID (e.g., "SalesTable" -> "SalesOrderPage")
      return this.formNameToPageId(formName);
    }

    // Use title as fallback
    if (title) {
      return this.titleToPageId(title);
    }

    return 'UnknownPage';
  }

  /**
   * Convert D365 form name to Page ID
   */
  private formNameToPageId(formName: string): string {
    // Remove common suffixes
    let pageId = formName.replace(/ListPage$/, 'ListPage');
    pageId = pageId.replace(/Table$/, 'Page');
    
    // Convert to PascalCase
    return pageId.split(/(?=[A-Z])/).map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join('') + 'Page';
  }

  /**
   * Convert page title to Page ID
   */
  private titleToPageId(title: string): string {
    // Remove common words and convert to PascalCase
    const words = title
      .replace(/Dynamics 365|Finance and Operations|F&O/gi, '')
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    
    return words.join('') + 'Page';
  }

  /**
   * Infer D365 form pattern from URL
   */
  private inferPatternFromUrl(url: string): PageClassification['pattern'] {
    if (url.includes('ListPage') || url.includes('List')) {
      return 'ListPage';
    }
    if (url.includes('Workspace')) {
      return 'Workspace';
    }
    if (url.includes('Dialog') || url.includes('dialog')) {
      return 'Dialog';
    }
    if (url.includes('Parameters') || url.includes('Setup')) {
      return 'TableOfContents';
    }
    
    return 'DetailsPage'; // Default assumption
  }

  /**
   * Extract page identity from URL and page content
   * This creates a PageIdentity object that includes mi, cmp, caption, etc.
   */
  async extractPageIdentity(page: Page): Promise<PageIdentity | null> {
    try {
      const url = page.url();
      let urlObj: URL;
      
      try {
        urlObj = new URL(url);
      } catch (error) {
        // Invalid URL, can't extract identity
        return null;
      }

      const params = urlObj.searchParams;
      const mi = params.get('mi') || undefined;
      const cmp = params.get('cmp') || undefined;

      // Extract caption from page (D365 page title)
      let caption: string | undefined;
      try {
        // Try common D365 page title selectors
        const captionSelectors = [
          'div[aria-label*="Page title"]',
          '[data-dyn-role="pageTitle"]',
          '.page-title',
          'h1',
        ];

        for (const selector of captionSelectors) {
          const element = await page.$(selector).catch(() => null);
          if (element) {
            const text = await element.textContent().catch(() => null);
            if (text && text.trim()) {
              caption = text.trim();
              break;
            }
          }
        }

        // Fallback to page title if no caption found
        if (!caption) {
          const pageTitle = await page.title().catch(() => '');
          if (pageTitle && !pageTitle.includes('Finance and Operations')) {
            caption = pageTitle;
          }
        }
      } catch (error) {
        // Ignore caption extraction errors
      }

      // Use existing classifier to get pageId and type
      const classification = await this.classifyPage(page);
      
      // Skip if page should be ignored
      if (classification.ignoreForPOM) {
        return null;
      }

      // Map pattern to type
      const typeMap: Record<string, PageIdentity['type']> = {
        'ListPage': 'list',
        'DetailsPage': 'details',
        'Dialog': 'dialog',
        'Workspace': 'workspace',
        'SimpleList': 'list',
        'TableOfContents': 'unknown',
        'Unknown': 'unknown',
      };

      const type = typeMap[classification.pattern] || 'unknown';

      // Build route path
      let routePath: string | undefined;
      if (mi || cmp) {
        const routeParams = new URLSearchParams();
        if (cmp) routeParams.set('cmp', cmp);
        if (mi) routeParams.set('mi', mi);
        routePath = `/?${routeParams.toString()}`;
      }

      const identity: PageIdentity = {
        pageId: classification.pageId,
        mi,
        cmp,
        caption: caption || classification.pageName,
        type,
        routePath,
        url,
      };

      return identity;
    } catch (error) {
      console.error('Error extracting page identity:', error);
      return null;
    }
  }
}

