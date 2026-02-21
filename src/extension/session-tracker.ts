import * as vscode from 'vscode';
import type { SessionInfo } from '../shared/types.js';

export class SessionTracker {
  private sessions = new Map<string, vscode.DebugSession>();
  private activeSessionId: string | undefined;

  add(session: vscode.DebugSession): void {
    this.sessions.set(session.id, session);
  }

  remove(session: vscode.DebugSession): void {
    this.sessions.delete(session.id);
    if (this.activeSessionId === session.id) {
      this.activeSessionId = undefined;
    }
  }

  setActive(session: vscode.DebugSession | undefined): void {
    this.activeSessionId = session?.id;
  }

  getSession(sessionId?: string): vscode.DebugSession | undefined {
    if (sessionId) {
      return this.sessions.get(sessionId);
    }
    if (this.activeSessionId) {
      return this.sessions.get(this.activeSessionId);
    }
    return vscode.debug.activeDebugSession;
  }

  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      name: s.name,
      type: s.type,
      workspaceFolder: s.workspaceFolder?.uri.fsPath,
    }));
  }
}
