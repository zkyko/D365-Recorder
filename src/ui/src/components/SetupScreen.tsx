import React, { useState, useEffect } from 'react';
import './SetupScreen.css';

interface Config {
  recordingsDir: string;
  d365Url: string | undefined;
  storageStatePath: string | undefined;
  isSetupComplete: boolean;
}

interface SetupScreenProps {
  onSetupComplete: () => void;
}

declare global {
  interface Window {
    electronAPI?: {
      getConfig: () => Promise<Config>;
      chooseRecordingsDir: () => Promise<string | null>;
      saveD365Url: (url: string) => Promise<void>;
      createStorageState: (credentials: { username: string; password: string; d365Url: string }) => Promise<{ success: boolean; error?: string }>;
      onLoginProgress: (callback: (message: string) => void) => void;
      removeLoginProgressListener: () => void;
    };
  }
}

const SetupScreen: React.FC<SetupScreenProps> = ({ onSetupComplete }) => {
  const [config, setConfig] = useState<Config | null>(null);
  const [d365Url, setD365Url] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginProgress, setLoginProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    loadConfig();
    
    // Listen for login progress
    if (window.electronAPI) {
      window.electronAPI.onLoginProgress((message) => {
        setLoginProgress(message);
      });
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeLoginProgressListener();
      }
    };
  }, []);

  const loadConfig = async () => {
    if (!window.electronAPI) return;
    
    try {
      const cfg = await window.electronAPI.getConfig();
      setConfig(cfg);
      setD365Url(cfg.d365Url || '');
    } catch (err: any) {
      setError(err.message || 'Failed to load configuration');
    }
  };

  const handleChooseRecordingsDir = async () => {
    if (!window.electronAPI) return;
    
    try {
      const dir = await window.electronAPI.chooseRecordingsDir();
      if (dir) {
        await loadConfig(); // Reload to show new directory
      }
    } catch (err: any) {
      setError(err.message || 'Failed to choose directory');
    }
  };

  const handleSaveD365Url = async () => {
    if (!window.electronAPI || !d365Url.trim()) return;
    
    try {
      await window.electronAPI.saveD365Url(d365Url.trim());
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to save D365 URL');
    }
  };

  const handleLogin = async () => {
    if (!window.electronAPI || !d365Url.trim() || !username.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoggingIn(true);
    setError(null);
    setLoginProgress('Starting login...');

    try {
      const result = await window.electronAPI.createStorageState({
        username: username.trim(),
        password: password.trim(),
        d365Url: d365Url.trim(),
      });

      if (result.success) {
        setLoginProgress('Login successful!');
        setTimeout(() => {
          onSetupComplete();
        }, 1000);
      } else {
        setError(result.error || 'Login failed');
        setLoginProgress(null);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during login');
      setLoginProgress(null);
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (!config) {
    return (
      <div className="setup-screen">
        <div className="setup-loading">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="setup-screen">
      <div className="setup-container">
        <h1>D365 Auto-Recorder Setup</h1>
        <p className="setup-description">
          Welcome! Let's configure your D365 Auto-Recorder. This will only take a minute.
        </p>

        <div className="setup-section">
          <h2>1. Choose Recordings Directory</h2>
          <p className="setup-hint">Where should recordings be saved?</p>
          <div className="setup-field">
            <input
              type="text"
              value={config.recordingsDir}
              readOnly
              className="setup-input readonly"
            />
            <button
              type="button"
              onClick={handleChooseRecordingsDir}
              className="setup-button secondary"
            >
              Choose Folder
            </button>
          </div>
        </div>

        <div className="setup-section">
          <h2>2. Enter D365 URL</h2>
          <p className="setup-hint">Your D365 Finance and Operations URL</p>
          <div className="setup-field">
            <input
              type="text"
              value={d365Url}
              onChange={(e) => setD365Url(e.target.value)}
              onBlur={handleSaveD365Url}
              placeholder="https://your-instance.sandbox.operations.dynamics.com/"
              className="setup-input"
            />
          </div>
        </div>

        <div className="setup-section">
          <h2>3. Sign in to D365</h2>
          <p className="setup-hint">We'll open a browser for you to sign in</p>
          
          <div className="setup-field">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username / Email"
              className="setup-input"
              disabled={isLoggingIn}
            />
          </div>
          
          <div className="setup-field">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="setup-input"
              disabled={isLoggingIn}
            />
          </div>

          {loginProgress && (
            <div className="setup-progress">
              {loginProgress}
            </div>
          )}

          <button
            type="button"
            onClick={handleLogin}
            disabled={isLoggingIn || !d365Url.trim() || !username.trim() || !password.trim()}
            className="setup-button primary"
          >
            {isLoggingIn ? 'Signing in...' : 'Sign in to D365'}
          </button>
        </div>

        {error && (
          <div className="setup-error">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default SetupScreen;

