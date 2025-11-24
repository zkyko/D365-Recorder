# D365 Auto-Recorder & POM Generator - Testing Guide

## Overview
This guide will walk you through testing the D365 Auto-Recorder application. You will:
1. Set up the project
2. Record a D365 workflow
3. Generate POM and Spec files
4. Verify parameterized test data detection
5. Execute tests with different data values

---

## Prerequisites
- Node.js (v18 or higher) installed
- Access to a D365 Finance and Operations environment
- D365 credentials (username and password)
- Git (optional, for cloning)

---

## Step 1: Project Setup

### 1.1 Clone or Navigate to Project Directory
```bash
cd /path/to/D365-Recorder
```

### 1.2 Install Dependencies
```bash
npm install
```

**Expected Result:** All dependencies should install without errors. You should see `node_modules` folder created.

### 1.3 Build the Project
```bash
npm run build
```

**Expected Result:** TypeScript compilation should complete successfully. You should see `dist/` folder created.

### 1.4 Build the UI
```bash
npm run build:ui
```

**Expected Result:** UI build should complete. You should see files in `dist/ui/` folder.

---

## Step 2: Launch the Application

### 2.1 Start the Electron App
```bash
npm run dev:electron
```

**Expected Result:** 
- The Electron application window should open
- You should see the "D365 Auto-Recorder & POM Generator" interface
- If this is the first run, you'll see a Setup screen

---

## Step 3: Initial Setup (First Time Only)

### 3.1 Complete Application Setup
1. **Choose Recordings Directory**
   - Click "Choose Folder" button
   - Select a directory where recordings will be saved (e.g., `~/Documents/D365-AutoRecorder-Recordings`)
   - Click "Select Folder"

2. **Enter D365 URL**
   - Enter your D365 instance URL (e.g., `https://your-instance.sandbox.operations.dynamics.com/`)
   - The URL should auto-save when you click away from the field

3. **Sign In to D365**
   - Enter your D365 username/email
   - Enter your D365 password
   - Click "Sign in to D365"
   - A browser window will open for authentication
   - Complete any MFA if required
   - Wait for "Login successful!" message

**Expected Result:**
- Setup screen should disappear
- You should see the main application interface with tabs: Setup, Recording, Review, Generate, Test Runner

### 3.2 Verify Storage State Status
1. Click on the **"Setup"** tab
2. You should see a **"Storage State Status"** section at the top
3. Status should show **"VALID"** (green background)
4. Message should say "Storage state is valid and working"

**Expected Result:** Green status badge with "VALID" status, indicating authentication is saved and working.

---

## Step 4: Record a Test Flow

### 4.1 Start a Recording Session
1. Click on the **"Setup"** tab (if not already there)
2. Fill in the form:
   - **Flow Name***: Enter a descriptive name (e.g., `create_sales_order`, `create_customer`, `create_purchase_order`)
   - **Module***: Enter the module name (e.g., `sales`, `ar`, `inventory`, `procurement`)
   - **Target Repo Path (optional)**: Leave empty or enter a path
   - **D365 URL (optional)**: Should be pre-filled from setup
   - **Storage State Path (optional)**: Should be pre-filled
3. Click **"Start Recording"** button

**Expected Result:**
- Button should change to "Starting..."
- A browser window should open and navigate to D365
- You should be automatically logged in (no login screen)
- The "Recording" tab should become active
- You should see "Recording..." status indicator

### 4.2 Perform Your Test Flow in D365

**⚠️ IMPORTANT NOTE:**
- **ALWAYS TYPE VALUES DIRECTLY** - Do not click on dropdowns and select from the list
- **Type the value and press Enter** - This ensures proper field detection and parameterization
- For example:
  - ✅ **CORRECT**: Type "10" in Mode of Delivery field, then press Enter
  - ❌ **INCORRECT**: Click dropdown, scroll, and click "10" from the list

**Example Flow - Create Sales Order:**
1. Navigate to Sales Order creation page
2. Click "New" button
3. **Type** a customer account number (e.g., "US-001") and press Enter
4. **Type** an item number (e.g., "1000") and press Enter
5. **Type** a quantity (e.g., "5") and press Enter
6. **Type** Mode of Delivery (e.g., "10") and press Enter
7. Click "OK" or "Save" button
8. Wait for the order to be created

**Expected Result:**
- Each action should be captured in the Recording panel
- You should see steps appearing in the "Captured Steps" list
- Steps should show: order number, description, action type, and page ID

### 4.3 Stop Recording
1. Once you've completed your flow, click **"Stop Recording"** button in the Recording panel
2. Wait for the recording to stop

**Expected Result:**
- Recording status should change to "Stopped"
- You should be automatically navigated to the "Review" tab
- You should see all captured steps listed

---

## Step 5: Review and Generate Code

### 5.1 Review Captured Steps
1. In the **"Review"** tab, verify all steps are captured correctly
2. You can edit step descriptions if needed (optional)
3. Verify the flow looks correct

