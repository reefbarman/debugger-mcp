import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { IpcClient } from '../ipc-client.js';
import { IPC_ROUTES } from '../../shared/constants.js';
import type * as T from '../../shared/types.js';

export function registerInspectionTools(server: McpServer, ipc: IpcClient): void {
  server.tool(
    'debug_get_threads',
    'List all threads in the debug session.',
    {
      sessionId: z.string().optional().describe('Debug session ID. Omit for active session.'),
    },
    async (args) => {
      const result = await ipc.request<T.GetThreadsResponse>(IPC_ROUTES.GET_THREADS, args);
      if (!result.threads || result.threads.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No threads.' }] };
      }
      const lines = result.threads.map(t => `- Thread ${t.id}: ${t.name}`);
      return { content: [{ type: 'text' as const, text: `Threads:\n${lines.join('\n')}` }] };
    },
  );

  server.tool(
    'debug_get_stack_trace',
    'Get the call stack for a specific thread. Returns stack frames with source file locations.',
    {
      threadId: z.number().describe('Thread ID to get the stack trace for'),
      sessionId: z.string().optional().describe('Debug session ID'),
      startFrame: z.number().optional().describe('Start frame index (for pagination)'),
      levels: z.number().optional().describe('Number of frames to return (default: 20)'),
    },
    async (args) => {
      const result = await ipc.request<T.GetStackTraceResponse>(IPC_ROUTES.GET_STACK_TRACE, args);
      if (!result.stackFrames || result.stackFrames.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No stack frames.' }] };
      }
      const lines = result.stackFrames.map((f, i) => {
        const loc = f.source?.path ? `${f.source.path}:${f.line}:${f.column}` : '(unknown)';
        return `#${i} ${f.name} at ${loc} [frameId: ${f.id}]`;
      });
      const text = `Call stack (${result.totalFrames ?? result.stackFrames.length} total frames):\n${lines.join('\n')}`;
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  server.tool(
    'debug_get_scopes',
    'Get the variable scopes for a stack frame. Returns scope names and their variablesReference IDs (use debug_get_variables to expand).',
    {
      frameId: z.number().describe('Stack frame ID (from debug_get_stack_trace)'),
      sessionId: z.string().optional().describe('Debug session ID'),
    },
    async (args) => {
      const result = await ipc.request<T.GetScopesResponse>(IPC_ROUTES.GET_SCOPES, args);
      const lines = result.scopes.map(s =>
        `- ${s.name} (variablesReference: ${s.variablesReference}${s.expensive ? ', expensive' : ''})`,
      );
      return {
        content: [{
          type: 'text' as const,
          text: `Scopes:\n${lines.join('\n')}\n\nUse debug_get_variables with a variablesReference to inspect variables.`,
        }],
      };
    },
  );

  server.tool(
    'debug_get_variables',
    'Get variables within a scope or expand a structured variable. If a variable has variablesReference > 0, you can call this again with that reference to expand it.',
    {
      variablesReference: z.number().describe('Variables reference ID (from debug_get_scopes or from a parent variable)'),
      sessionId: z.string().optional().describe('Debug session ID'),
      filter: z.enum(['indexed', 'named']).optional().describe('Filter to only indexed or named variables'),
      start: z.number().optional().describe('Start index for indexed variables (pagination)'),
      count: z.number().optional().describe('Number of indexed variables to return (pagination)'),
    },
    async (args) => {
      const result = await ipc.request<T.GetVariablesResponse>(IPC_ROUTES.GET_VARIABLES, args);
      if (!result.variables || result.variables.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No variables.' }] };
      }
      const lines = result.variables.map(v => {
        let line = `${v.name}: ${v.value}`;
        if (v.type) line += ` (${v.type})`;
        if (v.variablesReference > 0) line += ` [expandable, ref: ${v.variablesReference}]`;
        return line;
      });
      return { content: [{ type: 'text' as const, text: `Variables:\n${lines.join('\n')}` }] };
    },
  );

  server.tool(
    'debug_evaluate',
    'Evaluate an expression in the context of the current debug session. Can evaluate in the context of a specific stack frame.',
    {
      expression: z.string().describe('Expression to evaluate'),
      frameId: z.number().optional().describe('Stack frame ID for context (from debug_get_stack_trace). Omit for global context.'),
      sessionId: z.string().optional().describe('Debug session ID'),
      context: z.enum(['watch', 'repl', 'hover', 'clipboard']).optional().describe('Evaluation context. Defaults to "repl".'),
    },
    async (args) => {
      const result = await ipc.request<T.EvaluateResponse>(IPC_ROUTES.EVALUATE, args);
      let text = `Result: ${result.result}`;
      if (result.type) text += `\nType: ${result.type}`;
      if (result.variablesReference > 0) {
        text += `\n[Structured result, use debug_get_variables with ref: ${result.variablesReference} to expand]`;
      }
      return { content: [{ type: 'text' as const, text }] };
    },
  );
}
