# D365 Auto-Recorder Standalone App Guide

## Overview

The D365 Auto-Recorder has been transformed into a standalone Windows application that can be packaged and distributed as an `.exe` installer. Users no longer need to run `npm run dev` or manage localhost servers.

## Key Features

### 1. **Persistent Configuration**
- All settings are stored using `electron-store`
- Settings persist between app launches
- No need for `.env` files or environment variables

### 2. **First-Run Setup Wizard**
- On first launch, users see a setup screen
- Choose recordings directory
- Enter D365 URL
- Sign in to D365 (creates storage state)

### 3. **Production Build**
- UI is built and bundled with the app
- No dev server required
- Loads from `dist/ui/index.html` in production

### 4. **Packaging**
- Uses `electron-builder` to create Windows installer
- Includes Playwright browsers (unpacked from asar)
- Creates `.exe` installer in `release/` directory

## Configuration Storage

Settings are stored in:
- **Windows**: `%APPDATA%/d365-autorecorder-pom-generator/config.json`

Stored values:
- `recordingsDir`: Where to save generated POMs and specs
- `d365Url`: D365 Finance & Operations URL
- `storageStatePath`: Path to saved authentication state
- `isSetupComplete`: Whether setup wizard has been completed

## Building the Standalone App

### Development Mode

```bash
# Build TypeScript and UI
npm run build:all

# Run Electron (uses built UI)
npm start
```

### Production Build

```bash
# Build everything and create installer
npm run dist

# Windows-specific build
npm run dist:win
```

The installer will be created in `release/D365 Auto Recorder & POM Generator Setup.exe`

## Setup Flow

1. **First Launch**: User sees setup screen
   - Choose recordings directory (defaults to `Documents/D365-AutoRecorder-Recordings`)
   - Enter D365 URL
   - Enter username/password
   - Click "Sign in to D365"
   - Browser opens, user completes login
   - Storage state is saved
   - Setup complete!

2. **Subsequent Launches**: 
   - App checks if setup is complete
   - If yes, shows main UI
   - If no, shows setup screen again

## Code Changes Summary

### New Files
- `src/main/config-manager.ts`: Manages persistent configuration
- `src/ui/src/components/SetupScreen.tsx`: First-run setup UI
- `src/ui/src/components/SetupScreen.css`: Setup screen styling

### Modified Files
- `src/main/index.ts`: 
  - Added config manager initialization
  - Added config IPC handlers
  - Changed to load built UI in production
  - Uses `app.isPackaged` to detect production

- `src/main/bridge.ts`:
  - Accepts `ConfigManager` in constructor
  - Uses config for storage state path and D365 URL
  - Uses config recordings directory for code generation

- `src/main/preload.ts`:
  - Added config management methods
  - Added login progress listener methods

- `src/ui/src/App.tsx`:
  - Checks config on mount
  - Shows setup screen if not complete
  - Shows main UI if setup complete

- `src/ui/src/components/SessionSetup.tsx`:
  - Loads D365 URL from config on mount

- `src/ui/src/components/CodeGeneration.tsx`:
  - Loads recordings directory from config
  - Sets default paths based on config

- `package.json`:
  - Added `electron-store` dependency
  - Added `electron-builder` dev dependency
  - Added build scripts (`build:app`, `dist`, `dist:win`)
  - Added electron-builder configuration

## Playwright Browsers in Packaged App

Playwright browsers are unpacked from the asar archive so they can be executed. The `asarUnpack` configuration in `package.json` ensures:
- `node_modules/playwright/**` is unpacked
- `node_modules/@playwright/**` is unpacked

This allows the packaged app to launch Chromium for recording.

## Environment Variables (Optional)

While the app now uses persistent config, you can still use `.env` for development:
- `D365_URL`: Fallback D365 URL
- `STORAGE_STATE_PATH`: Fallback storage state path
- `OPEN_DEVTOOLS`: Set to `true` to open DevTools in dev mode

## Troubleshooting

### Setup Screen Not Appearing
- Check if `isSetupComplete` is set in config
- Delete config file to reset setup

### Browser Not Launching
- Ensure Playwright browsers are installed: `npx playwright install chromium`
- Check that browsers are unpacked from asar

### Storage State Not Saving
- Check write permissions in user data directory
- Verify D365 URL is correct
- Check browser console for login errors

## Next Steps

1. **Create App Icon**: Add `build/icon.ico` for Windows installer
2. **Test Packaging**: Run `npm run dist:win` and test installer
3. **Distribute**: Share the `.exe` installer with users

