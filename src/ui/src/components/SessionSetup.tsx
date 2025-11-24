import React, { useState, useEffect } from 'react';
import './SessionSetup.css';

interface SessionConfig {
  flowName: string;
  module: string;
  targetRepo?: string;
  d365Url?: string;
  storageStatePath?: string;
}

interface StorageStateStatus {
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
}

interface SessionSetupProps {
  onSessionStart: (session: { id: string; flowName: string; module: string }) => void;
  onGoToSetup?: () => void;
}

declare global {
  interface Window {
    electronAPI?: {
      startSession: (config: SessionConfig) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
      getConfig: () => Promise<any>;
      checkStorageState: () => Promise<StorageStateStatus>;
      createStorageState: (credentials: { username: string; password: string; d365Url: string }) => Promise<{ success: boolean; error?: string }>;
      onLoginProgress: (callback: (message: string) => void) => void;
      removeLoginProgressListener: () => void;
    };
  }
}

const SessionSetup: React.FC<SessionSetupProps> = ({ onSessionStart, onGoToSetup }) => {
  const [flowName, setFlowName] = useState('');
  const [module, setModule] = useState('');
  const [targetRepo, setTargetRepo] = useState('');
  const [d365Url, setD365Url] = useState('');
  const [storageStatePath, setStorageStatePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageStateStatus, setStorageStateStatus] = useState<StorageStateStatus | null>(null);
  const [checkingStorageState, setCheckingStorageState] = useState(false);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authProgress, setAuthProgress] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Load config on mount to populate D365 URL
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getConfig().then((config) => {
        if (config.d365Url) {
          setD365Url(config.d365Url);
        }
        if (config.storageStatePath) {
          setStorageStatePath(config.storageStatePath);
        }
      });
    }
    // Check storage state status on mount
    checkStorageStateStatus();
    
    // Set up login progress listener
    if (window.electronAPI) {
      window.electronAPI.onLoginProgress((message) => {
        setAuthProgress(message);
      });
    }
    
    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeLoginProgressListener();
      }
    };
  }, []);

  const checkStorageStateStatus = async () => {
    if (!window.electronAPI) return;
    
    setCheckingStorageState(true);
    try {
      const status = await window.electronAPI.checkStorageState();
      setStorageStateStatus(status);
      // Auto-hide auth form if status becomes valid
      if (status.status === 'valid') {
        setShowAuthForm(false);
      }
    } catch (error) {
      console.error('Error checking storage state:', error);
      setStorageStateStatus({
        status: 'error',
        message: 'Failed to check storage state',
        nextSteps: ['Try refreshing the status'],
        storageStatePath: storageStatePath || '',
      });
    } finally {
      setCheckingStorageState(false);
    }
  };

  const handleAuthenticate = async () => {
    if (!window.electronAPI || !d365Url || !authUsername || !authPassword) {
      setError('Please fill in D365 URL, username, and password');
      return;
    }

    setIsAuthenticating(true);
    setError(null);
    setAuthProgress('Starting authentication...');

    try {
      const result = await window.electronAPI.createStorageState({
        username: authUsername.trim(),
        password: authPassword.trim(),
        d365Url: d365Url.trim(),
      });

      if (result.success) {
        setAuthProgress('Authentication successful!');
        // Clear form
        setAuthUsername('');
        setAuthPassword('');
        setShowAuthForm(false);
        // Refresh storage state status
        setTimeout(() => {
          checkStorageStateStatus();
        }, 1000);
      } else {
        setError(result.error || 'Authentication failed');
        setAuthProgress(null);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication');
      setAuthProgress(null);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleStart = async () => {
    if (!flowName || !module) {
      setError('Flow name and module are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      const result = await window.electronAPI.startSession({
        flowName,
        module,
        targetRepo: targetRepo || undefined,
        d365Url: d365Url || undefined,
        storageStatePath: storageStatePath || undefined,
      });

      if (result.success && result.sessionId) {
        onSessionStart({
          id: result.sessionId,
          flowName,
          module,
        });
      } else {
        setError(result.error || 'Failed to start session');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="session-setup">
      <h2>Session Setup</h2>
      
      {/* Storage State Status Display */}
      {storageStateStatus && (
        <div className={`storage-state-status storage-state-${storageStateStatus.status}`}>
          <div className="storage-state-header">
            <strong>Storage State Status:</strong>
            <span className="status-badge">{storageStateStatus.status.toUpperCase()}</span>
          </div>
          <p className="storage-state-message">{storageStateStatus.message}</p>
          {storageStateStatus.details && (
            <div className="storage-state-details">
              <small>
                Cookies: {storageStateStatus.details.cookieCount} | 
                Can Access D365: {storageStateStatus.details.canAccessD365 ? 'Yes' : 'No'}
              </small>
            </div>
          )}
          {storageStateStatus.nextSteps.length > 0 && (
            <div className="storage-state-next-steps">
              <strong>Next Steps:</strong>
              <ul>
                {storageStateStatus.nextSteps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="storage-state-actions">
            {(storageStateStatus.status === 'missing' || 
              storageStateStatus.status === 'invalid' || 
              storageStateStatus.status === 'expired') && (
              <button 
                className="action-button primary"
                onClick={() => setShowAuthForm(!showAuthForm)}
              >
                {showAuthForm ? 'Hide' : 'Sign In to Fix'}
              </button>
            )}
            <button 
              className="action-button secondary"
              onClick={checkStorageStateStatus}
              disabled={checkingStorageState}
            >
              {checkingStorageState ? 'Checking...' : 'Refresh Status'}
            </button>
          </div>
        </div>
      )}

      {/* Inline Authentication Form */}
      {showAuthForm && (storageStateStatus?.status === 'missing' || 
                       storageStateStatus?.status === 'invalid' || 
                       storageStateStatus?.status === 'expired') && (
        <div className="auth-form-inline">
          <h3>Re-authenticate to D365</h3>
          <p className="auth-form-description">
            Enter your credentials to create or update the storage state.
          </p>
          
          <div className="form-group">
            <label htmlFor="authUsername">Username / Email</label>
            <input
              id="authUsername"
              type="text"
              value={authUsername}
              onChange={(e) => setAuthUsername(e.target.value)}
              placeholder="your-email@domain.com"
              disabled={isAuthenticating}
            />
          </div>

          <div className="form-group">
            <label htmlFor="authPassword">Password</label>
            <input
              id="authPassword"
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={isAuthenticating}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAuthenticate();
                }
              }}
            />
          </div>

          {authProgress && (
            <div className="auth-progress">{authProgress}</div>
          )}

          <div className="auth-form-actions">
            <button
              className="action-button primary"
              onClick={handleAuthenticate}
              disabled={isAuthenticating || !authUsername || !authPassword || !d365Url}
            >
              {isAuthenticating ? 'Authenticating...' : 'Sign In'}
            </button>
            <button
              className="action-button secondary"
              onClick={() => setShowAuthForm(false)}
              disabled={isAuthenticating}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="flowName">Flow Name *</label>
        <input
          id="flowName"
          type="text"
          value={flowName}
          onChange={(e) => setFlowName(e.target.value)}
          placeholder="e.g., create_sales_order"
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="module">Module *</label>
        <input
          id="module"
          type="text"
          value={module}
          onChange={(e) => setModule(e.target.value)}
          placeholder="e.g., sales, inventory, ar"
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="targetRepo">Target Repo Path (optional)</label>
        <input
          id="targetRepo"
          type="text"
          value={targetRepo}
          onChange={(e) => setTargetRepo(e.target.value)}
          placeholder="/path/to/playwright/repo"
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="d365Url">D365 URL (optional)</label>
        <input
          id="d365Url"
          type="text"
          value={d365Url}
          onChange={(e) => setD365Url(e.target.value)}
          placeholder="https://your-d365-instance.com"
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="storageStatePath">Storage State Path (optional)</label>
        <input
          id="storageStatePath"
          type="text"
          value={storageStatePath}
          onChange={(e) => setStorageStatePath(e.target.value)}
          placeholder="/path/to/storage-state.json"
          disabled={loading}
        />
      </div>

      {error && <div className="error-message">{error}</div>}

      <button
        className="start-button"
        onClick={handleStart}
        disabled={loading || !flowName || !module}
      >
        {loading ? 'Starting...' : 'Start Recording'}
      </button>
    </div>
  );
};

export default SessionSetup;

