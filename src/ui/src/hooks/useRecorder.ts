import { useState, useEffect } from 'react';

interface RecordedStep {
  order: number;
  description: string;
  action: string;
  pageId: string;
}

export function useRecorder(sessionId: string | null) {
  const [steps, setSteps] = useState<RecordedStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setSteps([]);
      return;
    }

    const interval = setInterval(async () => {
      if (window.electronAPI) {
        try {
          const newSteps = await window.electronAPI.getSessionSteps(sessionId);
          setSteps(newSteps);
        } catch (err: any) {
          setError(err.message);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionId]);

  return { steps, loading, error };
}

