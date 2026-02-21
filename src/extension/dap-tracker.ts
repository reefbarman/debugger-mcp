import * as vscode from 'vscode';

interface StopWaiter {
  resolve: (event: StoppedEvent) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface StoppedEvent {
  reason: string;
  threadId?: number;
  allThreadsStopped?: boolean;
  hitBreakpointIds?: number[];
  exitCode?: number;
}

export interface OutputEntry {
  category: string;
  output: string;
  timestamp: number;
}

const MAX_OUTPUT_ENTRIES = 500;
const STOP_TIMEOUT_MS = 30000;

/**
 * Intercepts DAP messages to:
 * 1. Capture `stopped` events so execution commands can wait for them
 * 2. Buffer `output` events (stdout/stderr) for the debug_get_output tool
 */
export class DapTracker implements vscode.DebugAdapterTrackerFactory {
  private stopWaiters = new Map<string, StopWaiter[]>();
  private outputBuffers = new Map<string, OutputEntry[]>();
  private exitCodes = new Map<string, number>();

  createDebugAdapterTracker(session: vscode.DebugSession): vscode.DebugAdapterTracker {
    const sessionId = session.id;

    // Initialize output buffer for this session
    if (!this.outputBuffers.has(sessionId)) {
      this.outputBuffers.set(sessionId, []);
    }

    return {
      onDidSendMessage: (message: any) => {
        if (message.type === 'event') {
          if (message.event === 'stopped') {
            this.handleStoppedEvent(sessionId, message.body);
          } else if (message.event === 'exited') {
            // DAP exited event carries the exit code — store it for when the session ends
            if (message.body?.exitCode != null) {
              this.exitCodes.set(sessionId, message.body.exitCode);
            }
          } else if (message.event === 'output') {
            this.handleOutputEvent(sessionId, message.body);
          }
        }
      },
      onWillStopSession: () => {
        // Resolve any pending waiters with an "exited" event (not reject)
        const exitCode = this.exitCodes.get(sessionId);
        const waiters = this.stopWaiters.get(sessionId);
        if (waiters) {
          for (const w of waiters) {
            clearTimeout(w.timer);
            w.resolve({ reason: 'exited', exitCode });
          }
          this.stopWaiters.delete(sessionId);
        }
      },
      onExit: () => {
        // Clean up waiters immediately, but keep output buffer for post-session access
        this.stopWaiters.delete(sessionId);
        this.exitCodes.delete(sessionId);
        // Keep output buffer for 60 seconds after session ends so final output can be read
        setTimeout(() => {
          this.outputBuffers.delete(sessionId);
        }, 60000);
      },
    };
  }

  /**
   * Wait for the next `stopped` event on a session.
   * Used by execution commands (continue, step) to block until the debugger pauses.
   */
  waitForStop(sessionId: string): Promise<StoppedEvent> {
    return new Promise<StoppedEvent>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove this waiter on timeout
        const waiters = this.stopWaiters.get(sessionId);
        if (waiters) {
          const idx = waiters.findIndex(w => w.resolve === resolve);
          if (idx !== -1) waiters.splice(idx, 1);
        }
        reject(new Error('Timed out waiting for debugger to stop (30s). The program may still be running.'));
      }, STOP_TIMEOUT_MS);

      if (!this.stopWaiters.has(sessionId)) {
        this.stopWaiters.set(sessionId, []);
      }
      this.stopWaiters.get(sessionId)!.push({ resolve, reject, timer });
    });
  }

  /**
   * Get buffered program output for a session.
   */
  getOutput(sessionId: string): OutputEntry[] {
    return this.outputBuffers.get(sessionId) ?? [];
  }

  /**
   * Clear buffered output for a session.
   */
  clearOutput(sessionId: string): void {
    this.outputBuffers.set(sessionId, []);
  }

  private handleStoppedEvent(sessionId: string, body: any): void {
    const event: StoppedEvent = {
      reason: body.reason,
      threadId: body.threadId,
      allThreadsStopped: body.allThreadsStopped,
      hitBreakpointIds: body.hitBreakpointIds,
    };

    const waiters = this.stopWaiters.get(sessionId);
    if (waiters && waiters.length > 0) {
      // Resolve all pending waiters (typically just one)
      for (const w of waiters) {
        clearTimeout(w.timer);
        w.resolve(event);
      }
      this.stopWaiters.set(sessionId, []);
    }
  }

  private handleOutputEvent(sessionId: string, body: any): void {
    const buffer = this.outputBuffers.get(sessionId);
    if (!buffer) return;

    const entry: OutputEntry = {
      category: body.category ?? 'console',
      output: body.output ?? '',
      timestamp: Date.now(),
    };

    buffer.push(entry);

    // Keep buffer bounded
    if (buffer.length > MAX_OUTPUT_ENTRIES) {
      buffer.splice(0, buffer.length - MAX_OUTPUT_ENTRIES);
    }
  }
}
