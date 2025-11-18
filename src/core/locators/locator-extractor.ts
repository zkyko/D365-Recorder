import { Page, ElementHandle } from 'playwright';
import { LocatorDefinition } from '../../types';

/**
 * Extracts stable locators from DOM elements following POM guidelines priority order
 */
export class LocatorExtractor {
  /**
   * Extract the best locator for an element following priority order:
   * 1. getByRole(role, { name })
   * 2. getByLabel(text)
   * 3. getByPlaceholder(text)
   * 4. getByText(text) with filters
   * 5. data-test-id attributes
   * 6. CSS/XPath (fallback, flagged)
   */
  async extractLocator(page: Page, element: ElementHandle<HTMLElement> | null): Promise<LocatorDefinition> {
    try {
      if (!element) {
        return { strategy: 'css', selector: 'body', flagged: true };
      }

      // Priority 1: Try role + name using accessibility snapshot
      const roleLocator = await this.tryRole(page, element);
      if (roleLocator) return roleLocator;

      // Priority 2: Try label
      const labelLocator = await this.tryLabel(page, element);
      if (labelLocator) return labelLocator;

      // Priority 3: Try placeholder
      const placeholderLocator = await this.tryPlaceholder(element);
      if (placeholderLocator) return placeholderLocator;

      // Priority 4: Try text (short text only)
      const textLocator = await this.tryText(element);
      if (textLocator) return textLocator;

      // Priority 5: Try data-test-id
      const testIdLocator = await this.tryTestId(element);
      if (testIdLocator) return testIdLocator;

      // Priority 6: Fallback CSS
      const cssSelector = await this.buildCssSelector(element);
      if (cssSelector) {
        return { strategy: 'css', selector: cssSelector, flagged: true };
      }

      // Last resort
      return { strategy: 'css', selector: 'body', flagged: true };
    } catch (error) {
      console.error('Error extracting locator:', error);
      return { strategy: 'css', selector: 'body', flagged: true };
    }
  }

  /**
   * Try to get role + name locator using accessibility snapshot
   */
  private async tryRole(page: Page, element: ElementHandle<HTMLElement>): Promise<LocatorDefinition | null> {
    try {
      const axNode = await page.accessibility.snapshot({ root: element, interestingOnly: true }).catch(() => null);
      if (!axNode || !axNode.role) return null;

      // Get name from accessibility or element attributes
      // Priority: accessibility name > aria-label > title > placeholder
      const name = axNode.name || await element.evaluate((el: HTMLElement) => {
        return el.getAttribute('aria-label') || 
               (el as HTMLElement).title || 
               el.getAttribute('title') || 
               (el as HTMLInputElement).placeholder || 
               null;
      });

      if (!name) return null;

      return {
        strategy: 'role',
        role: axNode.role,
        name: name,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Try to get label locator
   */
  private async tryLabel(page: Page, element: ElementHandle<HTMLElement>): Promise<LocatorDefinition | null> {
    try {
      const label = await element.evaluate((el: HTMLElement) => {
        // 1) aria-label
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel.trim();

        // 2) <label for="id">
        const id = el.getAttribute('id');
        if (id) {
          const forLabel = el.ownerDocument.querySelector<HTMLLabelElement>(`label[for="${id}"]`);
          if (forLabel?.textContent) return forLabel.textContent.trim();
        }

        // 3) labels property (for inputs etc.) – runtime has it, TS doesn't on HTMLElement
        const anyEl = el as any;
        if (anyEl.labels && anyEl.labels.length > 0) {
          const text = anyEl.labels[0].textContent;
          if (text) return text.trim();
        }

        // 4) title attribute (important for icon-only buttons like hamburger menu)
        const title = (el as HTMLElement).title || el.getAttribute('title');
        if (title) return title.trim();

        return null;
      });

      if (!label) return null;

      return {
        strategy: 'label',
        text: label,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Try to get placeholder locator
   */
  private async tryPlaceholder(element: ElementHandle<HTMLElement>): Promise<LocatorDefinition | null> {
    try {
      const placeholder = await element.evaluate((el: HTMLElement) => {
        return (el as HTMLInputElement).placeholder || null;
      });

      if (!placeholder) return null;

      return {
        strategy: 'placeholder',
        text: placeholder,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Try to get text locator (only for short, meaningful text)
   * FIX #1: Only use textContent for interactive elements
   */
  private async tryText(element: ElementHandle<HTMLElement>): Promise<LocatorDefinition | null> {
    try {
      // Check if element is interactive first
      const elementInfo = await element.evaluate((el: HTMLElement) => {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role') || '';
        const isInteractive = ['button', 'link', 'menuitem', 'treeitem', 'tab', 'checkbox', 'radio'].includes(role) ||
                             tag === 'button' || tag === 'a' || 
                             el.matches('button, a, [role=button], [role=link], [role=menuitem], [role=treeitem]');
        
        // Only get text for interactive elements
        let text = '';
        if (isInteractive) {
          // Get direct text nodes only (not from children)
          let directText = '';
          for (const node of Array.from(el.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
              directText += node.textContent || '';
            }
          }
          text = directText.trim();

          // If no direct text, try textContent but limit it
          if (!text) {
            const fullText = el.textContent?.trim() || '';
            // Only use if it's short and meaningful (not the entire page)
            if (fullText && fullText.length > 0 && fullText.length < 100) {
              text = fullText;
            }
          }
        }
        
        return { text, isInteractive };
      });

      // FIX #3: Hard limit - never use text longer than 80 chars
      if (!elementInfo.text || elementInfo.text.length > 80) {
        return null;
      }

      // Only use if it's reasonable length
      if (elementInfo.text.length > 0 && elementInfo.text.length <= 80) {
        return {
          strategy: 'text',
          text: elementInfo.text,
          exact: true,
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Try to get data-test-id locator
   */
  private async tryTestId(element: ElementHandle<HTMLElement>): Promise<LocatorDefinition | null> {
    try {
      const testId = await element.evaluate((el: HTMLElement) => {
        return el.getAttribute('data-test-id') || 
               el.getAttribute('data-qa') || 
               null;
      });

      if (!testId) return null;

      return {
        strategy: 'testid',
        value: testId,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Build CSS selector as fallback
   */
  private async buildCssSelector(element: ElementHandle<HTMLElement>): Promise<string | null> {
    try {
      return await element.evaluate((el: HTMLElement) => {
        if (!(el instanceof HTMLElement)) return null;

        // Prefer ID
        if (el.id) {
          return `#${el.id}`;
        }

        // Build selector from tag and classes
        let selector = el.tagName.toLowerCase();

        if (el.classList.length > 0) {
          // Use first class as a simple selector
          selector += '.' + Array.from(el.classList)[0];
        }

        return selector;
      });
    } catch (error) {
      return null;
    }
  }
}
