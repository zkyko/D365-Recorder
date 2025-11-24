export interface ElectronAPI {
  // Configuration management
  getConfig: () => Promise<{
    recordingsDir: string;
    d365Url: string | undefined;
    storageStatePath: string | undefined;
    isSetupComplete: boolean;
  }>;
  chooseRecordingsDir: () => Promise<string | null>;
  saveD365Url: (url: string) => Promise<void>;
  createStorageState: (credentials: { username: string; password: string; d365Url: string }) => Promise<{ success: boolean; error?: string }>;
  onLoginProgress: (callback: (message: string) => void) => void;
  removeLoginProgressListener: () => void;

  // Authentication (legacy)
  checkAuth: () => Promise<{ needsLogin: boolean; hasStorageState: boolean }>;
  login: (credentials: { username: string; password: string; d365Url?: string }) => Promise<{ success: boolean; error?: string }>;
  
  // Session management
  startSession: (config: {
    flowName: string;
    module: string;
    targetRepo?: string;
    d365Url?: string;
    storageStatePath?: string;
  }) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
  
  stopSession: (sessionId: string) => Promise<{ success: boolean }>;
  
  getSessionSteps: (sessionId: string) => Promise<Array<{
    order: number;
    description: string;
    action: string;
    pageId: string;
    locator: any;
    value?: string;
  }>>;
  
  updateStep: (sessionId: string, stepOrder: number, description: string) => Promise<{ success: boolean }>;
  
  // Code generation
  generateCode: (
    sessionId: string,
    outputConfig: {
      pagesDir: string;
      testsDir: string;
      module?: string;
    }
  ) => Promise<{ success: boolean; files?: string[]; error?: string }>;
  
  // Browser control
  closeBrowser: () => Promise<{ success: boolean }>;

  // Test execution
  listSpecFiles: () => Promise<{ success: boolean; specFiles?: string[]; error?: string }>;
  findDataFile: (specFilePath: string) => Promise<{ 
    success: boolean; 
    dataFilePath?: string; 
    parameters?: string[];
    hasDataFile?: boolean;
    error?: string 
  }>;
  loadTestData: (dataFilePath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  saveTestData: (dataFilePath: string, data: any) => Promise<{ success: boolean; error?: string }>;
  runTestLocal: (specFilePath: string) => Promise<{ success: boolean; error?: string }>;
  runTestBrowserStack: (specFilePath: string) => Promise<{ success: boolean; error?: string }>;
  stopTest: () => Promise<{ success: boolean }>;
  onTestOutput: (callback: (data: string) => void) => void;
  onTestError: (callback: (data: string) => void) => void;
  onTestClose: (callback: (code: number | null) => void) => void;
  removeTestListeners: () => void;

  // BrowserStack settings
  getBrowserStackCredentials: () => Promise<{ username: string | undefined; accessKey: string | undefined }>;
  setBrowserStackCredentials: (username: string, accessKey: string) => Promise<{ success: boolean }>;

  // Storage state checker
  checkStorageState: () => Promise<{
    status: 'valid' | 'missing' | 'invalid' | 'expired' | 'error';
    message: string;
    nextSteps: string[];
    storageStatePath: string;
    details?: {
      exists: boolean;
      hasCookies: boolean;
      cookieCount: number;
      canAccessD365: boolean;
    };
  }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

