import React, { useState, useEffect } from 'react';
import SessionSetup from './components/SessionSetup';
import RecordingPanel from './components/RecordingPanel';
import StepReview from './components/StepReview';
import CodeGeneration from './components/CodeGeneration';
import LoginDialog from './components/LoginDialog';
import './App.css';

interface Session {
  id: string;
  flowName: string;
  module: string;
}

interface AppConfig {
  recordingsDir: string;
  d365Url: string | undefined;
  storageStatePath: string | undefined;
  isSetupComplete: boolean;
}

function App() {
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<'setup' | 'recording' | 'review' | 'generate'>('setup');
  const [showLogin, setShowLogin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    if (!window.electronAPI) {
      setIsLoadingConfig(false);
      return;
    }

    try {
      const cfg = await window.electronAPI.getConfig();
      setConfig(cfg);
      
      // If setup is complete, check authentication
      if (cfg.isSetupComplete) {
        await checkAuthentication();
      }
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const checkAuthentication = async () => {
    if (window.electronAPI) {
      try {
        const authStatus = await window.electronAPI.checkAuth();
        if (authStatus.needsLogin) {
          setShowLogin(true);
        } else {
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        setShowLogin(true);
      }
    }
  };

  const handleSetupComplete = () => {
    loadConfig(); // Reload config to get updated isSetupComplete
  };

  const handleLoginSuccess = () => {
    setShowLogin(false);
    setIsAuthenticated(true);
  };

  const handleSessionStart = (session: Session) => {
    setCurrentSession(session);
    setActiveTab('recording');
  };

  const handleRecordingStop = () => {
    setActiveTab('review');
  };

  const handleGenerate = () => {
    setActiveTab('generate');
  };

  // Show loading while config loads
  if (isLoadingConfig || !config) {
    return (
      <div className="app">
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Show setup screen if not completed
  if (!config.isSetupComplete) {
    return <SetupScreen onSetupComplete={handleSetupComplete} />;
  }

  // Show login if needed
  if (showLogin) {
    return <LoginDialog onLoginSuccess={handleLoginSuccess} />;
  }

  if (!isAuthenticated) {
    return (
      <div className="app">
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <p>Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>D365 Auto-Recorder & POM Generator</h1>
        <nav className="app-nav">
          <button
            className={activeTab === 'setup' ? 'active' : ''}
            onClick={() => setActiveTab('setup')}
          >
            Setup
          </button>
          <button
            className={activeTab === 'recording' ? 'active' : ''}
            onClick={() => setActiveTab('recording')}
            disabled={!currentSession}
          >
            Recording
          </button>
          <button
            className={activeTab === 'review' ? 'active' : ''}
            onClick={() => setActiveTab('review')}
            disabled={!currentSession}
          >
            Review
          </button>
          <button
            className={activeTab === 'generate' ? 'active' : ''}
            onClick={() => setActiveTab('generate')}
            disabled={!currentSession}
          >
            Generate
          </button>
        </nav>
      </header>

      <main className="app-main">
        {activeTab === 'setup' && (
          <SessionSetup onSessionStart={handleSessionStart} />
        )}
        {activeTab === 'recording' && currentSession && (
          <RecordingPanel
            sessionId={currentSession.id}
            onStop={handleRecordingStop}
          />
        )}
        {activeTab === 'review' && currentSession && (
          <StepReview
            sessionId={currentSession.id}
            onGenerate={handleGenerate}
          />
        )}
        {activeTab === 'generate' && currentSession && (
          <CodeGeneration sessionId={currentSession.id} />
        )}
      </main>
    </div>
  );
}

export default App;