**Expected Result:**
- All steps from your recording should be visible
- Steps should be in the correct order
- Each step should have a clear description

### 5.2 Generate POM and Spec Files
1. Click **"Generate"** button (or navigate to "Generate" tab)
2. Wait for code generation to complete

**Expected Result:**
- You should see console messages like:
  ```
  Generated: /path/to/Recordings/pages/d365/sales/dashboard.page.ts
  Generated: /path/to/Recordings/pages/d365/sales/salesorderdetailspage.page.ts
  Generated: /path/to/Recordings/tests/d365/sales/createsalesorder.generated.spec.ts
  ```
- Files should be created in your recordings directory
- A success message should appear

### 5.3 Verify Generated Files
Navigate to your recordings directory and verify:
- **POM Files**: Should be in `Recordings/pages/d365/[module]/` directory
  - Files should have `.page.ts` extension
  - Should contain TypeScript class definitions extending `D365BasePage`
- **Spec File**: Should be in `Recordings/tests/d365/[module]/` directory
  - File should have `.generated.spec.ts` extension
  - Should contain Playwright test code
- **Data File**: Should be in `Recordings/tests/d365/[module]/data/` directory
  - File should have `[flowName]Data.json` extension
  - Should contain JSON array with test data structure

**Expected Result:**
- All files should exist
- Spec file should import the data file: `import dataSet from './data/createsalesorderData.json';`
- Spec file should use data-driven test structure: `test.describe('... - Data Driven', () => { for (const data of dataSet) { ... } })`

---

## Step 6: Verify Parameterized Values

### 6.1 Check Spec File for Parameterization
Open the generated spec file and verify:

**Expected Pattern:**
```typescript
// Should see data-driven structure
test.describe('Createsalesorder - Data Driven', () => {
  for (const data of dataSet) {
    test(`${data.testCaseId || data.name || 'Test'}`, async ({ page }, testInfo) => {
      // ...
      await salesOrderPage.fillName(data.name);  // ✅ Should use data.name
      await salesOrderPage.fillModeOfDelivery(data.modeOfDelivery);  // ✅ Should use data.modeOfDelivery
      // NOT hardcoded values like 'Test Order 123'
    });
  }
});
```

**Verify:**
- ✅ All `fill` and `select` actions should use `data.xxx` format
- ❌ Should NOT see hardcoded values like `'Test Order 123'` or `'10'`
- ✅ Should see `import dataSet from './data/...Data.json';` at the top

### 6.2 Check Data File Structure
Open the generated data file (JSON) and verify:

**Expected Structure:**
```json
[
  {
    "testCaseId": "test-1",
    "name": "",
    "modeOfDelivery": "",
    "customerAccount": ""
  }
]
```

**Verify:**
- ✅ Should contain an array of objects
- ✅ Should have detected parameters as keys (e.g., `name`, `modeOfDelivery`, `customerAccount`)
- ✅ Values should be empty strings (ready for you to fill in)

---

## Step 7: Test Runner - Edit and Execute Tests

### 7.1 Open Test Runner
1. Click on the **"Test Runner"** tab
2. You should see the Test Runner interface

**Expected Result:**
- Left panel: Test configuration and data editor
- Right panel: Console output area
- Dropdown should show available test spec files

### 7.2 Select Your Test Spec
1. In the **"Test Spec File"** dropdown, select your generated spec file
   - Should see: `d365/sales/createsalesorder.generated.spec.ts` (or your flow name)

**Expected Result:**
- Spec file should be selected
- Test Data Editor should appear below
- Should show detected parameters (e.g., "Detected parameters: name, modeOfDelivery, customerAccount")
- Should show an initial test case with empty fields for each parameter

### 7.3 Edit Test Data
1. Fill in the test data fields:
   - **name**: Enter a test order name (e.g., "QA Test Order 1")
   - **modeOfDelivery**: Enter mode of delivery code (e.g., "10")
   - **customerAccount**: Enter customer account (e.g., "US-001")
   - Add any other detected parameters
2. Click **"Save Data"** button

**Expected Result:**
- Data should be saved to the JSON file
- Success message should appear
- You can add more test cases by clicking "Add Test Case"

### 7.4 Run Test Locally
1. Click **"Run Locally"** button
2. Watch the console output in the right panel

**Expected Result:**
- Console should show: "Starting test execution..."
- Playwright should launch a browser
- Test should execute with your data values
- You should see test progress and results
- Status should show "✅ Passed" or "❌ Failed"

### 7.5 Verify Test Execution
**What to Check:**
- ✅ Browser should open and navigate to D365
- ✅ Should be automatically logged in (no login screen)
- ✅ Test should use the values you entered in the data file
- ✅ Actions should be performed in D365
- ✅ Test should complete successfully

### 7.6 Test with Different Values
1. Edit the test data again:
   - Change the values (e.g., "QA Test Order 2", "20", "US-002")
