import * as fs from 'fs';
import * as path from 'path';
import { RecordedStep, LocatorDefinition, GeneratedFile, PageClassification, PageRegistryEntry } from '../types';
import { makePageClassName } from '../core/utils/identifiers';
import { PageRegistryManager } from '../core/registry/page-registry';

/**
 * Generates Page Object Model classes in TypeScript
 */
export class POMGenerator {
  private pageRegistry: PageRegistryManager;

  constructor() {
    this.pageRegistry = new PageRegistryManager();
  }

  /**
   * Generate POM files grouped by pageId
   */
  generatePOMs(
    steps: RecordedStep[],
    outputDir: string,
    module?: string,
    pageClassifications?: Map<string, PageClassification>
  ): GeneratedFile[] {
    // Filter out steps from ignored pages and navigation-only steps
    const validSteps = steps.filter(step => {
      // Skip steps with only body locator (no real interaction captured)
      // These are typically navigation or placeholder steps
      if (step.locator.strategy === 'css' && 
          (step.locator as any).selector === 'body') {
        return false;
      }
      return true;
    });

    // Group steps by pageId
    const stepsByPage = new Map<string, RecordedStep[]>();
    
    for (const step of validSteps) {
      if (!stepsByPage.has(step.pageId)) {
        stepsByPage.set(step.pageId, []);
      }
      stepsByPage.get(step.pageId)!.push(step);
    }

    const generatedFiles: GeneratedFile[] = [];

    // Generate one POM file per page
    for (const [pageId, pageSteps] of stepsByPage.entries()) {
      const pageClass = pageClassifications?.get(pageId);
      // Try to get page registry entry for URL-aware generation
      const registryEntry = this.pageRegistry.getPage(pageId);
      const fileName = this.pageIdToFileName(pageId);
      const modulePath = module ? path.join('d365', module) : 'd365';
      const filePath = path.join(outputDir, modulePath, `${fileName}.page.ts`);
      
      // Check if file exists to avoid duplicates
      const existingContent = this.readExistingFile(filePath);
      const content = this.generatePOMClass(pageId, pageSteps, existingContent, pageClass, registryEntry);
      
      generatedFiles.push({
        path: filePath,
        content,
        type: 'pom',
      });
    }

    return generatedFiles;
  }

