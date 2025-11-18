import React, { useState, useEffect } from 'react';
import './StepReview.css';

interface RecordedStep {
  order: number;
  description: string;
  action: string;
  pageId: string;
  locator: any;
  value?: string;
}

interface StepReviewProps {
  sessionId: string;
  onGenerate: () => void;
}

declare global {
  interface Window {
    electronAPI?: {
      getSessionSteps: (sessionId: string) => Promise<RecordedStep[]>;
      updateStep: (sessionId: string, stepOrder: number, description: string) => Promise<{ success: boolean }>;
    };
  }
}

const StepReview: React.FC<StepReviewProps> = ({ sessionId, onGenerate }) => {
  const [steps, setSteps] = useState<RecordedStep[]>([]);
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    loadSteps();
  }, [sessionId]);

  const loadSteps = async () => {
    if (window.electronAPI) {
      try {
        const loadedSteps = await window.electronAPI.getSessionSteps(sessionId);
        setSteps(loadedSteps);
      } catch (error) {
        console.error('Error loading steps:', error);
      }
    }
  };

  const handleEdit = (step: RecordedStep) => {
    setEditingStep(step.order);
    setEditValue(step.description);
  };

  const handleSave = async (stepOrder: number) => {
    if (window.electronAPI) {
      try {
        await window.electronAPI.updateStep(sessionId, stepOrder, editValue);
        await loadSteps();
        setEditingStep(null);
      } catch (error) {
        console.error('Error updating step:', error);
      }
    }
  };

  const handleCancel = () => {
    setEditingStep(null);
    setEditValue('');
  };

  return (
    <div className="step-review">
      <div className="review-header">
        <h2>Review Recorded Steps</h2>
        <p>Review and edit step descriptions before generating code.</p>
      </div>

      <div className="steps-container">
        {steps.length === 0 ? (
          <div className="no-steps">No steps to review.</div>
        ) : (
          <div className="steps-list">
            {steps.map((step) => (
              <div key={step.order} className="step-card">
                <div className="step-header">
                  <span className="step-number">Step {step.order}</span>
                  <span className="step-action">{step.action}</span>
                  <span className="step-page">{step.pageId}</span>
                </div>
                {editingStep === step.order ? (
                  <div className="step-edit">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="edit-input"
                    />
                    <div className="edit-actions">
                      <button onClick={() => handleSave(step.order)} className="save-btn">
                        Save
                      </button>
                      <button onClick={handleCancel} className="cancel-btn">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="step-content">
                    <p className="step-description">{step.description}</p>
                    {step.value && (
                      <p className="step-value">Value: {step.value}</p>
                    )}
                    <button onClick={() => handleEdit(step)} className="edit-button">
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="review-actions">
        <button onClick={onGenerate} className="generate-button" disabled={steps.length === 0}>
          Generate POM + Test
        </button>
      </div>
    </div>
  );
};

export default StepReview;

