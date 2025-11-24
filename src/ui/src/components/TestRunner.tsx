import React, { useState, useEffect, useRef } from 'react';
import './TestRunner.css';

interface TestRunnerProps {
  onClose?: () => void;
}

interface TestData {
  [key: string]: any;
}

const TestRunner: React.FC<TestRunnerProps> = ({ onClose }) => {
  const [specFiles, setSpecFiles] = useState<string[]>([]);
  const [selectedSpec, setSelectedSpec] = useState<string>('');
  const [testData, setTestData] = useState<TestData[]>([]);
  const [dataFilePath, setDataFilePath] = useState<string>('');
  const [detectedParameters, setDetectedParameters] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
  const [testStatus, setTestStatus] = useState<'idle' | 'running' | 'passed' | 'failed'>('idle');
  const [showBrowserStackSettings, setShowBrowserStackSettings] = useState(false);
  const [browserstackUsername, setBrowserstackUsername] = useState('');
  const [browserstackAccessKey, setBrowserstackAccessKey] = useState('');
  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSpecFiles();
    loadBrowserStackCredentials();
    
    // Set up test output listeners
    if (window.electronAPI) {
      window.electronAPI.onTestOutput((data) => {
        setConsoleOutput(prev => [...prev, data]);
        setTestStatus('running');
      });
      
      window.electronAPI.onTestError((data) => {
        setConsoleOutput(prev => [...prev, `[ERROR] ${data}`]);
        setTestStatus('running');
      });
      
      window.electronAPI.onTestClose((code) => {
        setIsRunning(false);
        setTestStatus(code === 0 ? 'passed' : 'failed');
      });
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeTestListeners();
      }
    };
  }, []);

  useEffect(() => {
    // Auto-scroll console to bottom
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleOutput]);

  const loadSpecFiles = async () => {
    if (!window.electronAPI) return;
    
    try {
      const result = await window.electronAPI.listSpecFiles();
      if (result.success && result.specFiles) {
        setSpecFiles(result.specFiles);
        // Auto-select first file if available
        if (result.specFiles.length > 0 && !selectedSpec) {
          handleSpecSelect(result.specFiles[0]);
        }
      }
    } catch (error) {
      console.error('Error loading spec files:', error);
    }
  };

  const loadBrowserStackCredentials = async () => {
    if (!window.electronAPI) return;
    
    try {
      const creds = await window.electronAPI.getBrowserStackCredentials();
      setBrowserstackUsername(creds.username || '');
      setBrowserstackAccessKey(creds.accessKey || '');
    } catch (error) {
      console.error('Error loading BrowserStack credentials:', error);
    }
  };

  const handleSpecSelect = async (specFile: string) => {
    setSelectedSpec(specFile);
    setTestData([]);
    setDataFilePath('');
    setDetectedParameters([]);
    setConsoleOutput([]);
    setTestStatus('idle');

    if (!window.electronAPI || !specFile) return;

    try {
      // Find associated data file and detect parameters
      const result = await window.electronAPI.findDataFile(specFile);
      if (result.success) {
        // Store detected parameters
        if (result.parameters && result.parameters.length > 0) {
          setDetectedParameters(result.parameters);
        }
        
        if (result.dataFilePath) {
          setDataFilePath(result.dataFilePath);
          
          // Load the data if file exists
          if (result.hasDataFile) {
            const dataResult = await window.electronAPI.loadTestData(result.dataFilePath);
            if (dataResult.success && dataResult.data) {
              setTestData(Array.isArray(dataResult.data) ? dataResult.data : [dataResult.data]);
            }
          } else {
            // Create initial data structure with detected parameters
            if (result.parameters && result.parameters.length > 0) {
              const initialData: TestData = {};
              result.parameters.forEach(param => {
                initialData[param] = '';
              });
              setTestData([initialData]);
            }
          }
        } else if (result.parameters && result.parameters.length > 0) {
          // Parameters detected but no data file - create initial structure
          const initialData: TestData = {};
          result.parameters.forEach(param => {
            initialData[param] = '';
          });
          setTestData([initialData]);
        }
      }
    } catch (error) {
      console.error('Error loading data file:', error);
    }
  };

  const handleDataChange = (index: number, key: string, value: any) => {
    const newData = [...testData];
    if (newData[index]) {
      newData[index] = { ...newData[index], [key]: value };
      setTestData(newData);
    }
  };

  const handleSaveData = async () => {
    if (!window.electronAPI) return;

    try {
      setIsLoading(true);
      
      // If no data file path, create one based on spec file
      let filePath = dataFilePath;
      if (!filePath && selectedSpec) {
        // Generate data file path from spec file
        const specName = selectedSpec.replace(/\.(generated\.)?spec\.ts$/, '');
        const specDir = selectedSpec.substring(0, selectedSpec.lastIndexOf('/'));
        filePath = `${specDir}/data/${specName.replace(/\.generated$/, '')}Data.json`;
        setDataFilePath(filePath);
      }
      
      if (!filePath) {
        alert('Cannot determine data file path. Please select a spec file first.');
        return;
      }
      
      const result = await window.electronAPI.saveTestData(filePath, testData);
      if (result.success) {
        alert('Test data saved successfully!');
      } else {
        alert(`Error saving data: ${result.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunLocal = async () => {
    if (!window.electronAPI || !selectedSpec) return;

    // Save data first
    if (dataFilePath && testData.length > 0) {
      await handleSaveData();
    }

    try {
      setIsRunning(true);
      setTestStatus('running');
      setConsoleOutput(['Starting test execution...\n']);
      
      const result = await window.electronAPI.runTestLocal(selectedSpec);
      if (!result.success) {
        setTestStatus('failed');
        setConsoleOutput(prev => [...prev, `[ERROR] ${result.error}\n`]);
        setIsRunning(false);
      }
    } catch (error: any) {
      setTestStatus('failed');
      setConsoleOutput(prev => [...prev, `[ERROR] ${error.message}\n`]);
      setIsRunning(false);
    }
  };

  const handleRunBrowserStack = async () => {
    if (!window.electronAPI || !selectedSpec) return;

    // Check credentials
    if (!browserstackUsername || !browserstackAccessKey) {
      alert('Please configure BrowserStack credentials first.');
      setShowBrowserStackSettings(true);
      return;
    }

    // Save data first
    if (dataFilePath && testData.length > 0) {
      await handleSaveData();
    }

    try {
      setIsRunning(true);
      setTestStatus('running');
      setConsoleOutput(['Starting test execution on BrowserStack...\n']);
      
      const result = await window.electronAPI.runTestBrowserStack(selectedSpec);
      if (!result.success) {
        setTestStatus('failed');
        setConsoleOutput(prev => [...prev, `[ERROR] ${result.error}\n`]);
        setIsRunning(false);
      }
    } catch (error: any) {
      setTestStatus('failed');
      setConsoleOutput(prev => [...prev, `[ERROR] ${error.message}\n`]);
      setIsRunning(false);
    }
  };

  const handleStop = async () => {
    if (!window.electronAPI) return;
    
    await window.electronAPI.stopTest();
    setIsRunning(false);
    setTestStatus('idle');
  };

  const handleSaveBrowserStackSettings = async () => {
    if (!window.electronAPI) return;

    try {
      await window.electronAPI.setBrowserStackCredentials(browserstackUsername, browserstackAccessKey);
      setShowBrowserStackSettings(false);
      alert('BrowserStack credentials saved!');
    } catch (error: any) {
      alert(`Error saving credentials: ${error.message}`);
    }
  };

  // Get spec file name for display (browser-compatible)
  const getSpecFileName = (filePath: string) => {
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1] || filePath;
  };

  return (
    <div className="test-runner">
      <div className="test-runner-header">
        <h2>Test Runner</h2>
        <div className="test-runner-actions">
          <button
            className="btn-secondary"
            onClick={() => setShowBrowserStackSettings(true)}
          >
            BrowserStack Settings
          </button>
          {onClose && (
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>

      <div className="test-runner-content">
        {/* Left Panel: Spec Selector & Data Editor */}
        <div className="test-runner-left">
          <div className="test-runner-section">
            <label>Test Spec File:</label>
            {specFiles.length > 0 ? (
              <select
                value={selectedSpec}
                onChange={(e) => handleSpecSelect(e.target.value)}
                className="test-runner-select"
              >
                <option value="">-- Select a test spec --</option>
                {specFiles.map((file) => (
                  <option key={file} value={file}>
                    {file}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  type="text"
                  value={selectedSpec}
                  onChange={(e) => setSelectedSpec(e.target.value)}
                  placeholder="Enter spec file path (e.g., d365/sales/create_so.spec.ts)"
                  className="test-runner-input"
                />
                <button
                  className="btn-primary"
                  onClick={() => handleSpecSelect(selectedSpec)}
                  disabled={!selectedSpec}
                >
                  Load
                </button>
              </>
            )}
            <button
              className="btn-secondary small"
              onClick={loadSpecFiles}
              style={{ marginTop: '0.5rem' }}
            >
              Refresh List
            </button>
          </div>

          {selectedSpec && (
            <div className="test-runner-section">
              <div className="test-runner-section-header">
                <h3>Test Data Editor</h3>
                {dataFilePath && (
                  <button
                    className="btn-primary small"
                    onClick={handleSaveData}
                    disabled={isLoading}
                  >
                    Save Data
                  </button>
                )}
              </div>
              
              {detectedParameters.length > 0 && testData.length === 0 && (
                <div className="test-data-info">
                  <p>Detected parameters: {detectedParameters.join(', ')}</p>
                  <button
                    className="btn-primary small"
                    onClick={() => {
                      const initialData: TestData = {};
                      detectedParameters.forEach(param => {
                        initialData[param] = '';
                      });
                      setTestData([initialData]);
                    }}
                  >
                    Create Test Data
                  </button>
                </div>
              )}
              
              {testData.length > 0 && (
                <>
                  <div className="test-data-editor">
                    {testData.map((row, index) => (
                      <div key={index} className="test-data-row">
                        <div className="test-data-row-header">
                          <strong>Test Case {index + 1}</strong>
                          {testData.length > 1 && (
                            <button
                              className="btn-danger small"
                              onClick={() => {
                                const newData = testData.filter((_, i) => i !== index);
                                setTestData(newData);
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        {detectedParameters.length > 0 ? (
                          // Show fields in detected order
                          detectedParameters.map((param) => (
                            <div key={param} className="test-data-field">
                              <label>{param}:</label>
                              <input
                                type="text"
                                value={String(row[param] || '')}
                                onChange={(e) => handleDataChange(index, param, e.target.value)}
                                className="test-data-input"
                                placeholder={`Enter ${param}`}
                              />
                            </div>
                          ))
                        ) : (
                          // Fallback: show all fields
                          Object.entries(row).map(([key, value]) => (
                            <div key={key} className="test-data-field">
                              <label>{key}:</label>
                              <input
                                type="text"
                                value={String(value)}
                                onChange={(e) => handleDataChange(index, key, e.target.value)}
                                className="test-data-input"
                              />
                            </div>
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    className="btn-secondary small"
                    onClick={() => {
                      const newRow: TestData = {};
                      detectedParameters.forEach(param => {
                        newRow[param] = '';
                      });
                      setTestData([...testData, newRow]);
                    }}
                    style={{ marginTop: '0.5rem' }}
                  >
                    Add Test Case
                  </button>
                </>
              )}
            </div>
          )}

          {selectedSpec && (
            <div className="test-runner-section">
              <div className="test-runner-controls">
                <button
                  className="btn-primary"
                  onClick={handleRunLocal}
                  disabled={isRunning}
                >
                  Run Locally
                </button>
                <button
                  className="btn-primary"
                  onClick={handleRunBrowserStack}
                  disabled={isRunning}
                >
                  Run on BrowserStack
                </button>
                {isRunning && (
                  <button
                    className="btn-danger"
                    onClick={handleStop}
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Console Output */}
        <div className="test-runner-right">
          <div className="test-runner-section">
            <div className="test-runner-section-header">
              <h3>Console Output</h3>
              <div className={`test-status ${testStatus}`}>
                {testStatus === 'running' && '⏳ Running...'}
                {testStatus === 'passed' && '✅ Passed'}
                {testStatus === 'failed' && '❌ Failed'}
                {testStatus === 'idle' && '⏸ Idle'}
              </div>
            </div>
            <div className="test-console">
              {consoleOutput.length === 0 ? (
                <div className="test-console-empty">
                  No output yet. Select a test spec and run it to see output here.
                </div>
              ) : (
                consoleOutput.map((line, index) => (
                  <div key={index} className="test-console-line">
                    {line}
                  </div>
                ))
              )}
              <div ref={consoleEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* BrowserStack Settings Modal */}
      {showBrowserStackSettings && (
        <div className="modal-overlay" onClick={() => setShowBrowserStackSettings(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>BrowserStack Settings</h3>
            <div className="modal-form">
              <div className="form-field">
                <label>Username:</label>
                <input
                  type="text"
                  value={browserstackUsername}
                  onChange={(e) => setBrowserstackUsername(e.target.value)}
                  placeholder="Your BrowserStack username"
                />
              </div>
              <div className="form-field">
                <label>Access Key:</label>
                <input
                  type="password"
                  value={browserstackAccessKey}
                  onChange={(e) => setBrowserstackAccessKey(e.target.value)}
                  placeholder="Your BrowserStack access key"
                />
              </div>
              <div className="modal-actions">
                <button
                  className="btn-primary"
                  onClick={handleSaveBrowserStackSettings}
                >
                  Save
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => setShowBrowserStackSettings(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestRunner;

