import { Page } from 'playwright';
import { RecordedStep, LocatorDefinition, PageIdentity } from '../../types';
import { EventListeners } from './event-listeners';
import { LocatorExtractor } from '../locators/locator-extractor';
import { PageClassifier } from '../classification/page-classifier';
import { makeSafeIdentifier } from '../utils/identifiers';
import { PageRegistryManager } from '../registry/page-registry';

/**
 * Main recorder engine that coordinates event capture and step creation
 */
export class RecorderEngine {
  private isRecording: boolean = false;
  private page: Page | null = null;
  private onStepRecorded?: (step: RecordedStep) => void;
  private locatorExtractor: LocatorExtractor;
  private pageClassifier: PageClassifier;
  private pageRegistry: PageRegistryManager;
  private currentPageIdentity: PageIdentity | null = null;
  private module?: string;

  constructor(module?: string) {
    this.locatorExtractor = new LocatorExtractor();
    this.pageClassifier = new PageClassifier();
    this.pageRegistry = new PageRegistryManager();
    this.module = module;
  }

  /**
   * Start recording on a page
   */
  async startRecording(page: Page, onStepRecorded: (step: RecordedStep) => void): Promise<void> {
    if (this.isRecording) {
      throw new Error('Recording already in progress');
    }

    this.page = page;
    this.onStepRecorded = onStepRecorded;
    this.isRecording = true;

    // Extract initial page identity
    await this.updatePageIdentity(page);

    // Inject event listeners
    await EventListeners.injectListeners(page, (event) => this.handleEvent(event));
    await EventListeners.setupPlaywrightListeners(page, (event) => this.handleEvent(event));

    // Also use Playwright's built-in CDP for more reliable event capture
    await this.setupCDPListeners(page);
  }

  /**
   * Update current page identity from URL and page content
   */
  private async updatePageIdentity(page: Page): Promise<void> {
    try {
      const identity = await this.pageClassifier.extractPageIdentity(page);
      if (identity) {
        this.currentPageIdentity = identity;
        // Register page in registry
        this.pageRegistry.registerPage(identity, this.module);
      }
    } catch (error) {
      console.error('Error updating page identity:', error);
    }
  }

  /**
   * Stop recording
   */
  stopRecording(): void {
    this.isRecording = false;
    this.page = null;
    this.onStepRecorded = undefined;
  }

  /**
   * Handle intercepted events and convert them to RecordedStep
   */
  private async handleEvent(event: any): Promise<void> {
    if (!this.isRecording || !this.page || !this.onStepRecorded) {
      return;
    }

    try {
      let step: RecordedStep | null = null;

      if (event.type === 'click') {
        step = await this.handleClickEvent(event);
      } else if (event.type === 'fill' || event.type === 'input') {
        step = await this.handleInputEvent(event);
      } else if (event.type === 'select' || event.type === 'change') {
        step = await this.handleSelectEvent(event);
      } else if (event.type === 'navigate') {
        // Update page identity on navigation, but don't create a step
        if (this.page) {
          await this.updatePageIdentity(this.page);
        }
        return; // Navigation events don't create steps
      }

      if (step) {
        this.onStepRecorded(step);
      }
    } catch (error) {
      console.error('Error handling event:', error);
    }
  }

  /**
   * Handle click events
   */
  private async handleClickEvent(event: any): Promise<RecordedStep | null> {
    if (!this.page || !event.selector) {
      return null;
    }

    try {
      // Find element by selector
      const element = await this.page.$(event.selector).catch(() => null);
      if (!element) {
        // Try alternative selectors
        const altSelectors = [
          event.selector,
          `css=${event.selector}`,
          `xpath=//*[@id="${event.selector.replace('#', '')}"]`,
        ];
        
        for (const selector of altSelectors) {
          const el = await this.page.$(selector).catch(() => null);
          if (el) {
            return await this.processClickElement(el);
          }
        }
        return null;
      }

      return await this.processClickElement(element);
    } catch (error) {
      console.error('Error processing click event:', error);
      return null;
    }
  }

