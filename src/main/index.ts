import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { IPCBridge } from './bridge';
import { ConfigManager } from './config-manager';
import { TestExecutor } from './test-executor';

// Load environment variables
dotenv.config();

// Disable GPU acceleration to avoid GPU process errors on Windows
app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let ipcBridge: IPCBridge;
let configManager: ConfigManager;
let testExecutor: TestExecutor;

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
      const browserManagerPath = path.join(__dirname, '..', 'core', 'playwright', 'browser-manager');
      const { BrowserManager } = require(browserManagerPath);
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

  // BrowserStack credentials
  ipcMain.handle('config:get-browserstack-credentials', () => {
    return configManager.getBrowserStackCredentials();
  });

  ipcMain.handle('config:set-browserstack-credentials', (_event, username: string, accessKey: string) => {
    configManager.setBrowserStackCredentials(username, accessKey);
    return { success: true };
  });
}

/**
 * Register test execution IPC handlers
 */
function registerTestExecutionHandlers(): void {
  // Save test data (with backup)
  ipcMain.handle('test:save-data', async (_event, dataFilePath: string, data: any) => {
    try {
      const fullPath = path.isAbsolute(dataFilePath) 
        ? dataFilePath 
        : path.join(configManager.getOrInitRecordingsDir(), 'tests', dataFilePath);

      // Validate JSON structure
      if (typeof data !== 'object' || !Array.isArray(data)) {
        throw new Error('Test data must be an array of objects');
      }

      // Create backup
      if (fs.existsSync(fullPath)) {
        const backupPath = `${fullPath}.bak`;
        fs.copyFileSync(fullPath, backupPath);
      }

      // Write new data
      fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf-8');

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Load test data
  ipcMain.handle('test:load-data', async (_event, dataFilePath: string) => {
    try {
      const recordingsDir = configManager.getOrInitRecordingsDir();
      const fullPath = path.isAbsolute(dataFilePath)
        ? dataFilePath
        : path.join(recordingsDir, 'tests', dataFilePath);

      if (!fs.existsSync(fullPath)) {
        return { success: false, error: 'Data file not found' };
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const data = JSON.parse(content);

      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // List all test spec files
  ipcMain.handle('test:list-spec-files', async () => {
    try {
      const recordingsDir = configManager.getOrInitRecordingsDir();
      const testsDir = path.join(recordingsDir, 'tests');
      
      if (!fs.existsSync(testsDir)) {
        return { success: true, specFiles: [] };
      }

      const specFiles: string[] = [];
      
      // Recursively find all .spec.ts and .generated.spec.ts files
      const findSpecFiles = (dir: string, basePath: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.join(basePath, entry.name);
          
          if (entry.isDirectory()) {
            findSpecFiles(fullPath, relativePath);
          } else if (entry.isFile() && (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.generated.spec.ts'))) {
            // Return relative path from tests directory
            specFiles.push(relativePath);
          }
        }
      };
      
      findSpecFiles(testsDir);
      
      return { success: true, specFiles: specFiles.sort() };
    } catch (error: any) {
      return { success: false, error: error.message, specFiles: [] };
    }
  });

  // Find associated data file for a spec and detect parameters
  ipcMain.handle('test:find-data-file', async (_event, specFilePath: string) => {
    try {
      const recordingsDir = configManager.getOrInitRecordingsDir();
      const specPath = path.isAbsolute(specFilePath)
        ? specFilePath
        : path.join(recordingsDir, 'tests', specFilePath);

      if (!fs.existsSync(specPath)) {
        return { success: false, error: 'Spec file not found' };
      }

      // Read spec file to find imported JSON and detect parameters
      const specContent = fs.readFileSync(specPath, 'utf-8');
      const importMatch = specContent.match(/import\s+dataSet\s+from\s+['"](.+?)['"]/);
      
      let dataPath: string | null = null;
      let parameters: string[] = [];
      
      if (importMatch) {
        const relativeDataPath = importMatch[1];
        const specDir = path.dirname(specPath);
        dataPath = path.resolve(specDir, relativeDataPath);
        
        // If data file exists, load it to get current structure
        if (fs.existsSync(dataPath)) {
          try {
            const dataContent = fs.readFileSync(dataPath, 'utf-8');
            const data = JSON.parse(dataContent);
            if (Array.isArray(data) && data.length > 0) {
              // Extract parameter names from first data object
              parameters = Object.keys(data[0]);
            }
          } catch (e) {
            // If can't parse, we'll detect from spec
          }
        }
      }
      
      // Detect parameters from spec file by looking for data.xxx patterns
      const dataPattern = /data\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
      const matches = specContent.matchAll(dataPattern);
      const detectedParams = new Set<string>();
      
      for (const match of matches) {
        detectedParams.add(match[1]);
      }
      
      // Merge detected parameters
      if (detectedParams.size > 0) {
        parameters = Array.from(detectedParams);
      }
      
      // If no data file exists but we detected parameters, suggest creating one
      if (!dataPath && parameters.length > 0) {
        const specDir = path.dirname(specPath);
        const specName = path.basename(specPath, path.extname(specPath));
        // Remove .generated if present
        const baseName = specName.replace(/\.generated$/, '');
        dataPath = path.join(specDir, 'data', `${baseName}Data.json`);
      }

      return { 
        success: true, 
        dataFilePath: dataPath,
        parameters: parameters,
        hasDataFile: dataPath ? fs.existsSync(dataPath) : false,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Run test locally
  ipcMain.handle('test:run-local', async (_event, specFilePath: string) => {
    try {
      if (!mainWindow) {
        return { success: false, error: 'Main window not available' };
      }

      // Set up event listeners for streaming output
      const outputListener = (data: string) => {
        mainWindow?.webContents.send('test:output', data);
      };

      const errorListener = (data: string) => {
        mainWindow?.webContents.send('test:error', data);
      };

      const closeListener = (code: number | null) => {
        mainWindow?.webContents.send('test:close', code);
      };

      await testExecutor.runLocal({
        specFile: specFilePath,
        onOutput: outputListener,
        onError: errorListener,
        onClose: closeListener,
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Run test on BrowserStack
  ipcMain.handle('test:run-browserstack', async (_event, specFilePath: string) => {
    try {
      if (!mainWindow) {
        return { success: false, error: 'Main window not available' };
      }

      // Set up event listeners for streaming output
      const outputListener = (data: string) => {
        mainWindow?.webContents.send('test:output', data);
      };

      const errorListener = (data: string) => {
        mainWindow?.webContents.send('test:error', data);
      };

      const closeListener = (code: number | null) => {
        mainWindow?.webContents.send('test:close', code);
      };

      await testExecutor.runBrowserStack({
        specFile: specFilePath,
        onOutput: outputListener,
        onError: errorListener,
        onClose: closeListener,
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Stop test execution
  ipcMain.handle('test:stop', () => {
    testExecutor.stop();
    return { success: true };
  });
}

app.whenReady().then(() => {
  // Initialize config manager
  configManager = new ConfigManager();
  
  // Initialize test executor
  testExecutor = new TestExecutor(configManager);
  
  // Register config handlers
  registerConfigHandlers();
  
  // Register test execution handlers
  registerTestExecutionHandlers();
  
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

