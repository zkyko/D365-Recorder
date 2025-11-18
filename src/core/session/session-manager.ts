import { RecordingSession, RecordedStep, SessionConfig } from '../../types';

/**
 * Manages recording sessions - creation, state, and step collection
 */
export class SessionManager {
  private sessions: Map<string, RecordingSession> = new Map();

  /**
   * Create and start a new recording session
   */
  startSession(config: SessionConfig): RecordingSession {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session: RecordingSession = {
      id: sessionId,
      flowName: config.flowName,
      module: config.module,
      steps: [],
      startedAt: new Date(),
      targetRepo: config.targetRepo,
      d365Env: config.d365Env,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Stop a recording session
   */
  stopSession(sessionId: string): RecordingSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.finishedAt = new Date();
    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): RecordingSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Add a step to a session
   */
  addStep(sessionId: string, step: Omit<RecordedStep, 'order' | 'timestamp'>): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const newStep: RecordedStep = {
      ...step,
      order: session.steps.length + 1,
      timestamp: new Date(),
    };

    session.steps.push(newStep);
  }

  /**
   * Get all steps for a session
   */
  getSessionSteps(sessionId: string): RecordedStep[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    return [...session.steps];
  }

  /**
   * Update a step's description
   */
  updateStepDescription(sessionId: string, stepOrder: number, description: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const step = session.steps.find(s => s.order === stepOrder);
    if (!step) {
      return false;
    }

    step.description = description;
    return true;
  }

  /**
   * Clear all sessions (useful for cleanup)
   */
  clearAllSessions(): void {
    this.sessions.clear();
  }
}

