import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { IpcClient } from '../ipc-client.js';
import { IPC_ROUTES } from '../../shared/constants.js';
import type { StoppedState, VariableInfo } from '../../shared/types.js';

function formatStoppedState(state: StoppedState, action: string): string {
  if (state.exited) {
    const code = state.exitCode != null ? ` with code ${state.exitCode}` : '';
    return `${action}: Program exited${code}.`;
  }

  const parts: string[] = [];

  // Location
  if (state.file && state.line) {
    const loc = `${state.file}:${state.line}${state.column ? ':' + state.column : ''}`;
    parts.push(`Stopped at ${loc}`);
  }
  if (state.functionName) {
    parts.push(`Function: ${state.functionName}`);
  }
  parts.push(`Reason: ${state.reason}`);

  if (state.threadId != null) {
    parts.push(`Thread: ${state.threadId}`);
  }
  if (state.frameId != null) {
    parts.push(`Frame ID: ${state.frameId}`);
  }

  // Local variables
  if (state.locals && state.locals.length > 0) {
    parts.push('');
    parts.push('Locals:');
    for (const v of state.locals) {
      parts.push(formatVariable(v));
    }
  }

  return parts.join('\n');
}

function formatVariable(v: VariableInfo): string {
  let line = `  ${v.name}: ${v.value}`;
  if (v.type) line += ` (${v.type})`;
  if (v.variablesReference > 0) line += ` [expandable, ref: ${v.variablesReference}]`;
  return line;
}

const executionSchema = {
  sessionId: z.string().optional().describe('Debug session ID. Omit to use the active session.'),
  threadId: z.number().optional().describe('Thread ID. Omit to use the first/focused thread.'),
};

const stepSchema = {
  ...executionSchema,
  count: z.number().optional().describe('Number of times to repeat the step (e.g., 5 to step over 5 lines). Defaults to 1.'),
};

export function registerExecutionTools(server: McpServer, ipc: IpcClient): void {
  server.tool(
    'debug_continue',
    'Resume program execution until the next breakpoint or program exit. Returns the stop location and local variables when the debugger pauses again.',
    executionSchema,
    async (args) => {
      const state = await ipc.request<StoppedState>(IPC_ROUTES.CONTINUE, args);
      return { content: [{ type: 'text' as const, text: formatStoppedState(state, 'Continue') }] };
    },
  );

  server.tool(
    'debug_pause',
    'Pause (break into) a running program. Returns the stop location and local variables.',
    executionSchema,
    async (args) => {
      const state = await ipc.request<StoppedState>(IPC_ROUTES.PAUSE, args);
      return { content: [{ type: 'text' as const, text: formatStoppedState(state, 'Pause') }] };
    },
  );

  server.tool(
    'debug_step_over',
    'Execute the current line and stop at the next line (step over function calls). Returns the new stop location and local variables. Use count to step multiple lines at once.',
    stepSchema,
    async (args) => {
      const state = await ipc.request<StoppedState>(IPC_ROUTES.STEP_OVER, args);
      return { content: [{ type: 'text' as const, text: formatStoppedState(state, 'Step over') }] };
    },
  );

  server.tool(
    'debug_step_into',
    'Step into the function call on the current line. Returns the new stop location and local variables. Use count to step multiple times.',
    stepSchema,
    async (args) => {
      const state = await ipc.request<StoppedState>(IPC_ROUTES.STEP_INTO, args);
      return { content: [{ type: 'text' as const, text: formatStoppedState(state, 'Step into') }] };
    },
  );

  server.tool(
    'debug_step_out',
    'Execute until the current function returns (step out). Returns the new stop location and local variables. Use count to step out multiple frames.',
    stepSchema,
    async (args) => {
      const state = await ipc.request<StoppedState>(IPC_ROUTES.STEP_OUT, args);
      return { content: [{ type: 'text' as const, text: formatStoppedState(state, 'Step out') }] };
    },
  );
}
