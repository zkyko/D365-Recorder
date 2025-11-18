import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { IPCBridge } from './bridge';
import { ConfigManager } from './config-manager';

// Load environment variables
dotenv.config();

// Disable GPU acceleration to avoid GPU process errors on Windows
app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let ipcBridge: IPCBridge;
let configManager: ConfigManager;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load React app
  if (!mainWindow) return;
  
  const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';
  const builtUIPath = path.join(__dirname, '../ui/index.html');
  
  if (isDev) {
    // Try to load from dev server, fallback to built file
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      // If dev server not running, try built file
      if (!mainWindow) return;
      if (fs.existsSync(builtUIPath)) {
        mainWindow.loadFile(builtUIPath);
      } else {
        console.error('UI not found. Please run "npm run build:ui" or start the dev server with "npm run dev:ui"');
      }
    });
    // Only open DevTools if explicitly requested via environment variable
    if (process.env.OPEN_DEVTOOLS === 'true') {
      mainWindow.webContents.openDevTools();
    }
  } else {
    // Production: always load from built file
    if (fs.existsSync(builtUIPath)) {
      mainWindow.loadFile(builtUIPath);
    } else {
      console.error('UI not found. Please rebuild the application.');
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Register config management IPC handlers
 */
function registerConfigHandlers(): void {
  // Get current config
  ipcMain.handle('config:get', () => {
    return configManager.getConfig();
  });

  // Choose recordings directory
  ipcMain.handle('config:choose-recordings-dir', async () => {
    if (!mainWindow) return null;
    
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose Recordings Directory',
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    const dir = result.filePaths[0];
    configManager.setRecordingsDir(dir);
    return dir;
  });

  // Save D365 URL
  ipcMain.handle('config:save-d365-url', (_event, url: string) => {
    configManager.setD365Url(url);
  });

  // Create storage state (login flow)
  ipcMain.handle('config:create-storage-state', async (_event, credentials: { username: string; password: string; d365Url: string }) => {
    try {
      const storagePath = configManager.getStorageStatePath();
      
      // Use the existing BrowserManager to perform login
      const { BrowserManager } = require('../core/playwright/browser-manager');
      const browserManager = new BrowserManager();
      
      // Launch browser
      const page = await browserManager.launch({ headless: false });
      
      // Perform login
      const success = await browserManager.performLogin(
        credentials.d365Url,
        credentials.username,
        credentials.password,
        storagePath,
        (message: string) => {
          // Send progress updates to renderer
          if (mainWindow) {
            mainWindow.webContents.send('login:progress', message);
          }
        }
      );

      // Close browser after login
      await browserManager.close();

      if (success) {
        configManager.setStorageStatePath(storagePath);
        configManager.setSetupComplete(true);
        return { success: true, storagePath };
      } else {
        return { success: false, error: 'Login failed' };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to create storage state' };
    }
  });
}

app.whenReady().then(() => {
  // Initialize config manager
  configManager = new ConfigManager();
  
  // Register config handlers
  registerConfigHandlers();
  
  // Initialize IPC bridge (will use config manager for settings)
  ipcBridge = new IPCBridge(configManager);
  ipcBridge.registerHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

