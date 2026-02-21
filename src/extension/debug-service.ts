import * as vscode from 'vscode';
import { SessionTracker } from './session-tracker.js';
import { DapTracker } from './dap-tracker.js';
import type * as T from '../shared/types.js';

export class DebugService {
  private dapTracker: DapTracker;

  constructor(dapTracker: DapTracker) {
    this.dapTracker = dapTracker;
  }

  // --- Session Management ---

  async startSession(req: T.StartSessionRequest, tracker: SessionTracker): Promise<T.StartSessionResponse> {
    const folder = req.workspaceFolder
      ? vscode.workspace.workspaceFolders?.find(f => f.name === req.workspaceFolder)
      : vscode.workspace.workspaceFolders?.[0];

    let config: string | vscode.DebugConfiguration;
    if (typeof req.configuration === 'string') {
      config = req.configuration;
    } else {
      config = req.configuration as vscode.DebugConfiguration;
      if (req.noDebug) {
        config.noDebug = true;
      }
    }

    const success = await vscode.debug.startDebugging(folder, config);
    const sessionId = vscode.debug.activeDebugSession?.id;
    return { success, sessionId };
  }

  async stopSession(sessionId: string | undefined, tracker: SessionTracker): Promise<void> {
    const session = tracker.getSession(sessionId);
    await vscode.debug.stopDebugging(session);
  }

