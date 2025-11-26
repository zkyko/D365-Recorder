# D365 Auto-Recorder & POM Generator - Project Overview

## 🎯 What This Project Is

**D365 Auto-Recorder & POM Generator** is a standalone Windows desktop application built with Electron that automates the creation of Playwright test automation code for Microsoft Dynamics 365 Finance & Operations (F&O). 

Instead of manually writing Page Object Models and test specifications, QA engineers can simply interact with D365 in a browser, and the tool automatically generates production-ready Playwright code.

## 🔍 The Problem We're Solving

### The Challenge
Creating test automation for Dynamics 365 Finance & Operations is uniquely difficult because:

1. **Complex UI Architecture**: D365 F&O doesn't behave like a standard web application
   - Deeply nested iframes (often `iframe[name^='b']` or `iframe[data-dyn-role='contentFrame']`)
   - Heavy asynchronous operations requiring custom wait strategies
   - Virtualized grids (only visible rows exist in DOM)
   - Special interaction requirements (blur events, tab navigation)

2. **Time-Consuming Manual Work**: QA teams spend hours:
   - Writing Page Object Model classes
   - Extracting and maintaining stable locators
   - Creating test specifications
   - Mapping test data to methods
   - Debugging brittle selectors

3. **Maintainability Issues**: As D365 updates, manually written locators break, requiring constant maintenance across hundreds of test files.

### Our Solution
Record once, generate always. Our tool:
- **Records** user interactions in D365 in real-time
- **Extracts** stable, maintainable locators (prioritizing `data-dyn-controlname` and `aria-label`)
- **Generates** semantic Page Object Models with proper D365-aware patterns
- **Creates** data-driven test specifications ready for execution
- **Maintains** consistency across all generated code

## ✨ What It's Supposed to Do

### Core Functionality

#### 1. **Interactive Recording Engine**
- Records clicks, form inputs, navigation, and user interactions in D365
- Captures page transitions and identifies D365 form patterns (List Pages, Details Pages, Workspaces, Dialogs)
- Maintains session state and handles authentication

#### 2. **Smart Locator Extraction**
- Automatically extracts locators using D365-specific strategies
- Prioritizes semantic attributes (`data-dyn-controlname`, `aria-label`) over fragile CSS classes
- Handles iframe navigation and frame-aware locators
- Detects parameterized inputs (different values = test data candidates)

#### 3. **Page Object Model Generation (Method #1)**
Generates TypeScript/JavaScript POM classes with:
- **Semantic Method Names**: `fillCustomerAccount()` instead of `clickButton5()`
- **Parameterized Methods**: Methods accept parameters, not hardcoded values
- **D365-Aware Patterns**: 
  - Built-in `waitForNotBusy()` for async operations
  - Automatic frame resolution
  - Proper blur event handling (Tab key presses)
  - Grid virtualization handling

Example generated code:
```typescript
export class SalesOrderPage extends D365BasePage {
  async fillCustomerAccount(account: string) {
    await this.waitForNotBusy();
    await this.custAccount.fill(account);
    await this.custAccount.press('Tab'); // Critical for D365 validation
    await this.waitForNotBusy();
  }
}
```

#### 4. **Test Specification Generation (Method #2)**
Creates Playwright test files that:
- Import JSON data files for data-driven testing
- Map JSON keys to POM method arguments automatically
- Generate one test case per JSON data object
- Include audit attachments (data used in test reports)

Example generated spec:
```typescript
import dataSet from './data/salesOrderData.json';
import { SalesOrderPage } from './pages/SalesOrderPage';

test.describe('Sales Order Data Driven', () => {
  for (const data of dataSet) {
    test(`Create SO: ${data.testCaseId}`, async ({ page }) => {
      const pom = new SalesOrderPage(page);
      await pom.fillCustomerAccount(data.customerAccount);
      await pom.addItem(data.itemId, data.qty);
      await pom.confirm();
    });
  }
});
```

#### 5. **Standalone Desktop Application**
- No Node.js installation required for end users
- Portable executable (`.exe`) with embedded Playwright browsers
- Persistent configuration (D365 URL, authentication state, preferences)
- First-run setup wizard for easy onboarding

### Current Architecture

```
┌─────────────────────────────────────┐
│   Electron Desktop Application      │
│   (React UI + Node.js Main Process) │
└─────────────────────────────────────┘
                │
                ├─── Recording Engine
                │    └─── Captures user interactions
                │
                ├─── Locator Extractor
                │    └─── Finds stable D365 locators
                │
                ├─── Page Classifier
                │    └─── Identifies D365 form patterns
                │
                ├─── POM Generator
                │    └─── Generates Page Object Models
                │
                └─── Spec Generator
                     └─── Generates test specifications
```

## 📋 Project Plan & Roadmap

