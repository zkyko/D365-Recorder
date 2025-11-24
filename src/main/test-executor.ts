import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { BrowserWindow } from 'electron';
import { ConfigManager } from './config-manager';

export interface TestExecutionOptions {
  specFile: string;
  onOutput?: (data: string) => void;
  onError?: (data: string) => void;
  onClose?: (code: number | null) => void;
  useBrowserStack?: boolean;
}

/**
 * Executes Playwright tests in a child process
 */
export class TestExecutor {
  private configManager: ConfigManager;
  private currentProcess: ChildProcess | null = null;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  /**
   * Sync test files from recordings directory to project directory
   * This ensures tests can run from the project root where Playwright config exists
   */
  private async syncTestFiles(specFile: string): Promise<string> {
    const recordingsDir = this.configManager.getOrInitRecordingsDir();
    const projectRoot = this.findProjectRoot();
    const projectTestsDir = path.join(projectRoot, 'Recordings', 'tests');
    const projectPagesDir = path.join(projectRoot, 'Recordings', 'pages');
    
    // Ensure project directories exist
    fs.mkdirSync(projectTestsDir, { recursive: true });
    fs.mkdirSync(projectPagesDir, { recursive: true });
    
    // Resolve source spec path
    const sourceSpecPath = path.isAbsolute(specFile)
      ? specFile
      : path.join(recordingsDir, 'tests', specFile);
    
    if (!fs.existsSync(sourceSpecPath)) {
      throw new Error(`Test spec file not found: ${sourceSpecPath}`);
    }
    
    // Calculate relative path from recordings/tests to preserve structure
    const recordingsTestsDir = path.join(recordingsDir, 'tests');
    const relativeSpecPath = path.relative(recordingsTestsDir, sourceSpecPath);
    const destSpecPath = path.join(projectTestsDir, relativeSpecPath);
    
    // Copy spec file
    fs.mkdirSync(path.dirname(destSpecPath), { recursive: true });
    fs.copyFileSync(sourceSpecPath, destSpecPath);
    
    // Read spec to find dependencies
    const specContent = fs.readFileSync(sourceSpecPath, 'utf-8');
    
    // Copy data file if referenced
    const dataImportMatch = specContent.match(/import\s+dataSet\s+from\s+['"](.+?)['"]/);
    if (dataImportMatch) {
      const dataRelativePath = dataImportMatch[1];
      const specDir = path.dirname(sourceSpecPath);
      const sourceDataPath = path.resolve(specDir, dataRelativePath);
      
      if (fs.existsSync(sourceDataPath)) {
        // Calculate destination path preserving structure
        const dataDestDir = path.join(projectTestsDir, path.dirname(relativeSpecPath), path.dirname(dataRelativePath));
        fs.mkdirSync(dataDestDir, { recursive: true });
        const dataDestPath = path.join(dataDestDir, path.basename(dataRelativePath));
        fs.copyFileSync(sourceDataPath, dataDestPath);
      }
    }
    
    // Copy all POM files from the same module directory structure
    // This ensures we get all dependencies (POMs, base classes, etc.)
    const specModulePath = path.dirname(relativeSpecPath);
    const recordingsModulePagesDir = path.join(recordingsDir, 'pages', specModulePath);
    
    if (fs.existsSync(recordingsModulePagesDir)) {
      const projectModulePagesDir = path.join(projectPagesDir, specModulePath);
      fs.mkdirSync(projectModulePagesDir, { recursive: true });
      
      // Copy all files recursively from the module pages directory
      const copyRecursive = (src: string, dest: string) => {
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          
          if (entry.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyRecursive(srcPath, destPath);
          } else if (entry.isFile()) {
            // Copy all TypeScript files (POMs, base classes, utilities, etc.)
            if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
              fs.copyFileSync(srcPath, destPath);
            }
          }
        }
      };
      
      copyRecursive(recordingsModulePagesDir, projectModulePagesDir);
    }
    
    // Copy D365BasePage utility from project src/utils to Recordings/utils
    // POM files import it as '../../utils/d365-base', so it needs to be at Recordings/utils/
    const projectUtilsDir = path.join(projectRoot, 'Recordings', 'utils');
    fs.mkdirSync(projectUtilsDir, { recursive: true });
    
    // Copy from project src/utils/d365-base.ts
    const sourceD365Base = path.join(projectRoot, 'src', 'utils', 'd365-base.ts');
    const destD365Base = path.join(projectUtilsDir, 'd365-base.ts');
    
    if (fs.existsSync(sourceD365Base)) {
      fs.copyFileSync(sourceD365Base, destD365Base);
    } else {
      // Fallback: check if it exists in recordings directory
      const recordingsUtilsDir = path.join(recordingsDir, 'pages', 'utils');
      if (fs.existsSync(recordingsUtilsDir)) {
        const copyRecursive = (src: string, dest: string) => {
          const entries = fs.readdirSync(src, { withFileTypes: true });
          for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            
            if (entry.isDirectory()) {
              fs.mkdirSync(destPath, { recursive: true });
              copyRecursive(srcPath, destPath);
            } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
              fs.copyFileSync(srcPath, destPath);
            }
          }
        };
        copyRecursive(recordingsUtilsDir, projectUtilsDir);
      }
    }
    
    // Copy storage state file to project storage_state directory
    const config = this.configManager.getConfig();
    const storageStatePath = config.storageStatePath;
    
    if (storageStatePath && fs.existsSync(storageStatePath)) {
      const projectStorageStateDir = path.join(projectRoot, 'storage_state');
      fs.mkdirSync(projectStorageStateDir, { recursive: true });
      const destStorageState = path.join(projectStorageStateDir, 'd365.json');
      fs.copyFileSync(storageStatePath, destStorageState);
    }
    
    // Return relative path from project testDir for Playwright
    return path.relative(projectTestsDir, destSpecPath);
  }

  /**
   * Run test locally
   */
  async runLocal(options: TestExecutionOptions): Promise<void> {
    const { specFile, onOutput, onError, onClose } = options;
    
    // Sync files to project directory first
    const relativeSpecPath = await this.syncTestFiles(specFile);
    
    // Get project root (where package.json is)
    const projectRoot = this.findProjectRoot();
    
    // Spawn playwright test command
    const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const args = [
      'playwright',
      'test',
      relativeSpecPath, // Use relative path from project testDir
      '--config=playwright.config.ts',
    ];

    this.spawnProcess(command, args, projectRoot, onOutput, onError, onClose);
  }

  /**
   * Run test on BrowserStack
   */
  async runBrowserStack(options: TestExecutionOptions): Promise<void> {
    const { specFile, onOutput, onError, onClose } = options;
    
    // Get BrowserStack credentials
    const credentials = this.configManager.getBrowserStackCredentials();
    if (!credentials.username || !credentials.accessKey) {
      throw new Error('BrowserStack credentials not configured. Please set them in settings.');
    }

    // Sync files to project directory first
    const relativeSpecPath = await this.syncTestFiles(specFile);
    
    // Get project root
    const projectRoot = this.findProjectRoot();
    
    // Check if cross-env is available (for Windows compatibility)
    const hasCrossEnv = fs.existsSync(path.join(projectRoot, 'node_modules', '.bin', 'cross-env')) ||
                       fs.existsSync(path.join(projectRoot, 'node_modules', '.bin', 'cross-env.cmd'));

    // Spawn playwright test command with BrowserStack config
    const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const args = hasCrossEnv
      ? [
          'cross-env',
          `BROWSERSTACK_USERNAME=${credentials.username}`,
          `BROWSERSTACK_ACCESS_KEY=${credentials.accessKey}`,
          'npx',
          'playwright',
          'test',
          relativeSpecPath, // Use relative path from project testDir
          '--config=playwright.browserstack.config.ts',
        ]
      : [
          'playwright',
          'test',
          relativeSpecPath, // Use relative path from project testDir
          '--config=playwright.browserstack.config.ts',
        ];

    // Get storage state path from config
    const config = this.configManager.getConfig();
    const storageStatePath = config.storageStatePath || 'storage_state/d365.json';
    
    // Set environment variables
    const env = {
      ...process.env,
      BROWSERSTACK_USERNAME: credentials.username,
      BROWSERSTACK_ACCESS_KEY: credentials.accessKey,
      STORAGE_STATE_PATH: storageStatePath,
      // Enable BrowserStack Local Testing to access local files
      BROWSERSTACK_LOCAL: 'true',
    };

    this.spawnProcess(command, args, projectRoot, onOutput, onError, onClose, env);
  }

  /**
   * Spawn a child process and handle output
   */
  private spawnProcess(
    command: string,
    args: string[],
    cwd: string,
    onOutput?: (data: string) => void,
    onError?: (data: string) => void,
    onClose?: (code: number | null) => void,
    env?: NodeJS.ProcessEnv
  ): void {
    // Kill existing process if any
    if (this.currentProcess) {
      this.currentProcess.kill();
    }

    this.currentProcess = spawn(command, args, {
      cwd,
      env: env || process.env,
      shell: process.platform === 'win32',
    });

    // Handle stdout
    this.currentProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      if (onOutput) {
        onOutput(output);
      }
    });

    // Handle stderr
    this.currentProcess.stderr?.on('data', (data) => {
      const error = data.toString();
      if (onError) {
        onError(error);
      }
    });

    // Handle process close
    this.currentProcess.on('close', (code) => {
      this.currentProcess = null;
      if (onClose) {
        onClose(code);
      }
    });

    // Handle process error
    this.currentProcess.on('error', (error) => {
      if (onError) {
        onError(`Process error: ${error.message}`);
      }
      this.currentProcess = null;
    });
  }

  /**
   * Stop current test execution
   */
  stop(): void {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
  }

  /**
   * Find project root (directory containing package.json)
   */
  private findProjectRoot(): string {
    let currentDir = __dirname;
    
    // Go up from dist/main to project root
    while (currentDir !== path.dirname(currentDir)) {
      const packageJsonPath = path.join(currentDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }
    
    // Fallback to current working directory
    return process.cwd();
  }
}

