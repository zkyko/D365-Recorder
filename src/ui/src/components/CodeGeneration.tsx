import React, { useState, useEffect } from 'react';
import './CodeGeneration.css';

interface CodeGenerationProps {
  sessionId: string;
}

declare global {
  interface Window {
    electronAPI?: {
      generateCode: (
        sessionId: string,
        outputConfig: {
          pagesDir: string;
          testsDir: string;
          module?: string;
        }
      ) => Promise<{ success: boolean; files?: string[]; error?: string }>;
    };
  }
}

const CodeGeneration: React.FC<CodeGenerationProps> = ({ sessionId }) => {
  const [pagesDir, setPagesDir] = useState('');
  const [testsDir, setTestsDir] = useState('');
  const [module, setModule] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; files?: string[]; error?: string } | null>(null);

  // Load config on mount to set default directories
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getConfig().then((config) => {
        const recordingsDir = config.recordingsDir || 'Recordings';
        setPagesDir(`${recordingsDir}/pages`);
        setTestsDir(`${recordingsDir}/tests`);
      });
    }
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);

    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      const outputConfig = {
        pagesDir,
        testsDir,
        module: module || undefined,
      };

      const generated = await window.electronAPI.generateCode(sessionId, outputConfig);
      setResult(generated);
    } catch (error: any) {
      setResult({ success: false, error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="code-generation">
      <div className="generation-header">
        <h2>Generate POM & Test Files</h2>
        <p>Configure output paths and generate Page Object Models and test specs.</p>
      </div>

      <div className="generation-form">
        <div className="form-group">
          <label htmlFor="pagesDir">Pages Directory</label>
          <input
            id="pagesDir"
            type="text"
            value={pagesDir}
            onChange={(e) => setPagesDir(e.target.value)}
            placeholder="pages"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="testsDir">Tests Directory</label>
          <input
            id="testsDir"
            type="text"
            value={testsDir}
            onChange={(e) => setTestsDir(e.target.value)}
            placeholder="tests"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="module">Module (optional)</label>
          <input
            id="module"
            type="text"
            value={module}
            onChange={(e) => setModule(e.target.value)}
            placeholder="sales, inventory, ar"
            disabled={loading}
          />
        </div>

        <button
          className="generate-button"
          onClick={handleGenerate}
          disabled={loading || !pagesDir || !testsDir}
        >
          {loading ? 'Generating...' : 'Generate Code'}
        </button>
      </div>

      {result && (
        <div className={`generation-result ${result.success ? 'success' : 'error'}`}>
          {result.success ? (
            <div>
              <h3>Code Generated Successfully!</h3>
              {result.files && result.files.length > 0 && (
                <div className="generated-files">
                  <h4>Generated Files:</h4>
                  <ul>
                    {result.files.map((file, index) => (
                      <li key={index} className="file-path">{file}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div>
              <h3>Generation Failed</h3>
              <p className="error-message">{result.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CodeGeneration;

