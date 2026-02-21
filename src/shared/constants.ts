import * as os from 'os';
import * as path from 'path';

export const EXTENSION_ID = 'vscode-debugger-mcp';
export const MCP_SERVER_NAME = 'vscode-debugger';
export const MCP_SERVER_VERSION = '0.1.0';

export const PORT_FILE_DIR = os.tmpdir();
export const PORT_FILE_PREFIX = 'vscode-debugger-mcp';

export function getPortFilePath(workspaceFolder?: string): string {
  if (workspaceFolder) {
    const crypto = require('crypto') as typeof import('crypto');
    const hash = crypto.createHash('sha256').update(workspaceFolder).digest('hex').slice(0, 12);
    return path.join(PORT_FILE_DIR, `${PORT_FILE_PREFIX}-${hash}.port`);
  }
  return path.join(PORT_FILE_DIR, `${PORT_FILE_PREFIX}.port`);
}

export const IPC_ROUTES = {
  HEALTH: '/health',

  START_SESSION: '/debug/session/start',
  STOP_SESSION: '/debug/session/stop',
  RESTART_SESSION: '/debug/session/restart',
  LIST_SESSIONS: '/debug/session/list',
  LIST_CONFIGURATIONS: '/debug/configurations',

  CONTINUE: '/debug/continue',
  PAUSE: '/debug/pause',
  STEP_OVER: '/debug/step-over',
  STEP_INTO: '/debug/step-into',
  STEP_OUT: '/debug/step-out',

  SET_BREAKPOINT: '/debug/breakpoint/set',
  SET_FUNCTION_BREAKPOINT: '/debug/breakpoint/set-function',
  REMOVE_BREAKPOINT: '/debug/breakpoint/remove',
  LIST_BREAKPOINTS: '/debug/breakpoint/list',
  TOGGLE_BREAKPOINT: '/debug/breakpoint/toggle',

  GET_THREADS: '/debug/threads',
  GET_STACK_TRACE: '/debug/stack-trace',
  GET_SCOPES: '/debug/scopes',
  GET_VARIABLES: '/debug/variables',
  EVALUATE: '/debug/evaluate',

  GET_STATUS: '/debug/status',
  GET_OUTPUT: '/debug/output',
} as const;
