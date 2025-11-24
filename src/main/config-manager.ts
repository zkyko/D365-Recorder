import Store from 'electron-store';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

interface ConfigSchema {
  recordingsDir: string;
  d365Url: string;
  storageStatePath: string;
  isSetupComplete: boolean;
  browserstackUsername?: string;
  browserstackAccessKey?: string;
}

/**
 * Manages persistent application configuration using electron-store
 * Using type assertion to work around TypeScript type issues with electron-store v11
 */
export class ConfigManager {
  private store: Store<ConfigSchema>;
  // Type assertion to access get/set methods
  private storeAccess: {
    get: <K extends keyof ConfigSchema>(key: K) => ConfigSchema[K];
    set: <K extends keyof ConfigSchema>(key: K, value: ConfigSchema[K]) => void;
  };

  constructor() {
    this.store = new Store<ConfigSchema>({
      name: 'd365-autorecorder-config',
      defaults: {
        recordingsDir: '',
        d365Url: '',
        storageStatePath: '',
        isSetupComplete: false,
        browserstackUsername: '',
        browserstackAccessKey: '',
      },
    });
    // Type assertion to access get/set methods
    this.storeAccess = this.store as any;
  }

  /**
   * Get or initialize recordings directory
   */
  getOrInitRecordingsDir(): string {
    let dir = this.storeAccess.get('recordingsDir');
    
    if (!dir || !fs.existsSync(dir)) {
      // Default to Documents/D365-AutoRecorder-Recordings
      const defaultDir = path.join(
        app.getPath('documents'),
        'D365-AutoRecorder-Recordings'
      );
      fs.mkdirSync(defaultDir, { recursive: true });
      dir = defaultDir;
      this.storeAccess.set('recordingsDir', dir);
    }
    
    return dir;
  }

  /**
   * Get all configuration
   */
  getConfig(): {
    recordingsDir: string;
    d365Url: string | undefined;
    storageStatePath: string | undefined;
    isSetupComplete: boolean;
  } {
    return {
      recordingsDir: this.getOrInitRecordingsDir(),
      d365Url: this.storeAccess.get('d365Url') || undefined,
      storageStatePath: this.storeAccess.get('storageStatePath') || undefined,
      isSetupComplete: this.storeAccess.get('isSetupComplete') || false,
    };
  }

  /**
   * Set recordings directory
   */
  setRecordingsDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.storeAccess.set('recordingsDir', dir);
  }

  /**
   * Set D365 URL
   */
  setD365Url(url: string): void {
    this.storeAccess.set('d365Url', url);
  }

  /**
   * Set storage state path
   */
  setStorageStatePath(storagePath: string): void {
    this.storeAccess.set('storageStatePath', storagePath);
  }

  /**
   * Mark setup as complete
   */
  setSetupComplete(complete: boolean = true): void {
    this.storeAccess.set('isSetupComplete', complete);
  }

  /**
   * Get storage state directory (in userData)
   */
  getStorageStateDir(): string {
    const userData = app.getPath('userData');
    const storageDir = path.join(userData, 'storage_state');
    fs.mkdirSync(storageDir, { recursive: true });
    return storageDir;
  }

  /**
   * Get storage state file path
   */
  getStorageStatePath(): string {
    const storageDir = this.getStorageStateDir();
    return path.join(storageDir, 'd365.json');
  }

  /**
   * Get BrowserStack credentials
   */
  getBrowserStackCredentials(): { username: string | undefined; accessKey: string | undefined } {
    return {
      username: this.storeAccess.get('browserstackUsername') || undefined,
      accessKey: this.storeAccess.get('browserstackAccessKey') || undefined,
    };
  }

  /**
   * Set BrowserStack credentials
   */
  setBrowserStackCredentials(username: string, accessKey: string): void {
    this.storeAccess.set('browserstackUsername', username);
    this.storeAccess.set('browserstackAccessKey', accessKey);
  }
}
