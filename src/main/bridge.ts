import { ipcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { SessionManager } from '../core/session/session-manager';
import { BrowserManager } from '../core/playwright/browser-manager';
import { RecorderEngine } from '../core/recorder/recorder-engine';
import { POMGenerator } from '../generators/pom-generator';
import { SpecGenerator } from '../generators/spec-generator';
import { CodeFormatter } from '../generators/code-formatter';
import { SessionConfig, OutputConfig, RecordedStep } from '../types';
import { ConfigManager } from './config-manager';

/**
 * IPC bridge between React UI and Node.js core
 */
export class IPCBridge {
  private sessionManager: SessionManager;
  private browserManager: BrowserManager;
  private recorderEngine: RecorderEngine;
  private pomGenerator: POMGenerator;
  private specGenerator: SpecGenerator;
  private codeFormatter: CodeFormatter;
  private currentSessionId: string | null = null;
  private configManager: ConfigManager;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    this.sessionManager = new SessionManager();
    this.browserManager = new BrowserManager();
    // RecorderEngine will be created per session with module context
    this.recorderEngine = new RecorderEngine();
    this.pomGenerator = new POMGenerator();
    this.specGenerator = new SpecGenerator();
    this.codeFormatter = new CodeFormatter();
  }

  /**
   * Get storage state path from config or default
   */
  private getStorageStatePath(): string {
    const config = this.configManager.getConfig();
    if (config.storageStatePath && fs.existsSync(config.storageStatePath)) {
      return config.storageStatePath;
    }
    // Fallback to config manager's default
    return this.configManager.getStorageStatePath();
  }

  /**
   * Get D365 URL from config or env
   */
  private getD365Url(config?: { d365Url?: string }): string | null {
    const appConfig = this.configManager.getConfig();
    return config?.d365Url || appConfig.d365Url || process.env.D365_URL || null;
  }

  /**
   * Check if authentication is needed
   */
  checkAuthentication(): { needsLogin: boolean; hasStorageState: boolean } {
    const storageStatePath = this.getStorageStatePath();
    const hasStorageState = this.browserManager.isStorageStateValid(storageStatePath);
    
    // If we have a valid storage state, we don't need login
    // If we don't have storage state, we'll need login (user will enter credentials in UI)
    return {
      needsLogin: !hasStorageState,
      hasStorageState,
    };
  }

  /**
   * Check storage state and determine next steps
   */
  async checkStorageState(): Promise<{
    status: 'valid' | 'missing' | 'invalid' | 'expired' | 'error';
    message: string;
    nextSteps: string[];
    storageStatePath: string;
    details?: any;
  }> {
    const storageStatePath = this.getStorageStatePath();
    const d365Url = this.getD365Url() || process.env.D365_URL || '';
    
    if (!d365Url) {
      return {
        status: 'error',
        message: 'D365 URL not configured',
        nextSteps: ['Configure D365 URL in settings'],
        storageStatePath,
      };
    }

    if (!fs.existsSync(storageStatePath)) {
      return {
        status: 'missing',
        message: 'Storage state file does not exist',
        nextSteps: [
          'Go to Setup screen',
          'Enter D365 URL and credentials',
          'Click "Sign in to D365" to create storage state',
        ],
        storageStatePath,
      };
    }

    // Test if storage state works
    const testResult = await this.browserManager.testStorageState(storageStatePath, d365Url);
    
    if (!testResult.isValid) {
      return {
        status: 'invalid',
        message: testResult.error || 'Storage state is invalid',
        nextSteps: [
          'Storage state file is corrupted or invalid',
          'Go to Setup screen',
          'Re-enter credentials and sign in again',
        ],
        storageStatePath,
        details: testResult.details,
      };
    }

    if (!testResult.isWorking) {
      return {
        status: 'expired',
        message: 'Storage state exists but authentication has expired',
        nextSteps: [
          'Go to Setup screen',
          'Re-enter credentials and sign in again',
          'This will update the storage state',
        ],
        storageStatePath,
        details: testResult.details,
      };
    }

    return {
      status: 'valid',
      message: 'Storage state is valid and working',
      nextSteps: [
        'You can start recording sessions',
        'Tests can run with authentication',
      ],
      storageStatePath,
      details: testResult.details,
    };
  }

  /**
   * Register all IPC handlers
   */
  registerHandlers(): void {
    // Authentication
    ipcMain.handle('auth:check', async () => {
      return this.checkAuthentication();
    });

    // Storage state checker
    ipcMain.handle('config:check-storage-state', async () => {
      return await this.checkStorageState();
    });

    ipcMain.handle('auth:login', async (_, credentials: { username: string; password: string; d365Url?: string }) => {
      return this.handleLogin(credentials);
    });

    // Session management
    ipcMain.handle('session:start', async (_, config: SessionConfig) => {
      return this.handleStartSession(config);
    });

    ipcMain.handle('session:stop', async (_, sessionId: string) => {
      return this.handleStopSession(sessionId);
    });

    ipcMain.handle('session:getSteps', async (_, sessionId: string) => {
      return this.handleGetSteps(sessionId);
    });

    ipcMain.handle('session:updateStep', async (_, sessionId: string, stepOrder: number, description: string) => {
      return this.handleUpdateStep(sessionId, stepOrder, description);
    });

    // Code generation
    ipcMain.handle('code:generate', async (_, sessionId: string, outputConfig: OutputConfig) => {
      return this.handleGenerateCode(sessionId, outputConfig);
    });

    // Browser control
    ipcMain.handle('browser:close', async () => {
      return this.handleCloseBrowser();
    });
  }

  /**
   * Handle login flow
   */
  private async handleLogin(credentials: { username: string; password: string; d365Url?: string }): Promise<{ success: boolean; error?: string }> {
    try {
      const d365Url = credentials.d365Url || process.env.D365_URL;
      if (!d365Url) {
        return { success: false, error: 'D365 URL not configured' };
      }

      const storageStatePath = this.getStorageStatePath();

      // Launch browser if not already launched
      if (!this.browserManager.isOpen()) {
        await this.browserManager.launch({ headless: false });
      }

      // Perform login
      await this.browserManager.performLogin(
        d365Url,
        credentials.username,
        credentials.password,
        storageStatePath,
        (message) => {
          // Could emit progress events here if needed
          console.log('Login progress:', message);
        }
      );

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle start session
   */
  private async handleStartSession(config: SessionConfig): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    try {
      console.log('[Bridge] Starting session:', config.flowName);
      
      // Get storage state path and D365 URL
      const storageStatePath = config.storageStatePath || this.getStorageStatePath();
      const d365Url = this.getD365Url(config);

      console.log('[Bridge] Storage state path:', storageStatePath);
      console.log('[Bridge] D365 URL:', d365Url);

      // Check if we need authentication
      const authCheck = this.checkAuthentication();
      if (authCheck.needsLogin) {
        console.log('[Bridge] Authentication required');
        return { 
          success: false, 
          error: 'Authentication required. Please login first.' 
        };
      }

      // Create session
      console.log('[Bridge] Creating session...');
      const session = this.sessionManager.startSession(config);
      this.currentSessionId = session.id;
      console.log('[Bridge] Session created:', session.id);

      // Launch browser with storage state
      console.log('[Bridge] Launching browser...');
      const page = await this.browserManager.launch({
        headless: false,
        storageStatePath: storageStatePath,
      });
      console.log('[Bridge] Browser launched');

      // Navigate to D365
      if (d365Url) {
        console.log('[Bridge] Navigating to D365...');
        await this.browserManager.navigateToD365(d365Url);
        console.log('[Bridge] Navigation complete');
      }

      // Create recorder engine with module
      console.log('[Bridge] Creating recorder engine...');
      this.recorderEngine = new RecorderEngine(config.module);
      
      // Start recording
      console.log('[Bridge] Starting recording...');
      await this.recorderEngine.startRecording(page, (step: RecordedStep) => {
        this.sessionManager.addStep(session.id, step);
      });
      console.log('[Bridge] Recording started successfully');

      return { success: true, sessionId: session.id };
    } catch (error: any) {
      console.error('[Bridge] Error starting session:', error);
      return { success: false, error: error.message || 'Unknown error occurred' };
    }
  }

  /**
   * Handle stop session
   */
  private async handleStopSession(sessionId: string): Promise<{ success: boolean }> {
    try {
      this.recorderEngine.stopRecording();
      this.sessionManager.stopSession(sessionId);
      this.currentSessionId = null;
      return { success: true };
    } catch (error: any) {
      return { success: false };
    }
  }

  /**
   * Handle get steps
   */
  private handleGetSteps(sessionId: string): RecordedStep[] {
    return this.sessionManager.getSessionSteps(sessionId);
  }

  /**
   * Handle update step description
   */
  private handleUpdateStep(sessionId: string, stepOrder: number, description: string): { success: boolean } {
    const success = this.sessionManager.updateStepDescription(sessionId, stepOrder, description);
    return { success };
  }

  /**
   * Handle generate code
   */
  private handleGenerateCode(sessionId: string, outputConfig: OutputConfig): { success: boolean; files?: string[]; error?: string } {
    try {
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      const steps = session.steps;
      if (steps.length === 0) {
        return { success: false, error: 'No steps recorded' };
      }

      // Use recordings directory from config if not specified
      const recordingsDir = this.configManager.getOrInitRecordingsDir();
      const pagesDir = outputConfig.pagesDir || path.join(recordingsDir, 'pages');
      const testsDir = outputConfig.testsDir || path.join(recordingsDir, 'tests');

      // Generate POMs
      const pomFiles = this.pomGenerator.generatePOMs(
        steps,
        pagesDir,
        outputConfig.module || session.module
      );

      // Generate spec
      const specFile = this.specGenerator.generateSpec(
        session.flowName,
        steps,
        testsDir,
        pagesDir,
        outputConfig.module || session.module
      );

      // Create initial data file for data-driven tests
      const parameters = this.specGenerator.detectParametersFromSteps(steps);
      const modulePath = outputConfig.module || session.module ? path.join('d365', outputConfig.module || session.module) : 'd365';
      const specDir = path.join(testsDir, modulePath);
      const fileName = this.specGenerator.flowNameToFileName(session.flowName);
      const dataDir = path.join(specDir, 'data');
      const dataFilePath = path.join(dataDir, `${fileName}Data.json`);
      
      // Create data file if it doesn't exist
      if (!fs.existsSync(dataFilePath)) {
        const dataContent = this.specGenerator.generateInitialDataFile(parameters);
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(dataFilePath, dataContent, 'utf-8');
        console.log(`Generated: ${dataFilePath}`);
      }

      // Write all files
      const allFiles = [...pomFiles, specFile];
      this.codeFormatter.writeFiles(allFiles);

      return {
        success: true,
        files: allFiles.map(f => f.path),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle close browser
   */
  private async handleCloseBrowser(): Promise<{ success: boolean }> {
    try {
      await this.browserManager.close();
      return { success: true };
    } catch (error: any) {
      return { success: false };
    }
  }
}