  /**
   * Process a clicked element and create a step
   */
  private async processClickElement(element: any): Promise<RecordedStep | null> {
    if (!this.page || !element) return null;

    try {
      // Get element metadata FIRST to filter before doing expensive operations
      const elementMeta = await element.evaluate((el: HTMLElement) => {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role') || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        const title = (el as HTMLElement).title || el.getAttribute('title') || '';
        const id = el.id || '';
        
        // Only get text content for interactive elements to avoid getting entire page
        let text = '';
        const isInteractive = ['button', 'link', 'menuitem', 'treeitem', 'tab', 'checkbox', 'radio'].includes(role) ||
                             tag === 'button' || tag === 'a' || 
                             el.matches('button, a, [role=button], [role=link], [role=menuitem], [role=treeitem]');
        
        if (isInteractive) {
          // For interactive elements, get direct text only (not nested children)
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
            // Only use if reasonably short (not entire page)
            if (fullText.length > 0 && fullText.length < 100) {
              text = fullText;
            }
          }
        }
        
        return { tag, role, ariaLabel, title, text, id, isInteractive };
      });

      // FIX #2: Explicitly block garbage steps
      if (this.shouldSkipElement(elementMeta)) {
        return null;
      }

      // Combine label sources: aria-label > text > title
      // Title is important for icon-only buttons like hamburger menu
      const fullLabelText = elementMeta.ariaLabel || elementMeta.text || elementMeta.title;
      
      // FIX #3: Hard limit on label length
      if (fullLabelText && fullLabelText.length > 80) {
        return null; // Skip if label is too long
      }
      
      // Relax filter: allow buttons with title/aria-label even if no text
      const isButtonLike = elementMeta.role === 'button' || elementMeta.tag === 'button';
      if (!fullLabelText && !isButtonLike) {
        return null; // Skip generic elements without any label
      }
      
      // Use fullLabelText for identifier generation
      const labelForIdentifier = fullLabelText || elementMeta.role || elementMeta.tag;

      // Now do the expensive operations only if element passed filters
      const locator = await this.locatorExtractor.extractLocator(this.page, element);
      const pageClassification = await this.pageClassifier.classifyPage(this.page);
      const description = await this.buildDescription(element, 'click');

      // Generate safe identifiers using the full label text
      const baseName = makeSafeIdentifier(labelForIdentifier);
      const fieldName = this.getFieldName(baseName, locator);
      const methodName = this.getMethodName(baseName, 'click');

      // Attach current page identity to step
      const pageUrl = this.page?.url() || '';
      
      return {
        pageId: pageClassification.pageId,
        action: 'click',
        description: description,
        locator: locator,
        fieldName,
        methodName,
        order: 0, // Will be set by SessionManager
        timestamp: new Date(),
        // Page identity information
        pageUrl,
        mi: this.currentPageIdentity?.mi,
        cmp: this.currentPageIdentity?.cmp,
        pageType: this.currentPageIdentity?.type,
      };
    } catch (error) {
      console.error('Error processing click event:', error);
      return null;
    }
  }

  /**
   * Check if element should be skipped (low-value clicks)
   * FIX #2: Explicitly block garbage steps
   */
  private shouldSkipElement(elementMeta: { tag: string; role: string; ariaLabel: string; text: string; id: string; isInteractive: boolean }): boolean {
    const { tag, role, ariaLabel, text, isInteractive } = elementMeta;
    
    // Skip generic roles
    if (role === 'generic' || role === 'presentation') {
      return true;
    }

    // Skip generic containers (div, span) unless they have meaningful labels
    if (['div', 'span'].includes(tag)) {
      // Only allow if it has an accessible name AND is interactive
      if (!ariaLabel && !text) {
        return true; // No label at all
      }
      // Skip if text is too short (likely not meaningful)
      if (text.length < 2) {
        return true;
      }
      // Skip if not interactive (container divs shouldn't be clicked)
      if (!isInteractive) {
        return true;
      }
    }

    // Skip body element
    if (tag === 'body') {
      return true;
    }

    // Skip if no meaningful label and not interactive
    if (!ariaLabel && !text && !isInteractive) {
      return true;
    }

    return false;
  }

  /**
   * Generate field name for POM
   */
  private getFieldName(baseName: string, locator: LocatorDefinition): string {
    // Determine suffix based on locator strategy or element type
    if (locator.strategy === 'role') {
      const role = locator.role;
      if (role === 'button') return `${baseName}Button`;
      if (role === 'link') return `${baseName}Link`;
      if (role === 'textbox') return `${baseName}Input`;
      if (role === 'combobox') return `${baseName}Select`;
      if (role === 'treeitem') return `${baseName}Item`;
      if (role === 'menuitem') return `${baseName}MenuItem`;
    }
    
    // Default suffix
    return `${baseName}Element`;
  }

  /**
   * Generate method name for POM
   */
  private getMethodName(baseName: string, action: 'click' | 'fill' | 'select'): string {
    const capitalized = baseName.charAt(0).toUpperCase() + baseName.slice(1);
    return `${action}${capitalized}`;
  }

  /**
   * Build a clean, short description for an element
   * FIX #1: Only use textContent for interactive elements
   */
  private async buildDescription(element: any, action: 'click' | 'fill' | 'select'): Promise<string> {
    try {
      const meta = await element.evaluate((el: HTMLElement) => {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role') || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        const titleAttr = (el as HTMLElement).title || el.getAttribute('title') || '';
        const placeholder = (el as HTMLInputElement).placeholder || '';
        
        // Only get text for interactive elements
        const isInteractive = ['button', 'link', 'menuitem', 'treeitem', 'tab', 'checkbox', 'radio'].includes(role) ||
                             tag === 'button' || tag === 'a' || 
                             el.matches('button, a, [role=button], [role=link], [role=menuitem], [role=treeitem]');
        
        let text = '';
        if (isInteractive) {
          // Get only direct text nodes (not from children)
          let directText = '';
          for (const node of Array.from(el.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
              directText += node.textContent || '';
            }
          }
          directText = directText.trim();

          // If no direct text, try to get a short snippet from textContent
          // but limit it to avoid getting entire page content
          text = directText;
          if (!text) {
            const fullText = el.textContent?.trim() || '';
            // Only use if it's reasonably short (not the entire page)
            if (fullText.length > 0 && fullText.length < 100) {
              text = fullText;
            }
          }
        }

        return { tag, role, ariaLabel, title: titleAttr, placeholder, text };
      });

      // Priority: aria-label > title > placeholder > text > tag
      // Title is important for icon-only buttons like hamburger menu
      const primary = meta.ariaLabel || 
                     meta.title || 
                     meta.placeholder || 
                     (meta.text.length > 0 && meta.text.length < 100 ? meta.text : '') ||
                     meta.tag;

      // Truncate if too long
      const label = primary.length > 80 ? primary.slice(0, 77) + '…' : primary;

      // Don't add prefix if label already starts with action verb
      const actionPrefix = action.charAt(0).toUpperCase() + action.slice(1);
      if (label.toLowerCase().startsWith(action.toLowerCase())) {
        return label;
      }

      switch (action) {
        case 'click':
          return `Click ${label}`;
        case 'fill':
          return `Fill ${label}`;
        case 'select':
          return `Select ${label}`;
        default:
          return `${actionPrefix} ${label}`;
      }
    } catch (error) {
      // Fallback to generic description
      return `${action} element`;
    }
  }

  /**
   * Handle input/fill events
   */
  private async handleInputEvent(event: any): Promise<RecordedStep | null> {
    if (!this.page || !event.selector) {
      return null;
    }

    try {
      // Find element by selector
      const element = await this.page.$(event.selector).catch(() => null);
      if (!element) {
        return null;
      }

      const elementInfo = await element.evaluate((el: HTMLElement) => {
        if (!el) return null;
        const anyEl = el as any;
        
        const labelText = (anyEl.labels && anyEl.labels[0]?.textContent) || '';
        
        return {
          tagName: el.tagName,
          type: (el as HTMLInputElement).type,
          label: el.getAttribute('aria-label') || 
                 labelText.trim() || 
                 (el as HTMLInputElement).placeholder || '',
          value: (el as HTMLInputElement).value,
          id: el.id,
          name: el.getAttribute('name'),
        };
      });

      if (!elementInfo) {
        return null;
      }

      const locator = await this.locatorExtractor.extractLocator(this.page, element);
      const pageClassification = await this.pageClassifier.classifyPage(this.page);
      const description = await this.buildDescription(element, 'fill');

      // Generate safe identifiers
      const labelText = elementInfo.label || elementInfo.name || 'input';
      const baseName = makeSafeIdentifier(labelText);
      const fieldName = `${baseName}Input`;
      const methodName = this.getMethodName(baseName, 'fill');

      const pageUrl = this.page?.url() || '';
      
      return {
        pageId: pageClassification.pageId,
        action: 'fill',
        description: description,
        locator: locator,
        value: event.value || elementInfo.value,
        fieldName,
        methodName,
        order: 0,
        timestamp: new Date(),
        // Page identity information
        pageUrl,
        mi: this.currentPageIdentity?.mi,
        cmp: this.currentPageIdentity?.cmp,
        pageType: this.currentPageIdentity?.type,
      };
    } catch (error) {
      console.error('Error processing input event:', error);
      return null;
    }
  }

  /**
   * Handle select/change events
   */
  private async handleSelectEvent(event: any): Promise<RecordedStep | null> {
    if (!this.page || !event.selector) {
      return null;
    }

    try {
      // Find element by selector
      const element = await this.page.$(event.selector).catch(() => null);
      if (!element) {
        return null;
      }

      const elementInfo = await element.evaluate((el: HTMLElement) => {
        if (!el) return null;
        const anyEl = el as any;
        
        const labelText = (anyEl.labels && anyEl.labels[0]?.textContent) || '';
        
        return {
          tagName: el.tagName,
          label: el.getAttribute('aria-label') || 
                 labelText.trim() || '',
          value: (el as HTMLSelectElement).value,
          id: el.id,
          name: el.getAttribute('name'),
        };
      });

      if (!elementInfo) {
        return null;
      }

      const locator = await this.locatorExtractor.extractLocator(this.page, element);
      const pageClassification = await this.pageClassifier.classifyPage(this.page);
      const description = await this.buildDescription(element, 'select');

      // Generate safe identifiers
      const labelText = elementInfo.label || elementInfo.name || 'select';
      const baseName = makeSafeIdentifier(labelText);
      const fieldName = `${baseName}Select`;
      const methodName = this.getMethodName(baseName, 'select');

      const pageUrl = this.page?.url() || '';
      
      return {
        pageId: pageClassification.pageId,
        action: 'select',
        description: description,
        locator: locator,
        value: event.value || elementInfo.value,
        fieldName,
        methodName,
        order: 0,
        timestamp: new Date(),
        // Page identity information
        pageUrl,
        mi: this.currentPageIdentity?.mi,
        cmp: this.currentPageIdentity?.cmp,
        pageType: this.currentPageIdentity?.type,
      };
    } catch (error) {
      console.error('Error processing select event:', error);
      return null;
    }
  }

  /**
   * Handle navigation events
   * Note: We don't generate steps for navigation events - they're only used for page classification
   */
  private async handleNavigateEvent(event: any): Promise<RecordedStep | null> {
    // Don't create steps for navigation events - they're too noisy
    // Navigation is handled implicitly by page transitions
    return null;
  }

  /**
   * Set up Chrome DevTools Protocol listeners for more reliable event capture
   */
  private async setupCDPListeners(page: Page): Promise<void> {
    const client = await page.context().newCDPSession(page);
    
    // Enable DOM and Runtime domains
    await client.send('Runtime.enable');
    await client.send('DOM.enable');

    // Listen for DOM events
    client.on('Runtime.bindingCalled', (event) => {
      // Handle CDP events if needed
    });
  }
}

