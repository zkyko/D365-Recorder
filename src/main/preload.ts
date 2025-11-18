import { contextBridge, ipcRenderer } from 'electron';
import { SessionConfig, OutputConfig, RecordedStep } from '../types';

/**
 * Preload script to expose safe IPC methods to renderer
 */
contextBridge.exposeInMainWorld('electronAPI', {
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
});

