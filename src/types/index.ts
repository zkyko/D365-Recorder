/**
 * Core type definitions for the D365 Auto-Recorder & POM Generator
 */

export interface RecordingSession {
  id: string;
  flowName: string;
  module: string;
  steps: RecordedStep[];
  startedAt: Date;
  finishedAt?: Date;
  targetRepo?: string;
  d365Env?: string;
}

export interface RecordedStep {
  pageId: string; // e.g. "SalesOrderPage"
  action: 'click' | 'fill' | 'select' | 'navigate' | 'wait';
  description: string; // human-readable
  locator: LocatorDefinition;
  value?: string; // for fills/selects
  order: number;
  timestamp: Date;
  // Sanitized identifiers for code generation
  fieldName?: string; // e.g. "newButton", "saveButton"
  methodName?: string; // e.g. "clickNew", "clickSave"
  // Page identity information
  pageUrl?: string;        // Full URL when step was recorded
  mi?: string;             // Menu item parameter
  cmp?: string;            // Company parameter
  pageType?: 'list' | 'details' | 'dialog' | 'workspace' | 'unknown';
}

export type LocatorDefinition =
  | { strategy: 'role'; role: string; name: string }
  | { strategy: 'label'; text: string }
  | { strategy: 'placeholder'; text: string }
  | { strategy: 'text'; text: string; exact?: boolean }
  | { strategy: 'testid'; value: string }
  | { strategy: 'd365-controlname'; controlName: string } // D365-specific: data-dyn-controlname
  | { strategy: 'css'; selector: string; flagged?: boolean }
  | { strategy: 'xpath'; expression: string; flagged?: boolean };

export interface PageClassification {
  pageId: string;
  pageName: string;
  pattern: 'ListPage' | 'DetailsPage' | 'Dialog' | 'Workspace' | 'SimpleList' | 'TableOfContents' | 'Unknown';
  url?: string;
  title?: string;
  breadcrumbs?: string[];
  ignoreForPOM?: boolean; // Set to true for auth, redirect, unknown pages
}

/**
 * Page identity extracted from URL and page content
 */
export interface PageIdentity {
  pageId: string;            // "SalesOrderListPage"
  mi?: string;               // "SalesTableListPage"
  cmp?: string;              // "FH"
  caption?: string;          // "All sales orders"
  type: 'list' | 'details' | 'dialog' | 'workspace' | 'unknown';
  routePath?: string;        // "/?cmp=FH&mi=SalesTableListPage"
  url?: string;              // Full URL
}

/**
 * Page registry entry stored in JSON
 */
export interface PageRegistryEntry extends PageIdentity {
  className: string;        // "SalesOrderListPage"
  filePath: string;         // "Recordings/pages/d365/sales/sales-order-list.page.js"
}

/**
 * Page registry - maps pageId to registry entry
 */
export type PageRegistry = Record<string, PageRegistryEntry>;

export interface SessionConfig {
  flowName: string;
  module: string;
  targetRepo?: string;
  d365Env?: string;
  d365Url?: string;
  storageStatePath?: string;
  tags?: string[];
}

export interface OutputConfig {
  pagesDir: string;
  testsDir: string;
  module?: string;
  formatCode?: boolean;
}

export interface GeneratedFile {
  path: string;
  content: string;
  type: 'pom' | 'spec';
}

