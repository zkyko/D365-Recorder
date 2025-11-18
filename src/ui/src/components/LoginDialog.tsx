import React, { useState, useEffect } from 'react';
import './LoginDialog.css';

interface LoginDialogProps {
  onLoginSuccess: () => void;
  onSkip?: () => void;
}

declare global {
  interface Window {
    electronAPI?: {
      checkAuth: () => Promise<{ needsLogin: boolean; hasStorageState: boolean }>;
      login: (credentials: { username: string; password: string; d365Url?: string }) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

const LoginDialog: React.FC<LoginDialogProps> = ({ onLoginSuccess, onSkip }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [d365Url, setD365Url] = useState('https://fourhands-test.sandbox.operations.dynamics.com/');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    if (!window.electronAPI) {
      setChecking(false);
      return;
    }

    try {
      const authStatus = await window.electronAPI.checkAuth();
      if (!authStatus.needsLogin) {
        // Already authenticated
        onLoginSuccess();
      }
    } catch (error: any) {
      console.error('Error checking auth:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleLogin = async () => {
    if (!username || !password || !d365Url) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);
    setProgress('Starting authentication...');

    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      const result = await window.electronAPI.login({
        username,
        password,
        d365Url,
      });

      if (result.success) {
        setProgress('Authentication successful!');
        setTimeout(() => {
          onLoginSuccess();
        }, 1000);
      } else {
        setError(result.error || 'Login failed');
        setProgress(null);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during login');
      setProgress(null);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="login-dialog-overlay">
        <div className="login-dialog">
          <div className="login-checking">Checking authentication...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-dialog-overlay">
      <div className="login-dialog">
        <h2>D365 Authentication Required</h2>
        <p className="login-description">
          Please enter your D365 credentials to continue. Your session will be saved for future use.
        </p>

        <div className="login-form">
          <div className="form-group">
            <label htmlFor="d365Url">D365 URL</label>
            <input
              id="d365Url"
              type="text"
              value={d365Url}
              onChange={(e) => setD365Url(e.target.value)}
              placeholder="https://your-instance.operations.dynamics.com/"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="username">Username / Email</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your-email@domain.com"
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={loading}
              autoComplete="current-password"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleLogin();
                }
              }}
            />
          </div>

          {error && <div className="error-message">{error}</div>}
          {progress && <div className="progress-message">{progress}</div>}

          <div className="login-actions">
            <button
              className="login-button"
              onClick={handleLogin}
              disabled={loading || !username || !password || !d365Url}
            >
              {loading ? 'Authenticating...' : 'Login'}
            </button>
            {onSkip && (
              <button
                className="skip-button"
                onClick={onSkip}
                disabled={loading}
              >
                Skip (Manual Login)
              </button>
            )}
          </div>
        </div>

        <div className="login-note">
          <p>Note: If MFA is enabled, you may need to complete authentication in the browser window that opens.</p>
        </div>
      </div>
    </div>
  );
};

export default LoginDialog;

