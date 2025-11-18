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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

