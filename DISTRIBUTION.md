# Distribution Guide

## Building the Portable Application

### Step 1: Build the Application

```bash
npm run dist:win
```

This creates the unpacked application in `release\win-unpacked\`

### Step 2: Package as Portable ZIP

**Option A: Using PowerShell Script (Recommended)**
```bash
npm run package:portable
```

**Option B: Manual Packaging**
1. Close the application if it's running
2. Navigate to `release\` folder
3. Copy the `win-unpacked` folder
4. Rename it to `D365-Auto-Recorder-portable`
5. Copy `release\README.txt` into the folder
6. Create a ZIP file of the folder

## Distribution

### For Internal Use

1. **Create the portable package:**
   ```bash
   npm run dist:win
   npm run package:portable
   ```

2. **Share the ZIP file:**
   - Location: `release\D365-Auto-Recorder-portable.zip`
   - Size: ~150-200 MB (includes Electron runtime + Playwright browsers)

3. **Recipients:**
   - Unzip the file anywhere (e.g., `C:\Tools\D365-Auto-Recorder\`)
   - Double-click `D365 Auto Recorder & POM Generator.exe`
   - On first run, complete the setup wizard

### Windows SmartScreen Warning

Users may see "Unknown publisher" warning on first run. This is normal for internal tools without code signing.

**To proceed:**
1. Click "More info"
2. Click "Run anyway"

## What's Included

The portable package contains:
- ✅ Electron runtime (bundled)
- ✅ All application code
- ✅ React UI (pre-built)
- ✅ Playwright browsers (Chromium)
- ✅ All dependencies

**No installation required** - just unzip and run!

## Testing the Portable Build

Before distributing, test on a clean machine:

1. **On a different machine (or VM):**
   - No Node.js/npm required
   - No development tools needed
   - Just Windows 10/11

2. **Unzip and run:**
   - Extract `D365-Auto-Recorder-portable.zip`
   - Run the `.exe`
   - Complete setup wizard
   - Test recording a flow

3. **Verify:**
   - ✅ App opens
   - ✅ Chromium launches
   - ✅ Recording works
   - ✅ POM/spec files generated correctly

## File Structure

```
D365-Auto-Recorder-portable/
├── D365 Auto Recorder & POM Generator.exe
├── README.txt
├── resources/
│   ├── app.asar (bundled code)
│   └── app.asar.unpacked/
│       └── node_modules/playwright/ (browsers)
├── locales/ (UI translations)
└── [Electron runtime files]
```

## Troubleshooting

### "Access is denied" during build
- Close the application if it's running
- Try running PowerShell as Administrator

### App won't start
- Ensure all files are present in the folder
- Check Windows Event Viewer for errors
- Try running as Administrator

### Chromium not launching
- Playwright browsers are included in `app.asar.unpacked`
- If missing, rebuild with `npm run dist:win`

## Future: Code Signing (Optional)

For production distribution, you can add code signing:

1. Obtain a code signing certificate
2. Update `package.json`:
   ```json
   "win": {
     "target": "portable",
     "certificateFile": "path/to/cert.pfx",
     "certificatePassword": "password"
   }
   ```

This eliminates the SmartScreen warning but is not required for internal use.

