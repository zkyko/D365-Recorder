# D365 Auto-Recorder & POM Generator

A standalone Windows desktop application that automates the creation of Playwright Page Object Models (POMs) and test specifications by recording user interactions in Dynamics 365 Finance & Operations.

## 🎯 Problem & Solution

**Problem:** Creating Page Object Models and test specifications for D365 test automation is time-consuming and error-prone. QA teams spend hours manually writing Playwright code, extracting locators, and maintaining test files.

**Solution:** This tool records user interactions in D365 and automatically generates production-ready Playwright POMs and test specs, reducing creation time from hours to minutes.

## ✨ Key Features

- 🎬 **Interactive Recording** - Records clicks, form inputs, navigation, and user interactions
- 🎯 **Smart Locator Extraction** - Automatically extracts stable, maintainable locators
- 📄 **Page Object Model Generation** - Generates JavaScript POM classes with proper structure
- 🧪 **Test Specification Generation** - Creates Playwright test files ready for execution
- 💾 **Persistent Configuration** - Stores D365 URL, authentication state, and preferences
- 📦 **Standalone Application** - No Node.js installation required, portable executable

## 🚀 Quick Start

### Download & Install

1. **Download the release:**
   - Download `release.zip` from this repository (stored using Git LFS)
   - Extract to your desired location (e.g., `C:\Tools\D365-Auto-Recorder\`)

   > **Note:** If cloning the repository, you'll need Git LFS to download the release file:
   > ```bash
   > git lfs install
   > git lfs pull
   > ```

2. **Run the application:**
   - Double-click `D365 Auto Recorder & POM Generator.exe`
   - Complete the first-run setup wizard:
     - Choose recordings directory
     - Enter D365 URL
     - Sign in to D365 (saves authentication state)

3. **Start recording:**
   - Enter flow name and module
   - Click "Start Recording"
   - Interact with D365 in the browser
   - Stop recording and generate POM/test files

## 📖 Usage Guide

### Workflow

1. **Setup** - Configure recording session (flow name, module, D365 URL)
2. **Record** - Interact with D365 (recording happens automatically)
3. **Review** - Edit and refine recorded steps
4. **Generate** - Create POM and test files

### Example

**Recording a "Create Sales Order" flow:**
1. Flow Name: `create_sales_order`
2. Module: `sales`
3. Click "Start Recording"
4. Navigate: Modules → Accounts receivable → All sales orders
5. Click "New", fill fields, click "Cancel"
6. Stop recording
7. Generate files

**Generated Output:**
```
Recordings/
├── pages/d365/sales/
│   ├── dashboard.page.js
│   └── sales-order-list.page.js
└── tests/d365/sales/
    └── create_sales_order.generated.spec.js
```

## 🏗️ Architecture

- **Desktop Shell**: Electron (v27)
- **Frontend**: React + TypeScript
- **Automation Engine**: Playwright (v1.40)
- **Configuration**: electron-store
- **Build Tool**: electron-builder

## 🛠️ Development

### Prerequisites

- Node.js v18+
- Windows 10/11 (for building Windows executables)

### Setup

```bash
# Install dependencies
npm run install:all

# Build
npm run build:all

# Run in development
npm run dev:electron
```

### Development Modes

**Option 1: Built UI (Recommended for testing)**
```bash
npm run build:all
npm run dev:electron
```

**Option 2: Dev Server (Recommended for UI development)**
```bash
# Terminal 1
npm run dev:ui

# Terminal 2
npm run dev:electron
```

### Building for Production

```bash
# Build application
npm run build:app

# Create Windows package
npm run dist:win

# Package as portable ZIP
npm run package:portable
```

## 📁 Project Structure

```
AutoRecorder/
├── src/
│   ├── main/              # Electron main process
│   ├── core/              # Core engine (recorder, locators, classification)
│   ├── generators/        # POM and spec generators
│   └── ui/                # React frontend
├── scripts/               # Build and packaging scripts
├── dist/                  # Compiled output
└── release/               # Built executables
```

## 📝 Generated Code Structure

### Page Object Model Example

```javascript
class SalesOrderListPage {
  constructor(page) {
    this.page = page;
    this.newButton = page.getByRole('button', { name: 'New' });
  }
  
  async clickNew() {
    await this.newButton.click();
  }
}
```

### Test Specification Example

```javascript
test('Create sales order - auto generated', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await waitForD365Shell(page);
  
  const dashboardPage = new DashboardPage(page);
  const salesOrderListPage = new SalesOrderListPage(page);
  
  await dashboardPage.clickModules();
  await salesOrderListPage.clickNew();
  // ... more steps
});
```

## 🔧 Configuration

Settings are automatically saved to:
- **Windows**: `%APPDATA%\d365-autorecorder-pom-generator\config.json`

Includes:
- Recordings directory path
- D365 URL
- Authentication state (storage state)
- Setup completion status

## 🐛 Troubleshooting

### Application Won't Start
- Ensure all files are extracted from ZIP
- Try running as Administrator
- Check Windows Event Viewer for errors

### Browser Doesn't Launch
- Verify D365 URL is correct
- Check Windows Firewall settings
- Review application console (DevTools may auto-open on errors)

### Authentication Issues
- Re-run setup wizard (delete config file and restart)
- Verify D365 URL is correct
- Check that MFA/SSO completed successfully

### No Steps Recorded
- Ensure clicking on interactive elements (buttons, links, inputs)
- Wait for pages to fully load before clicking
- Avoid clicking on empty spaces

## 📚 Documentation

For detailed documentation, see:
- [Confluence Documentation](README_CONFLUENCE.md) - Comprehensive user and developer guide
- [Distribution Guide](DISTRIBUTION.md) - Building and packaging instructions
- [Standalone App Guide](STANDALONE_APP_GUIDE.md) - Standalone application features

## 🤝 Contributing

1. Create a feature branch
2. Make changes following code style
3. Test thoroughly (dev and production builds)
4. Submit pull request with description

## 📄 License

MIT

## 🔗 Links

- **Repository**: [GitHub](https://github.com/zkyko/D365-Recorder)
- **Release Download**: Download `release.zip` from the repository

---

**Version**: 1.0.0  
**Last Updated**: 2024
