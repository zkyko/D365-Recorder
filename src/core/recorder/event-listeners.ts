import { Page } from 'playwright';

/**
 * Injects event listeners into the page to intercept user interactions
 */
export class EventListeners {
  /**
   * Inject scripts to intercept clicks, inputs, and other interactions
   */
  static async injectListeners(page: Page, onEvent: (event: any) => void): Promise<void> {
    // Expose functions that can be called from the page
    await page.exposeFunction('recorderOnClick', async (data: any) => {
      onEvent({ type: 'click', ...data });
    });

    await page.exposeFunction('recorderOnInput', async (data: any) => {
      onEvent({ type: 'fill', ...data });
    });

    await page.exposeFunction('recorderOnChange', async (data: any) => {
      onEvent({ type: 'select', ...data });
    });

    // Inject a script that will intercept DOM events and call our exposed functions
    await page.addInitScript(() => {
      // Helper to get element identifier
      const getElementId = (element: HTMLElement): string => {
        if (element.id) return `#${element.id}`;
        if (element.getAttribute('data-test-id')) return `[data-test-id="${element.getAttribute('data-test-id')}"]`;
        if (element.getAttribute('data-qa')) return `[data-qa="${element.getAttribute('data-qa')}"]`;
        if (element.getAttribute('name')) return `[name="${element.getAttribute('name')}"]`;
        // Generate a unique selector path
        const path: string[] = [];
        let current: HTMLElement | null = element;
        while (current && current.nodeType === Node.ELEMENT_NODE) {
          let selector = current.tagName.toLowerCase();
          if (current.id) {
            path.unshift(`#${current.id}`);
            break;
          }
          let index = 1;
          let sibling = current.previousElementSibling;
          while (sibling) {
            if (sibling.tagName === current.tagName) index++;
            sibling = sibling.previousElementSibling;
          }
          if (index > 1) selector += `:nth-of-type(${index})`;
          path.unshift(selector);
          current = current.parentElement;
          if (path.length > 10) break;
        }
        return path.join(' > ');
      };

      // Debounce map for input events (to avoid recording each keystroke)
      const inputDebounceTimers = new Map<HTMLElement, number>();

      // Intercept click events
      document.addEventListener('click', async (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (target && (window as any).recorderOnClick) {
          try {
            const elementId = getElementId(target);
            await (window as any).recorderOnClick({
              selector: elementId,
              timestamp: Date.now(),
            });
          } catch (error) {
            // Silently ignore if function not available yet
          }
        }
      }, true);

      // Intercept input events (debounced to avoid multiple steps per field)
      document.addEventListener('input', async (event: Event) => {
        const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
          // Clear existing timer for this element
          const existingTimer = inputDebounceTimers.get(target as HTMLElement);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }
          
          // Set new timer - only fire after 800ms of no typing
          const timer = window.setTimeout(async () => {
            if ((window as any).recorderOnInput) {
              try {
                const elementId = getElementId(target as HTMLElement);
                await (window as any).recorderOnInput({
                  selector: elementId,
                  value: target.value,
                  timestamp: Date.now(),
                });
                // Remove timer from map after firing
                inputDebounceTimers.delete(target as HTMLElement);
              } catch (error) {
                // Silently ignore if function not available yet
              }
            }
          }, 800); // 800ms debounce delay
          
          inputDebounceTimers.set(target as HTMLElement, timer);
        }
      }, true);

      // Intercept change events
      document.addEventListener('change', async (event: Event) => {
        const target = event.target as HTMLInputElement | HTMLSelectElement;
        if (target && (window as any).recorderOnChange) {
          try {
            const elementId = getElementId(target);
            await (window as any).recorderOnChange({
              selector: elementId,
              value: target.value,
              timestamp: Date.now(),
            });
          } catch (error) {
            // Silently ignore if function not available yet
          }
        }
      }, true);
    });

    // Also inject after page loads in case addInitScript didn't work
    await page.evaluate(() => {
      // Helper to get element identifier
      const getElementId = (element: HTMLElement): string => {
        if (element.id) return `#${element.id}`;
        if (element.getAttribute('data-test-id')) return `[data-test-id="${element.getAttribute('data-test-id')}"]`;
        if (element.getAttribute('data-qa')) return `[data-qa="${element.getAttribute('data-qa')}"]`;
        if (element.getAttribute('name')) return `[name="${element.getAttribute('name')}"]`;
        const path: string[] = [];
        let current: HTMLElement | null = element;
        while (current && current.nodeType === Node.ELEMENT_NODE) {
          let selector = current.tagName.toLowerCase();
          if (current.id) {
            path.unshift(`#${current.id}`);
            break;
          }
          let index = 1;
          let sibling = current.previousElementSibling;
          while (sibling) {
            if (sibling.tagName === current.tagName) index++;
            sibling = sibling.previousElementSibling;
          }
          if (index > 1) selector += `:nth-of-type(${index})`;
          path.unshift(selector);
          current = current.parentElement;
          if (path.length > 10) break;
        }
        return path.join(' > ');
      };

      // Debounce map for input events (to avoid recording each keystroke)
      const inputDebounceTimers = new Map<HTMLElement, number>();

      // Intercept click events
      document.addEventListener('click', async (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (target && (window as any).recorderOnClick) {
          try {
            const elementId = getElementId(target);
            await (window as any).recorderOnClick({
              selector: elementId,
              timestamp: Date.now(),
            });
          } catch (error) {
            console.error('Recorder click error:', error);
          }
        }
      }, true);

      // Intercept input events (debounced to avoid multiple steps per field)
      document.addEventListener('input', async (event: Event) => {
        const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
          // Clear existing timer for this element
          const existingTimer = inputDebounceTimers.get(target as HTMLElement);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }
          
          // Set new timer - only fire after 800ms of no typing
          const timer = window.setTimeout(async () => {
            if ((window as any).recorderOnInput) {
              try {
                const elementId = getElementId(target as HTMLElement);
                await (window as any).recorderOnInput({
                  selector: elementId,
                  value: target.value,
                  timestamp: Date.now(),
                });
                // Remove timer from map after firing
                inputDebounceTimers.delete(target as HTMLElement);
              } catch (error) {
                console.error('Recorder input error:', error);
              }
            }
          }, 800); // 800ms debounce delay
          
          inputDebounceTimers.set(target as HTMLElement, timer);
        }
      }, true);

      // Intercept change events
      document.addEventListener('change', async (event: Event) => {
        const target = event.target as HTMLInputElement | HTMLSelectElement;
        if (target && (window as any).recorderOnChange) {
          try {
            const elementId = getElementId(target);
            await (window as any).recorderOnChange({
              selector: elementId,
              value: target.value,
              timestamp: Date.now(),
            });
          } catch (error) {
            console.error('Recorder change error:', error);
          }
        }
      }, true);
    });

    // Listen for navigation
    page.on('framenavigated', () => {
      onEvent({ type: 'navigate', url: page.url(), timestamp: Date.now() });
    });
  }

  /**
   * Set up Playwright's built-in request interception for better control
   */
  static async setupPlaywrightListeners(page: Page, onEvent: (event: any) => void): Promise<void> {
    // Use Playwright's route interception to detect navigation
    await page.route('**/*', (route) => {
      route.continue();
    });

    // Monitor console for D365-specific events (optional)
    page.on('console', (msg) => {
      // Could be used to detect D365-specific UI changes
    });
  }
}