### ✅ Phase 1: Core Recording & Generation (Completed)
- [x] Electron desktop application shell
- [x] Interactive recording engine for D365 interactions
- [x] Smart locator extraction with D365-aware strategies
- [x] Page classification (List Pages, Details Pages, Workspaces, etc.)
- [x] POM generation with semantic method names
- [x] Test specification generation (data-driven)
- [x] Standalone application packaging
- [x] Persistent configuration system
- [x] First-run setup wizard

### 🔄 Phase 2: Test Execution & BrowserStack Integration (In Progress)
**Goal**: Enable users to execute generated tests directly from the application, both locally and on BrowserStack cloud infrastructure.

#### A. Test Runner UI Component
- [ ] Test spec browser/list view
- [ ] JSON data editor (grid/form for editing test data)
- [ ] Real-time console log viewer
- [ ] Pass/fail status display
- [ ] Test execution controls (Run Local / Run BrowserStack)

#### B. Execution Engine
- [ ] IPC handlers for test execution (`run-test-local`, `run-test-browserstack`)
- [ ] Child process spawning for Playwright test runs
- [ ] Real-time stdout/stderr streaming to UI
- [ ] Test result parsing and display

#### C. BrowserStack Integration
- [ ] BrowserStack configuration file (`playwright.browserstack.config.ts`)
- [ ] CDP (Chrome DevTools Protocol) connection to BrowserStack
- [ ] Credential management (stored securely in electron-store)
- [ ] Environment variable injection for BrowserStack credentials
- [ ] BrowserStack.yml configuration support

#### D. Data Integrity & Audit Trail
- [ ] JSON data backup system (`.bak` files before overwrite)
- [ ] Test data attachment to Playwright reports
- [ ] Historical test data verification capability

### 🎯 Phase 3: Advanced Features (Planned)

#### Enhanced Locator Strategies
- [ ] ML-based locator stability scoring
- [ ] Automatic locator regeneration when patterns change
- [ ] Locator suggestion for ambiguous elements

#### Test Maintenance Tools
- [ ] Bulk locator updates across generated POMs
- [ ] Test data validation and schema enforcement
- [ ] Change detection and impact analysis

#### Integration & Reporting
- [ ] CI/CD pipeline integration (Azure DevOps, Jenkins)
- [ ] Test execution scheduling
- [ ] Custom reporting dashboard
- [ ] Test coverage analytics

#### Collaboration Features
- [ ] Shared test data repositories
- [ ] Team recording sessions
- [ ] Code review workflows for generated POMs

## 🏗️ Technical Stack

- **Desktop Framework**: Electron v27
- **Frontend**: React + TypeScript
- **Automation Engine**: Playwright v1.40
- **Build Tool**: electron-builder
- **Configuration Storage**: electron-store
- **Cloud Testing**: BrowserStack (planned)

## 📁 Key Components

### Core Engine (`src/core/`)
- **Recorder Engine**: Captures and processes user interactions
- **Locator Extractor**: Finds stable D365 locators using semantic attributes
- **Page Classifier**: Identifies D365 form patterns (List, Details, Workspace, etc.)
- **Browser Manager**: Manages Playwright browser instances
- **Session Manager**: Handles recording sessions and state

### Generators (`src/generators/`)
- **POM Generator**: Creates Page Object Model classes
- **Spec Generator**: Creates Playwright test specifications
- **Code Formatter**: Ensures consistent code style

### Main Process (`src/main/`)
- **Bridge**: IPC communication between UI and main process
- **Config Manager**: Handles persistent configuration
- **Test Executor**: Executes Playwright tests (in development)

### Utilities (`src/utils/`)
- **D365 Base**: Abstract base class with D365-specific utilities (`waitForNotBusy()`, frame handling)

## 🎯 Success Metrics

1. **Time Savings**: Reduce POM creation time from hours to minutes (target: 80% reduction)
2. **Code Quality**: Generated code follows D365 best practices automatically
3. **Maintainability**: Stable locators reduce breakage rate (target: <5% breakage on D365 updates)
4. **Adoption**: Scale to 500-600+ test cases as outlined in design guidelines
5. **Reliability**: Generated tests run successfully on first execution

## 🔐 Security & Best Practices

- **Credentials**: BrowserStack credentials stored locally in electron-store, never hardcoded
- **Authentication**: D365 authentication state persisted securely
- **Data Privacy**: All recordings and generated code stored locally by default
- **Code Quality**: Generated code follows Playwright and TypeScript best practices

## 📚 Additional Documentation

- `README.md` - User guide and quick start
- `D365 Auto-Recorder & POM Generator.md` - Architecture & implementation guide
- `D365 POM Design Guidelines.md` - Design patterns and best practices
- `STANDALONE_APP_GUIDE.md` - Standalone application details
- `executorUpdate.md` - Test executor implementation plan

## 🤝 Contributing

This project is designed to scale to enterprise-level test automation for Dynamics 365 Finance & Operations. All generated code follows Microsoft UX patterns and Playwright best practices to ensure long-term maintainability.

---

**Last Updated**: Based on current project state  
**Status**: Core recording and generation complete, test execution features in development