  async listConfigurations(): Promise<T.ListConfigurationsResponse> {
    const configs: T.ListConfigurationsResponse['configurations'] = [];
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      const launchConfig = vscode.workspace.getConfiguration('launch', folder.uri);
      const launchConfigs = launchConfig.get<Array<{ name: string; type: string; request: string }>>('configurations') ?? [];
      for (const c of launchConfigs) {
        configs.push({ name: c.name, type: c.type, request: c.request });
      }
    }
    return { configurations: configs };
  }

  // --- Execution Control ---
  // All execution methods now wait for the stopped event and return full state.

  async continue(sessionId: string | undefined, threadId: number | undefined, tracker: SessionTracker): Promise<T.StoppedState> {
    const session = this.requireSession(sessionId, tracker);
    const tid = threadId ?? await this.getDefaultThreadId(session);

    const stopPromise = this.waitForStopOrExit(session, tracker);
    await session.customRequest('continue', { threadId: tid });
    return stopPromise;
  }

  async pause(sessionId: string | undefined, threadId: number | undefined, tracker: SessionTracker): Promise<T.StoppedState> {
    const session = this.requireSession(sessionId, tracker);
    const tid = threadId ?? await this.getDefaultThreadId(session);

    const stopPromise = this.dapTracker.waitForStop(session.id);
    await session.customRequest('pause', { threadId: tid });
    const event = await stopPromise;
    return this.gatherStoppedState(session, event.reason, event.threadId);
  }

  async stepOver(sessionId: string | undefined, threadId: number | undefined, count: number | undefined, tracker: SessionTracker): Promise<T.StoppedState> {
    return this.repeatStep('next', sessionId, threadId, count ?? 1, tracker);
  }

  async stepInto(sessionId: string | undefined, threadId: number | undefined, count: number | undefined, tracker: SessionTracker): Promise<T.StoppedState> {
    return this.repeatStep('stepIn', sessionId, threadId, count ?? 1, tracker);
  }

  async stepOut(sessionId: string | undefined, threadId: number | undefined, count: number | undefined, tracker: SessionTracker): Promise<T.StoppedState> {
    return this.repeatStep('stepOut', sessionId, threadId, count ?? 1, tracker);
  }

  // --- Breakpoints ---

  async setBreakpoint(req: T.SetBreakpointRequest): Promise<T.BreakpointInfo> {
    const uri = vscode.Uri.file(req.file);
    const position = new vscode.Position(req.line - 1, (req.column ?? 1) - 1);
    const location = new vscode.Location(uri, position);

    const bp = new vscode.SourceBreakpoint(
      location,
      req.enabled ?? true,
      req.condition,
      req.hitCondition,
      req.logMessage,
    );

    vscode.debug.addBreakpoints([bp]);
    return this.serializeBreakpoint(bp);
  }

  async setFunctionBreakpoint(req: T.SetFunctionBreakpointRequest): Promise<T.BreakpointInfo> {
    const bp = new vscode.FunctionBreakpoint(
      req.functionName,
      req.enabled ?? true,
      req.condition,
      req.hitCondition,
    );
    vscode.debug.addBreakpoints([bp]);
    return this.serializeBreakpoint(bp);
  }

  async removeBreakpoint(req: T.RemoveBreakpointRequest): Promise<{ removed: number }> {
    const allBps = vscode.debug.breakpoints;

    if (req.removeAll) {
      vscode.debug.removeBreakpoints(allBps);
      return { removed: allBps.length };
    }

    if (req.removeAllInFile) {
      const toRemove = allBps.filter(bp =>
        bp instanceof vscode.SourceBreakpoint &&
        bp.location.uri.fsPath === req.removeAllInFile,
      );
      vscode.debug.removeBreakpoints(toRemove);
      return { removed: toRemove.length };
    }

    const toRemove = allBps.filter(bp => {
      if (req.id && bp.id === req.id) return true;
      if (req.file && req.line != null && bp instanceof vscode.SourceBreakpoint) {
        return (
          bp.location.uri.fsPath === req.file &&
          bp.location.range.start.line === req.line - 1
        );
      }
      return false;
    });

    vscode.debug.removeBreakpoints(toRemove);
    return { removed: toRemove.length };
  }

  listBreakpoints(): T.ListBreakpointsResponse {
    return {
      breakpoints: vscode.debug.breakpoints.map(bp => this.serializeBreakpoint(bp)),
    };
  }

  async toggleBreakpoint(req: T.ToggleBreakpointRequest): Promise<T.BreakpointInfo | null> {
    const allBps = vscode.debug.breakpoints;
    const target = allBps.find(bp => {
      if (req.id) return bp.id === req.id;
      if (req.file && req.line != null && bp instanceof vscode.SourceBreakpoint) {
        return (
          bp.location.uri.fsPath === req.file &&
          bp.location.range.start.line === req.line - 1
        );
      }
      return false;
    });

    if (!target) return null;

    vscode.debug.removeBreakpoints([target]);

    if (target instanceof vscode.SourceBreakpoint) {
      const newBp = new vscode.SourceBreakpoint(
        target.location,
        req.enabled,
        target.condition,
        target.hitCondition,
        target.logMessage,
      );
      vscode.debug.addBreakpoints([newBp]);
      return this.serializeBreakpoint(newBp);
    } else if (target instanceof vscode.FunctionBreakpoint) {
      const newBp = new vscode.FunctionBreakpoint(
        target.functionName,
        req.enabled,
        target.condition,
        target.hitCondition,
      );
      vscode.debug.addBreakpoints([newBp]);
      return this.serializeBreakpoint(newBp);
    }

    return null;
  }

  // --- State Inspection ---

  async getThreads(sessionId: string | undefined, tracker: SessionTracker): Promise<T.GetThreadsResponse> {
    const session = this.requireSession(sessionId, tracker);
    const response = await session.customRequest('threads');
    return {
      threads: (response.threads ?? []).map((t: { id: number; name: string }) => ({
        id: t.id,
        name: t.name,
      })),
    };
  }

  async getStackTrace(req: T.GetStackTraceRequest, tracker: SessionTracker): Promise<T.GetStackTraceResponse> {
    const session = this.requireSession(req.sessionId, tracker);
    const response = await session.customRequest('stackTrace', {
      threadId: req.threadId,
      startFrame: req.startFrame ?? 0,
      levels: req.levels ?? 20,
    });
    return {
      stackFrames: (response.stackFrames ?? []).map((f: any) => ({
        id: f.id,
        name: f.name,
        source: f.source ? { path: f.source.path, name: f.source.name } : undefined,
        line: f.line,
        column: f.column,
        moduleId: f.moduleId,
      })),
      totalFrames: response.totalFrames,
    };
  }

  async getScopes(req: T.GetScopesRequest, tracker: SessionTracker): Promise<T.GetScopesResponse> {
    const session = this.requireSession(req.sessionId, tracker);
    try {
      const response = await session.customRequest('scopes', { frameId: req.frameId });
      return {
        scopes: (response.scopes ?? []).map((s: any) => ({
          name: s.name,
          variablesReference: s.variablesReference,
          expensive: s.expensive,
          namedVariables: s.namedVariables,
          indexedVariables: s.indexedVariables,
        })),
      };
    } catch (err: unknown) {
      throw this.enhanceStaleReferenceError(err, 'frame');
    }
  }

  async getVariables(req: T.GetVariablesRequest, tracker: SessionTracker): Promise<T.GetVariablesResponse> {
    const session = this.requireSession(req.sessionId, tracker);
    try {
      const response = await session.customRequest('variables', {
        variablesReference: req.variablesReference,
        filter: req.filter,
        start: req.start,
        count: req.count,
      });
      return {
        variables: (response.variables ?? []).map((v: any) => ({
          name: v.name,
          value: v.value,
          type: v.type,
          variablesReference: v.variablesReference,
          namedVariables: v.namedVariables,
          indexedVariables: v.indexedVariables,
        })),
      };
    } catch (err: unknown) {
      throw this.enhanceStaleReferenceError(err, 'variable');
    }
  }

  async evaluate(req: T.EvaluateRequest, tracker: SessionTracker): Promise<T.EvaluateResponse> {
    const session = this.requireSession(req.sessionId, tracker);
    try {
      const response = await session.customRequest('evaluate', {
        expression: req.expression,
        frameId: req.frameId,
        context: req.context ?? 'repl',
      });
      return {
        result: response.result,
        type: response.type,
        variablesReference: response.variablesReference,
        namedVariables: response.namedVariables,
        indexedVariables: response.indexedVariables,
      };
    } catch (err: unknown) {
      throw this.enhanceStaleReferenceError(err, 'frame');
    }
  }

  // --- Status & Output ---

  async getStatus(sessionId: string | undefined, tracker: SessionTracker): Promise<T.GetStatusResponse> {
    const session = tracker.getSession(sessionId);
    if (!session) {
      return { active: false, stopped: false };
    }

    const sessionInfo: T.SessionInfo = {
      id: session.id,
      name: session.name,
      type: session.type,
      workspaceFolder: session.workspaceFolder?.uri.fsPath,
    };

    // Try to get current state — if we can get a stack trace, we're stopped
    try {
      const state = await this.gatherStoppedState(session, 'current');
      return { active: true, session: sessionInfo, stopped: true, state };
    } catch {
      // If stack trace fails, the program is likely running
      return { active: true, session: sessionInfo, stopped: false };
    }
  }

  getOutput(sessionId: string | undefined, tracker: SessionTracker, categories?: string[], clear?: boolean): T.GetOutputResponse {
    // Try to resolve session ID from tracker, but also accept raw session ID
    // (output buffer is kept for 60s after session termination)
    const session = tracker.getSession(sessionId);
    const resolvedId = session?.id ?? sessionId;

    if (!resolvedId) {
      // No session ID at all — try to find any output buffer
      return { output: [] };
    }

    let entries = this.dapTracker.getOutput(resolvedId);

    if (categories && categories.length > 0) {
      entries = entries.filter(e => categories.includes(e.category));
    }

    if (clear) {
      this.dapTracker.clearOutput(resolvedId);
    }

    return { output: entries };
  }

  // --- Helpers ---

  private requireSession(sessionId: string | undefined, tracker: SessionTracker): vscode.DebugSession {
    const session = tracker.getSession(sessionId);
    if (!session) {
      throw new Error(
        sessionId
          ? `No debug session found with ID: ${sessionId}`
          : 'No active debug session. Start a debug session first.',
      );
    }
    return session;
  }

  private async getDefaultThreadId(session: vscode.DebugSession): Promise<number> {
    const response = await session.customRequest('threads');
    if (!response.threads || response.threads.length === 0) {
      throw new Error('No threads available in the debug session');
    }
    return response.threads[0].id;
  }

  /**
   * Wait for the debugger to stop, OR for the session to terminate.
   * Used by `continue` which may cause the program to exit.
   */
  private waitForStopOrExit(session: vscode.DebugSession, _tracker: SessionTracker): Promise<T.StoppedState> {
    return new Promise<T.StoppedState>((resolve) => {
      let settled = false;

      const stopPromise = this.dapTracker.waitForStop(session.id);
      stopPromise.then(async (event) => {
        if (settled) return;
        settled = true;

        // DapTracker resolves with reason:"exited" when session ends
        if (event.reason === 'exited') {
          resolve({ reason: 'exited', exited: true, exitCode: event.exitCode });
          return;
        }

        try {
          const state = await this.gatherStoppedState(session, event.reason, event.threadId);
          resolve(state);
        } catch {
          resolve({ reason: event.reason, threadId: event.threadId });
        }
      }).catch(() => {
        // Only hit on actual timeout (30s)
        if (settled) return;
        settled = true;
        resolve({ reason: 'timeout' });
      });
    });
  }

  /**
   * Perform repeated steps (step over/into/out N times).
   * Waits for the stopped event after each step.
   */
  private async repeatStep(
    command: 'next' | 'stepIn' | 'stepOut',
    sessionId: string | undefined,
    threadId: number | undefined,
    count: number,
    tracker: SessionTracker,
  ): Promise<T.StoppedState> {
    const session = this.requireSession(sessionId, tracker);
    let tid = threadId ?? await this.getDefaultThreadId(session);
    let lastState: T.StoppedState = { reason: 'step' };

    for (let i = 0; i < count; i++) {
      const stopPromise = this.waitForStopOrExit(session, tracker);
      await session.customRequest(command, { threadId: tid });
      lastState = await stopPromise;

      // If program exited or hit a breakpoint during multi-step, stop early
      if (lastState.exited || (lastState.reason === 'breakpoint' && i < count - 1)) {
        break;
      }

      // Update thread ID in case it changed
      if (lastState.threadId) {
        tid = lastState.threadId;
      }
    }

    return lastState;
  }

  /**
   * After the debugger stops, gather: top frame location + local variables.
   * This is the key method that eliminates the 3-call round trip.
   */
  private async gatherStoppedState(
    session: vscode.DebugSession,
    reason: string,
    threadId?: number,
  ): Promise<T.StoppedState> {
    // Get threads to find the stopped thread
    const tid = threadId ?? await this.getDefaultThreadId(session);

    // Get top stack frame
    const stackResponse = await session.customRequest('stackTrace', {
      threadId: tid,
      startFrame: 0,
      levels: 1,
    });

    const topFrame = stackResponse.stackFrames?.[0];
    if (!topFrame) {
      return { reason, threadId: tid };
    }

    const state: T.StoppedState = {
      reason,
      file: topFrame.source?.path,
      line: topFrame.line,
      column: topFrame.column,
      functionName: topFrame.name,
      threadId: tid,
      frameId: topFrame.id,
    };

    // Gather local variables from non-expensive scopes
    try {
      const scopesResponse = await session.customRequest('scopes', { frameId: topFrame.id });
      const locals: T.VariableInfo[] = [];

      for (const scope of scopesResponse.scopes ?? []) {
        // Skip expensive scopes (globals, etc.) — only get locals-like scopes
        if (scope.expensive) continue;

        try {
          const varsResponse = await session.customRequest('variables', {
            variablesReference: scope.variablesReference,
          });
          for (const v of varsResponse.variables ?? []) {
            locals.push({
              name: v.name,
              value: v.value,
              type: v.type,
              variablesReference: v.variablesReference,
              namedVariables: v.namedVariables,
              indexedVariables: v.indexedVariables,
            });
          }
        } catch {
          // Skip scopes that fail to load
        }
      }

      if (locals.length > 0) {
        state.locals = locals;
      }
    } catch {
      // If scopes/variables fail, still return the location info
    }

    return state;
  }

  private serializeBreakpoint(bp: vscode.Breakpoint): T.BreakpointInfo {
    const info: T.BreakpointInfo = {
      id: bp.id,
      type: bp instanceof vscode.SourceBreakpoint ? 'source' : 'function',
      enabled: bp.enabled,
      verified: true,
      condition: bp.condition,
      hitCondition: bp.hitCondition,
      logMessage: bp.logMessage,
    };

    if (bp instanceof vscode.SourceBreakpoint) {
      info.file = bp.location.uri.fsPath;
      info.line = bp.location.range.start.line + 1;
      info.column = bp.location.range.start.character + 1;
    } else if (bp instanceof vscode.FunctionBreakpoint) {
      info.functionName = bp.functionName;
    }

    return info;
  }

  /**
   * Detect stale reference errors and provide helpful messages.
   */
  private enhanceStaleReferenceError(err: unknown, refType: 'frame' | 'variable'): Error {
    const msg = err instanceof Error ? err.message : String(err);
    const isStale = /unknown (reference|frame|variable)/i.test(msg) ||
                    /invalid (reference|frame)/i.test(msg) ||
                    /unable to lookup/i.test(msg);

    if (isStale) {
      const hint = refType === 'frame'
        ? 'Frame/variable references are invalidated after stepping or continuing. Call debug_get_stack_trace to get fresh frame IDs, then debug_get_scopes for fresh variable references.'
        : 'Variable references are invalidated after stepping or continuing. Call debug_get_scopes with a fresh frameId to get updated references.';
      return new Error(`${msg}\n\nHint: ${hint}`);
    }
    return err instanceof Error ? err : new Error(msg);
  }
}
