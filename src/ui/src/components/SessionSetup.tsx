import React, { useState, useEffect } from 'react';
import './SessionSetup.css';

interface SessionConfig {
  flowName: string;
  module: string;
  targetRepo?: string;
  d365Url?: string;
  storageStatePath?: string;
}

interface SessionSetupProps {
  onSessionStart: (session: { id: string; flowName: string; module: string }) => void;
}

declare global {
  interface Window {
    electronAPI?: {
      startSession: (config: SessionConfig) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
    };
  }
}

const SessionSetup: React.FC<SessionSetupProps> = ({ onSessionStart }) => {
  const [flowName, setFlowName] = useState('');
  const [module, setModule] = useState('');
  const [targetRepo, setTargetRepo] = useState('');
  const [d365Url, setD365Url] = useState('');
  const [storageStatePath, setStorageStatePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

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

