import { contextBridge, ipcRenderer } from 'electron';
import { SessionConfig, OutputConfig, RecordedStep } from '../types';

/**
 * Preload script to expose safe IPC methods to renderer
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // Configuration management
  getConfig: () => ipcRenderer.invoke('config:get'),
  chooseRecordingsDir: () => ipcRenderer.invoke('config:choose-recordings-dir'),
  saveD365Url: (url: string) => ipcRenderer.invoke('config:save-d365-url', url),
  createStorageState: (credentials: { username: string; password: string; d365Url: string }) =>
    ipcRenderer.invoke('config:create-storage-state', credentials),
  onLoginProgress: (callback: (message: string) => void) => {
    ipcRenderer.on('login:progress', (_event, message) => callback(message));
  },
  removeLoginProgressListener: () => {
    ipcRenderer.removeAllListeners('login:progress');
  },

  // Authentication
  checkAuth: () => ipcRenderer.invoke('auth:check'),
  login: (credentials: { username: string; password: string; d365Url?: string }) =>
    ipcRenderer.invoke('auth:login', credentials),

  // Session management
  startSession: (config: SessionConfig) => ipcRenderer.invoke('session:start', config),
  stopSession: (sessionId: string) => ipcRenderer.invoke('session:stop', sessionId),
  getSessionSteps: (sessionId: string) => ipcRenderer.invoke('session:getSteps', sessionId),
  updateStep: (sessionId: string, stepOrder: number, description: string) =>
    ipcRenderer.invoke('session:updateStep', sessionId, stepOrder, description),

  // Code generation
  generateCode: (sessionId: string, outputConfig: OutputConfig) =>
    ipcRenderer.invoke('code:generate', sessionId, outputConfig),

  // Browser control
  closeBrowser: () => ipcRenderer.invoke('browser:close'),

  // Test execution
  listSpecFiles: () => ipcRenderer.invoke('test:list-spec-files'),
  findDataFile: (specFilePath: string) => ipcRenderer.invoke('test:find-data-file', specFilePath),
  loadTestData: (dataFilePath: string) => ipcRenderer.invoke('test:load-data', dataFilePath),
  saveTestData: (dataFilePath: string, data: any) => ipcRenderer.invoke('test:save-data', dataFilePath, data),
  runTestLocal: (specFilePath: string) => ipcRenderer.invoke('test:run-local', specFilePath),
  runTestBrowserStack: (specFilePath: string) => ipcRenderer.invoke('test:run-browserstack', specFilePath),
  stopTest: () => ipcRenderer.invoke('test:stop'),
  onTestOutput: (callback: (data: string) => void) => {
    ipcRenderer.on('test:output', (_event, data) => callback(data));
  },
  onTestError: (callback: (data: string) => void) => {
    ipcRenderer.on('test:error', (_event, data) => callback(data));
  },
  onTestClose: (callback: (code: number | null) => void) => {
    ipcRenderer.on('test:close', (_event, code) => callback(code));
  },
  removeTestListeners: () => {
    ipcRenderer.removeAllListeners('test:output');
    ipcRenderer.removeAllListeners('test:error');
    ipcRenderer.removeAllListeners('test:close');
  },

  // BrowserStack settings
  getBrowserStackCredentials: () => ipcRenderer.invoke('config:get-browserstack-credentials'),
  setBrowserStackCredentials: (username: string, accessKey: string) => 
    ipcRenderer.invoke('config:set-browserstack-credentials', username, accessKey),

  // Storage state checker
  checkStorageState: () => ipcRenderer.invoke('config:check-storage-state'),
});

