import React, { useState, useEffect } from 'react';
import './RecordingPanel.css';

interface RecordedStep {
  order: number;
  description: string;
  action: string;
  pageId: string;
}

interface RecordingPanelProps {
  sessionId: string;
  onStop: () => void;
}

declare global {
  interface Window {
    electronAPI?: {
      stopSession: (sessionId: string) => Promise<{ success: boolean }>;
      getSessionSteps: (sessionId: string) => Promise<RecordedStep[]>;
    };
  }
}

const RecordingPanel: React.FC<RecordingPanelProps> = ({ sessionId, onStop }) => {
  const [steps, setSteps] = useState<RecordedStep[]>([]);
  const [isRecording, setIsRecording] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(async () => {
      if (window.electronAPI) {
        try {
          const newSteps = await window.electronAPI.getSessionSteps(sessionId);
          setSteps(newSteps);
        } catch (error) {
          console.error('Error fetching steps:', error);
        }
      }
    }, 1000); // Poll every second

    return () => clearInterval(interval);
  }, [sessionId, isRecording]);

  const handleStop = async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        await window.electronAPI.stopSession(sessionId);
        setIsRecording(false);
        onStop();
      }
    } catch (error) {
      console.error('Error stopping session:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="recording-panel">
      <div className="recording-header">
        <h2>Recording Session</h2>
        <div className="recording-status">
          <span className={`status-indicator ${isRecording ? 'recording' : 'stopped'}`}></span>
          <span>{isRecording ? 'Recording...' : 'Stopped'}</span>
        </div>
      </div>

      <div className="recording-controls">
        <button
          className="stop-button"
          onClick={handleStop}
          disabled={!isRecording || loading}
        >
          {loading ? 'Stopping...' : 'Stop Recording'}
        </button>
      </div>

      <div className="steps-list">
        <h3>Captured Steps ({steps.length})</h3>
        {steps.length === 0 ? (
          <div className="no-steps">No steps captured yet. Perform actions in the D365 browser window.</div>
        ) : (
          <ul className="steps">
            {steps.map((step) => (
              <li key={step.order} className="step-item">
                <span className="step-number">{step.order}</span>
                <span className="step-description">{step.description}</span>
                <span className="step-action">{step.action}</span>
                <span className="step-page">{step.pageId}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default RecordingPanel;

