import * as vscode from 'vscode';
import { HttpServer } from './http-server.js';
import { DebugService } from './debug-service.js';
import { SessionTracker } from './session-tracker.js';
import { PortManager } from './port-manager.js';
import { DapTracker } from './dap-tracker.js';

let httpServer: HttpServer | undefined;
let portManager: PortManager | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const dapTracker = new DapTracker();
  const debugService = new DebugService(dapTracker);
  const sessionTracker = new SessionTracker();
  portManager = new PortManager();

  // Register DAP message tracker for all debug types (intercepts stopped/output events)
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterTrackerFactory('*', dapTracker),
  );

  // Track debug sessions
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(session => sessionTracker.add(session)),
    vscode.debug.onDidTerminateDebugSession(session => sessionTracker.remove(session)),
    vscode.debug.onDidChangeActiveDebugSession(session => sessionTracker.setActive(session)),
  );

  // Start HTTP bridge on a random port
  httpServer = new HttpServer(debugService, sessionTracker, portManager.authToken);
  const port = await httpServer.start();
  await portManager.writePort(port);

  // Cleanup on deactivation
  context.subscriptions.push({
    dispose: () => {
      httpServer?.stop();
      portManager?.cleanup();
    },
  });

  // Command to show the server port for debugging
  context.subscriptions.push(
    vscode.commands.registerCommand('vscode-debugger-mcp.showPort', () => {
      vscode.window.showInformationMessage(`Debugger MCP bridge running on port ${port}`);
    }),
  );

  console.log(`[vscode-debugger-mcp] HTTP bridge started on port ${port}`);
}

export function deactivate(): void {
  httpServer?.stop();
  portManager?.cleanup();
}
