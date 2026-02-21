import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { IpcClient } from '../ipc-client.js';
import { IPC_ROUTES } from '../../shared/constants.js';
import type * as T from '../../shared/types.js';

export function registerStatusTools(server: McpServer, ipc: IpcClient): void {
  server.tool(
    'debug_status',
    'Get the current debugger status: whether a session is active, whether it\'s stopped, and if stopped, the current location and local variables. This is a quick "where am I?" command.',
    {
      sessionId: z.string().optional().describe('Debug session ID. Omit for active session.'),
    },
    async (args) => {
      const result = await ipc.request<T.GetStatusResponse>(IPC_ROUTES.GET_STATUS, args);

      if (!result.active) {
        return { content: [{ type: 'text' as const, text: 'No active debug session.' }] };
      }

      const parts: string[] = [];
      parts.push(`Session: ${result.session!.name} (type: ${result.session!.type}, ID: ${result.session!.id})`);

      if (!result.stopped) {
        parts.push('Status: Running (not stopped)');
        return { content: [{ type: 'text' as const, text: parts.join('\n') }] };
      }

      parts.push('Status: Stopped');

      const state = result.state;
      if (state) {
        if (state.file && state.line) {
          parts.push(`Location: ${state.file}:${state.line}${state.column ? ':' + state.column : ''}`);
        }
        if (state.functionName) {
          parts.push(`Function: ${state.functionName}`);
        }
        if (state.reason && state.reason !== 'current') {
          parts.push(`Stop reason: ${state.reason}`);
        }
        if (state.threadId != null) {
          parts.push(`Thread: ${state.threadId}`);
        }
        if (state.frameId != null) {
          parts.push(`Frame ID: ${state.frameId}`);
        }

        if (state.locals && state.locals.length > 0) {
          parts.push('');
          parts.push('Locals:');
          for (const v of state.locals) {
            let line = `  ${v.name}: ${v.value}`;
            if (v.type) line += ` (${v.type})`;
            if (v.variablesReference > 0) line += ` [expandable, ref: ${v.variablesReference}]`;
            parts.push(line);
          }
        }
      }

      return { content: [{ type: 'text' as const, text: parts.join('\n') }] };
    },
  );

  server.tool(
    'debug_get_output',
    'Get captured program output (stdout/stderr) from the debug session. Output is buffered since the session started.',
    {
      sessionId: z.string().optional().describe('Debug session ID. Omit for active session.'),
      categories: z.array(z.string()).optional().describe('Filter by output categories. Defaults to ["stdout", "stderr"]. Other categories: "console", "telemetry".'),
      clear: z.boolean().optional().describe('If true, clear the output buffer after reading.'),
    },
    async (args) => {
      const result = await ipc.request<T.GetOutputResponse>(IPC_ROUTES.GET_OUTPUT, {
        sessionId: args.sessionId,
        categories: args.categories ?? ['stdout', 'stderr'],
        clear: args.clear,
      });

      if (!result.output || result.output.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No program output captured.' }] };
      }

      // Combine consecutive entries of the same category
      const combined: string[] = [];
      let currentCategory = '';
      let currentText = '';

      for (const entry of result.output) {
        if (entry.category !== currentCategory) {
          if (currentText) {
            combined.push(`[${currentCategory}] ${currentText}`);
          }
          currentCategory = entry.category;
          currentText = entry.output;
        } else {
          currentText += entry.output;
        }
      }
      if (currentText) {
        combined.push(`[${currentCategory}] ${currentText}`);
      }

      return { content: [{ type: 'text' as const, text: `Program output:\n${combined.join('\n')}` }] };
    },
  );
}