2. Click **"Save Data"**
3. Click **"Run Locally"** again

**Expected Result:**
- Test should run again with the new values
- You should see different data being used in the test execution
- This validates the parameterization is working correctly

---

## Step 8: Verify File Sync (Behind the Scenes)

When you run a test, the application automatically syncs files from your recordings directory to the project's `Recordings/` directory. Verify this:

### 8.1 Check Project Recordings Directory
After running a test, check:
```bash
ls -la Recordings/tests/d365/sales/
ls -la Recordings/pages/d365/sales/
ls -la Recordings/utils/
ls -la storage_state/
```

**Expected Result:**
- Spec file should exist in `Recordings/tests/d365/sales/`
- POM files should exist in `Recordings/pages/d365/sales/`
- `d365-base.ts` should exist in `Recordings/utils/`
- `d365.json` should exist in `storage_state/`

---

## Step 9: Test BrowserStack Execution (Optional)

### 9.1 Configure BrowserStack
1. In Test Runner, click **"BrowserStack Settings"** button
2. Enter your BrowserStack credentials:
   - **Username**: Your BrowserStack username
   - **Access Key**: Your BrowserStack access key
3. Click **"Save"**

### 9.2 Run Test on BrowserStack
1. Select your test spec file
2. Ensure test data is saved
3. Click **"Run on BrowserStack"** button

**Expected Result:**
- Test should execute on BrowserStack infrastructure
- Console should show BrowserStack connection messages
- Test should run remotely with your data values

---

## Step 10: Validation Checklist

Use this checklist to verify everything is working:

### ✅ Setup & Configuration
- [ ] Application launches successfully
- [ ] Storage state is valid (green status)
- [ ] D365 URL is configured
- [ ] Can start a recording session

### ✅ Recording
- [ ] Browser opens and auto-logs in
- [ ] Actions are captured correctly
- [ ] Steps appear in Recording panel
- [ ] Can stop recording successfully

### ✅ Code Generation
- [ ] POM files are generated in correct location
- [ ] Spec file is generated in correct location
- [ ] Data file is generated with detected parameters
- [ ] All files are valid TypeScript/JSON

### ✅ Parameterization
- [ ] Spec file uses `data.xxx` format (not hardcoded values)
- [ ] Data file contains detected parameters
- [ ] Parameters match the fields you filled during recording

### ✅ Test Execution
- [ ] Test Runner detects spec files automatically
- [ ] Parameters are detected and displayed
- [ ] Can edit test data in UI
- [ ] Test executes successfully with entered values
- [ ] Test uses different values when data is changed
- [ ] Storage state is synced correctly
- [ ] All dependencies (POMs, utils) are available

---

## Troubleshooting

### Issue: "Storage state not found" error
**Solution:**
1. Go to Setup tab
2. Check storage state status
3. If invalid/missing, click "Sign In to Fix"
4. Re-authenticate with D365

### Issue: "No tests found" error
**Solution:**
- This should be automatically handled by file sync
- Verify files exist in `Recordings/tests/` directory
- Check that spec file has correct extension (`.generated.spec.ts`)

### Issue: Parameters not detected
**Solution:**
- Ensure you **typed values** (didn't click dropdowns)
- Regenerate the spec file
- Check that fill/select actions were recorded

### Issue: Test fails during execution
**Solution:**
- Check console output for specific error
- Verify D365 URL is correct
- Ensure storage state is valid
- Check that test data values are valid for D365

---

## Important Reminders

### ⚠️ Critical: Always Type Values
- **DO NOT** click dropdowns and select from lists
- **ALWAYS** type the value directly into the field
- **ALWAYS** press Enter after typing
- This ensures proper field detection and parameterization

### Best Practices
- Use descriptive flow names (e.g., `create_sales_order`, not `test1`)
- Use appropriate module names (e.g., `sales`, `ar`, `inventory`)
- Fill in all required fields during recording
- Review generated code before executing tests
- Test with multiple data sets to validate parameterization

---

## Expected Final Results

After completing this guide, you should have:

1. ✅ A working D365 Auto-Recorder application
2. ✅ Recorded a complete D365 workflow
3. ✅ Generated POM files (Page Object Models)
4. ✅ Generated Spec file (Playwright test)
5. ✅ Generated Data file (JSON with parameters)
6. ✅ Verified parameterized values in spec file
7. ✅ Edited test data in Test Runner UI
8. ✅ Successfully executed tests with different data values
9. ✅ Validated that tests use parameterized data (not hardcoded)

---

## Next Steps

Once validation is complete:
- Document any issues found
- Note any improvements needed
- Verify all features work as expected
- Confirm parameterization works for all field types

---

## Support

If you encounter issues not covered in this guide:
1. Check the console output for error messages
2. Verify all prerequisites are met
3. Ensure D365 environment is accessible
4. Contact the development team with specific error details

---

**Good luck with your testing! 🚀**