  /**
   * Generate a single POM class
   */
  private generatePOMClass(
    pageId: string,
    steps: RecordedStep[],
    existingContent?: string,
    pageClass?: PageClassification,
    registryEntry?: PageRegistryEntry
  ): string {
    // Use className from registry entry if available (most accurate), otherwise generate from classification
    const className = registryEntry?.className 
      ? registryEntry.className
      : (pageClass 
          ? makePageClassName(pageClass.pageName || pageId, pageClass.pattern)
          : this.makePageClassName(pageId));
    const existingMethods = this.extractExistingMethods(existingContent);
    const existingFields = this.extractExistingFields(existingContent);

    let content = `import { Page } from '@playwright/test';\n`;
    content += `import { D365BasePage } from '../../utils/d365-base';\n\n`;
    
    // Check if base class exists
    const hasBaseClass = existingContent?.includes('extends') || false;
    if (!hasBaseClass) {
      content += `export class ${className} extends D365BasePage {\n`;
      
      // Add static properties for page identity
      if (registryEntry) {
        content += `  static pageId = '${registryEntry.pageId}';\n`;
        if (registryEntry.mi) {
          content += `  static mi = '${registryEntry.mi}';\n`;
        }
        if (registryEntry.caption) {
          content += `  static caption = '${this.escapeString(registryEntry.caption)}';\n`;
        }
        content += `  static type = '${registryEntry.type}';\n\n`;
      }
      
      // Add static URL methods if we have mi/cmp
      if (registryEntry && registryEntry.mi) {
        content += this.generateStaticURLMethods(className, registryEntry);
      }
      
      content += `  constructor(page: Page) {\n`;
      content += `    super(page);\n\n`;
      
      // Generate locator fields INSIDE constructor (after super call)
      // Use contentFrame for frame-aware locators
      const locatorFields = new Map<string, string>();
      for (const step of steps) {
        const fieldName = step.fieldName || this.generateFieldName(step);
        if (!existingFields.has(fieldName) && !locatorFields.has(fieldName)) {
          // Use contentFrame for D365 frame-aware locators
          const locatorCode = this.locatorToCode(step.locator, 'this.contentFrame');
          locatorFields.set(fieldName, `    this.${fieldName} = ${locatorCode};\n`);
        }
      }

      // Add locator fields inside constructor
      if (locatorFields.size > 0) {
        content += `    // Locators\n`;
        for (const [_, fieldCode] of locatorFields.entries()) {
          content += fieldCode;
        }
      }
      
      content += `  }\n\n`;
    } else if (existingContent) {
      // Extract the class definition from existing content
      const classMatch = existingContent.match(/class\s+\w+[^{]*\{/);
      if (classMatch) {
        content += existingContent.substring(0, existingContent.indexOf('}') + 1);
        return existingContent; // Return existing if it has base class
      }
    }

    // Generate action methods using sanitized methodName from step
    const methods = new Map<string, string>();
    for (const step of steps) {
      const methodName = step.methodName || this.generateMethodName(step);
      if (!existingMethods.has(methodName) && !methods.has(methodName)) {
        const fieldName = step.fieldName || this.generateFieldName(step);
        const methodCode = this.generateMethod(step, methodName, fieldName);
        methods.set(methodName, methodCode);
      }
    }

    // Add methods
    if (methods.size > 0) {
      content += `  // Actions\n`;
      for (const [_, methodCode] of methods.entries()) {
        content += methodCode;
        content += `\n`;
      }
    }

    content += `}\n`;

    return content;
  }

  /**
   * Generate static URL navigation methods (url, matchesUrl, goto)
   */
  private generateStaticURLMethods(className: string, registryEntry: PageRegistryEntry): string {
    let methods = '';
    
    // Import Page type is already at the top, so we can use it in static methods
    
    // url() method
    methods += `  /**\n`;
    methods += `   * Generate URL for this page\n`;
    methods += `   */\n`;
    methods += `  static url({ cmp = '${registryEntry.cmp || 'FH'}' }: { cmp?: string } = {}): string {\n`;
    methods += `    const params = new URLSearchParams();\n`;
    if (registryEntry.cmp) {
      methods += `    if (cmp) params.set('cmp', cmp);\n`;
    }
    if (registryEntry.mi) {
      methods += `    if (this.mi) params.set('mi', this.mi);\n`;
    }
    methods += `    const search = params.toString();\n`;
    methods += `    return search ? \`/?\${search}\` : '/';\n`;
    methods += `  }\n\n`;
    
    // matchesUrl() method
    methods += `  /**\n`;
    methods += `   * Check if a URL matches this page\n`;
    methods += `   */\n`;
    methods += `  static matchesUrl(url: string): boolean {\n`;
    methods += `    try {\n`;
    methods += `      const u = new URL(url, 'https://dummy'); // base for parsing\n`;
    if (registryEntry.mi) {
      methods += `      const mi = u.searchParams.get('mi');\n`;
      methods += `      return mi === this.mi;\n`;
    } else {
      methods += `      return false; // No mi parameter to match\n`;
    }
    methods += `    } catch {\n`;
    methods += `      return false;\n`;
    methods += `    }\n`;
    methods += `  }\n\n`;
    
    // goto() method
    methods += `  /**\n`;
    methods += `   * Navigate to this page\n`;
    methods += `   */\n`;
    methods += `  static async goto(page: Page, opts: { cmp?: string } = {}): Promise<void> {\n`;
    methods += `    // Navigate with reasonable timeout for D365\n`;
    methods += `    await page.goto(this.url(opts), { waitUntil: 'domcontentloaded', timeout: 120_000 });\n`;
    methods += `    // Wait for D365 to be ready\n`;
    methods += `    await this.waitForD365Ready(page);\n`;
    methods += `  }\n\n`;
    methods += `  /**\n`;
    methods += `   * Wait for D365 to be fully loaded\n`;
    methods += `   * @private\n`;
    methods += `   */\n`;
    methods += `  private static async waitForD365Ready(page: Page): Promise<void> {\n`;
    methods += `    const selectors = [\n`;
    methods += `      '[data-dyn-role="shell"]',\n`;
    methods += `      '.dyn-shell',\n`;
    methods += `      '#shell',\n`;
    methods += `      'div[aria-label*="Finance and Operations"]',\n`;
    methods += `      'nav[role="navigation"]',\n`;
    methods += `    ];\n`;
    methods += `\n`;
    methods += `    // Try each selector in order, with a reasonable timeout\n`;
    methods += `    for (const s of selectors) {\n`;
    methods += `      try {\n`;
    methods += `        await page.locator(s).first().waitFor({ state: 'visible', timeout: 60_000 });\n`;
    methods += `        await page.waitForTimeout(2000); // small extra buffer\n`;
    methods += `        return;\n`;
    methods += `      } catch {\n`;
    methods += `        // ignore and try next selector\n`;
    methods += `      }\n`;
    methods += `    }\n`;
    methods += `\n`;
    methods += `    // If none found, check if we're on D365 URL and proceed anyway\n`;
    methods += `    const currentUrl = page.url();\n`;
    methods += `    if (currentUrl.includes('dynamics.com') || currentUrl.includes('operations.dynamics.com')) {\n`;
    methods += `      await page.waitForTimeout(2000);\n`;
    methods += `      return;\n`;
    methods += `    }\n`;
    methods += `\n`;
    methods += `    throw new Error('D365 shell did not appear – maybe login page or wrong URL?');\n`;
    methods += `  }\n\n`;
    
    return methods;
  }

  /**
   * Convert locator definition to Playwright code
   * @param pageReference - Frame locator reference (e.g., 'this.contentFrame' or 'this.page')
   */
  private locatorToCode(locator: LocatorDefinition, pageReference: string = 'this.page'): string {
    switch (locator.strategy) {
      case 'd365-controlname':
        // D365-specific: data-dyn-controlname (most stable for D365)
        return `${pageReference}.locator('[data-dyn-controlname="${locator.controlName}"]')`;
      
      case 'role':
        return `${pageReference}.getByRole('${locator.role}', { name: '${this.escapeString(locator.name)}' })`;
      
      case 'label':
        return `${pageReference}.getByLabel('${this.escapeString(locator.text)}')`;
      
      case 'placeholder':
        return `${pageReference}.getByPlaceholder('${this.escapeString(locator.text)}')`;
      
      case 'text':
        const exact = locator.exact ? ', { exact: true }' : '';
        return `${pageReference}.getByText('${this.escapeString(locator.text)}'${exact})`;
      
      case 'testid':
        return `${pageReference}.locator('[data-test-id="${locator.value}"]')`;
      
      case 'css':
        return `${pageReference}.locator('${this.escapeString(locator.selector)}')`;
      
      case 'xpath':
        return `${pageReference}.locator('${this.escapeString(locator.expression)}')`;
      
      default:
        return `${pageReference}.locator('body')`;
    }
  }

  /**
   * Generate a method name from a step
   */
  private generateMethodName(step: RecordedStep): string {
    const action = step.action;
    const description = step.description.toLowerCase();
    
    // Extract key words from description
    let methodName = '';
    
    if (action === 'click') {
      // "Click New" -> "clickNew"
      // "Click 'Sales and marketing'" -> "clickSalesAndMarketing"
      const words = description.replace(/^click\s+/i, '').split(/\s+/);
      methodName = 'click' + words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    } else if (action === 'fill') {
      // "Fill 'Customer account' = 'Fabrikam'" -> "fillCustomerAccount"
      const match = description.match(/fill\s+["']([^"']+)["']/i);
      if (match) {
        const fieldName = match[1].split(/\s+/).map(w => 
          w.charAt(0).toUpperCase() + w.slice(1)
        ).join('');
        methodName = 'fill' + fieldName;
      } else {
        methodName = 'fillField';
      }
    } else if (action === 'select') {
      // "Select 'Delivery mode' = 'Standard'" -> "selectDeliveryMode"
      const match = description.match(/select\s+["']([^"']+)["']/i);
      if (match) {
        const fieldName = match[1].split(/\s+/).map(w => 
          w.charAt(0).toUpperCase() + w.slice(1)
        ).join('');
        methodName = 'select' + fieldName;
      } else {
        methodName = 'selectOption';
      }
    } else if (action === 'navigate') {
      methodName = 'goto';
    } else {
      methodName = action + 'Action';
    }

    // Clean up method name
    methodName = methodName.replace(/[^a-zA-Z0-9]/g, '');
    if (!/^[a-z]/.test(methodName)) {
      methodName = methodName.charAt(0).toLowerCase() + methodName.slice(1);
    }

    return methodName;
  }

  /**
   * Generate a field name from a step
   */
  private generateFieldName(step: RecordedStep): string {
    const action = step.action;
    const description = step.description.toLowerCase();
    
    if (action === 'click') {
      const words = description.replace(/^click\s+/i, '').split(/\s+/);
      return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('') + 'Button';
    } else if (action === 'fill') {
      const match = description.match(/fill\s+["']([^"']+)["']/i);
      if (match) {
        const fieldName = match[1].split(/\s+/).map(w => 
          w.charAt(0).toUpperCase() + w.slice(1)
        ).join('');
        return fieldName + 'Input';
      }
      return 'inputField';
    } else if (action === 'select') {
      const match = description.match(/select\s+["']([^"']+)["']/i);
      if (match) {
        const fieldName = match[1].split(/\s+/).map(w => 
          w.charAt(0).toUpperCase() + w.slice(1)
        ).join('');
        return fieldName + 'Dropdown';
      }
      return 'selectField';
    }

    return 'element';
  }

  /**
   * Generate a method implementation with D365-specific patterns
   */
  private generateMethod(step: RecordedStep, methodName: string, fieldName: string): string {
    let method = `  async ${methodName}(`;
    
    // Generate semantic parameter names based on action
    if (step.action === 'fill') {
      // Extract field name from description for better parameter naming
      const match = step.description.match(/fill\s+["']([^"']+)["']/i);
      if (match) {
        const fieldNameParam = match[1].split(/\s+/).map(w => 
          w.charAt(0).toUpperCase() + w.slice(1)
        ).join('');
        method += `${this.toCamelCase(fieldNameParam)}: string`;
      } else {
        method += `value: string`;
      }
    } else if (step.action === 'select') {
      const match = step.description.match(/select\s+["']([^"']+)["']/i);
      if (match) {
        const fieldNameParam = match[1].split(/\s+/).map(w => 
          w.charAt(0).toUpperCase() + w.slice(1)
        ).join('');
        method += `${this.toCamelCase(fieldNameParam)}: string`;
      } else {
        method += `value: string`;
      }
    }
    
    method += `): Promise<void> {\n`;
    
    // Always wait for D365 to be ready before actions
    method += `    await this.waitForNotBusy();\n`;
    
    if (step.action === 'click') {
      method += `    await this.${fieldName}.click();\n`;
      method += `    await this.waitForNotBusy();\n`;
    } else if (step.action === 'fill') {
      const paramName = method.match(/\((\w+):/)?.[1] || 'value';
      method += `    await this.${fieldName}.fill(${paramName});\n`;
      // CRITICAL: Tab key press for D365 validation/calculation
      method += `    await this.${fieldName}.press('Tab');\n`;
      method += `    await this.waitForNotBusy();\n`;
    } else if (step.action === 'select') {
      const paramName = method.match(/\((\w+):/)?.[1] || 'value';
      method += `    await this.${fieldName}.selectOption(${paramName});\n`;
      method += `    await this.waitForNotBusy();\n`;
    } else if (step.action === 'navigate') {
      method += `    await this.page.goto(process.env.D365_URL || '');\n`;
      method += `    await this.waitForNotBusy();\n`;
    }
    
    method += `  }\n`;
    
    return method;
  }

  /**
   * Convert pageId to file name (safe identifier)
   */
  private pageIdToFileName(pageId: string): string {
    // Convert PascalCase to kebab-case, ensuring valid filename
    return this.toSafeIdentifier(pageId, 'kebab')
      .replace(/-page$/, '');
  }

  /**
   * Convert string to safe JavaScript identifier (PascalCase for class names)
   */
  private toPascalCase(raw: string): string {
    return raw
      .replace(/[^a-zA-Z0-9]+/g, ' ')   // non-alnum -> space
      .split(' ')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Convert string to safe identifier (camelCase for variable names)
   */
  private toCamelCase(raw: string): string {
    const pascal = this.toPascalCase(raw);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }

  /**
   * Convert string to safe identifier (kebab-case for file names)
   */
  private toSafeIdentifier(raw: string, format: 'pascal' | 'camel' | 'kebab' = 'pascal'): string {
    const cleaned = raw
      .replace(/[^a-zA-Z0-9]+/g, ' ')   // non-alnum -> space
      .split(' ')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');

    if (format === 'kebab') {
      return cleaned
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '');
    } else if (format === 'camel') {
      return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
    }
    return cleaned;
  }

  /**
   * Make a safe page class name from a title or page name
   */
  private makePageClassName(caption: string): string {
    const base = this.toPascalCase(caption || 'Page');
    // Ensure it ends with 'Page' if it doesn't already
    if (!base.endsWith('Page')) {
      return `${base}Page`;
    }
    return base;
  }

  /**
   * Read existing file content if it exists
   */
  private readExistingFile(filePath: string): string | undefined {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      }
    } catch (error) {
      console.error(`Error reading existing file ${filePath}:`, error);
    }
    return undefined;
  }

  /**
   * Extract existing method names from file content
   */
  private extractExistingMethods(content?: string): Set<string> {
    const methods = new Set<string>();
    if (!content) return methods;

    const methodRegex = /async\s+(\w+)\s*\(/g;
    let match;
    while ((match = methodRegex.exec(content)) !== null) {
      methods.add(match[1]);
    }

    return methods;
  }

  /**
   * Extract existing field names from file content
   */
  private extractExistingFields(content?: string): Set<string> {
    const fields = new Set<string>();
    if (!content) return fields;

    const fieldRegex = /this\.(\w+)\s*=/g;
    let match;
    while ((match = fieldRegex.exec(content)) !== null) {
      fields.add(match[1]);
    }

    return fields;
  }

  /**
   * Escape string for JavaScript code
   */
  private escapeString(str: string): string {
    return str.replace(/'/g, "\\'").replace(/\n/g, '\\n');
  }
}

