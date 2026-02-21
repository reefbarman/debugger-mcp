import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { IpcClient } from '../ipc-client.js';
import { IPC_ROUTES } from '../../shared/constants.js';
import type * as T from '../../shared/types.js';

export function registerBreakpointTools(server: McpServer, ipc: IpcClient): void {
  server.tool(
    'debug_set_breakpoint',
    'Set a breakpoint at a file location. Supports conditional breakpoints, hit count breakpoints, and logpoints.',
    {
      file: z.string().describe('Absolute path to the source file'),
      line: z.number().describe('Line number (1-based)'),
      column: z.number().optional().describe('Column number (1-based)'),
      condition: z.string().optional().describe('Expression that must evaluate to true for the breakpoint to hit (e.g., "x > 5")'),
      hitCondition: z.string().optional().describe('Hit count expression (e.g., "5" to break on 5th hit, ">10" to break after 10 hits)'),
      logMessage: z.string().optional().describe('Log message instead of breaking. Use {expression} for interpolation (e.g., "x = {x}")'),
      enabled: z.boolean().optional().describe('Whether the breakpoint is enabled. Defaults to true.'),
    },
    async (args) => {
      const result = await ipc.request<T.BreakpointInfo>(IPC_ROUTES.SET_BREAKPOINT, args);
      let desc = `Breakpoint set at ${args.file}:${args.line}`;
      if (args.condition) desc += ` (condition: ${args.condition})`;
      if (args.hitCondition) desc += ` (hitCondition: ${args.hitCondition})`;
      if (args.logMessage) desc += ` (logpoint: "${args.logMessage}")`;
      desc += `\nBreakpoint ID: ${result.id}`;
      return { content: [{ type: 'text' as const, text: desc }] };
    },
  );

  server.tool(
    'debug_set_function_breakpoint',
    'Set a breakpoint that triggers when a specific function is called.',
    {
      functionName: z.string().describe('Name of the function to break on'),
      condition: z.string().optional().describe('Conditional expression'),
      hitCondition: z.string().optional().describe('Hit count expression'),
      enabled: z.boolean().optional().describe('Whether enabled. Defaults to true.'),
    },
    async (args) => {
      const result = await ipc.request<T.BreakpointInfo>(IPC_ROUTES.SET_FUNCTION_BREAKPOINT, args);
      return {
        content: [{ type: 'text' as const, text: `Function breakpoint set on "${args.functionName}".\nBreakpoint ID: ${result.id}` }],
      };
    },
  );

  server.tool(
    'debug_remove_breakpoint',
    'Remove breakpoint(s). Specify by ID, by file+line, by file (all in file), or remove all breakpoints.',
    {
      id: z.string().optional().describe('Breakpoint ID to remove'),
      file: z.string().optional().describe('File path to match (used with line)'),
      line: z.number().optional().describe('Line number to match (used with file)'),
      removeAll: z.boolean().optional().describe('If true, remove ALL breakpoints'),
      removeAllInFile: z.string().optional().describe('Remove all breakpoints in this file (absolute path)'),
    },
    async (args) => {
      const result = await ipc.request<{ removed: number }>(IPC_ROUTES.REMOVE_BREAKPOINT, args);
      return { content: [{ type: 'text' as const, text: `Removed ${result.removed} breakpoint(s).` }] };
    },
  );

  server.tool(
    'debug_list_breakpoints',
    'List all current breakpoints with their details.',
    {},
    async () => {
      const result = await ipc.request<T.ListBreakpointsResponse>(IPC_ROUTES.LIST_BREAKPOINTS);
      if (!result.breakpoints || result.breakpoints.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No breakpoints set.' }] };
      }
      const lines = result.breakpoints.map(bp => {
        let desc = bp.type === 'source'
          ? `[${bp.enabled ? 'ON' : 'OFF'}] ${bp.file}:${bp.line}`
          : `[${bp.enabled ? 'ON' : 'OFF'}] function: ${bp.functionName}`;
        if (bp.condition) desc += ` (if: ${bp.condition})`;
        if (bp.hitCondition) desc += ` (hits: ${bp.hitCondition})`;
        if (bp.logMessage) desc += ` (log: "${bp.logMessage}")`;
        desc += ` [ID: ${bp.id}]`;
        return desc;
      });
      return { content: [{ type: 'text' as const, text: `Breakpoints:\n${lines.join('\n')}` }] };
    },
  );

  server.tool(
    'debug_toggle_breakpoint',
    'Enable or disable a breakpoint without removing it.',
    {
      id: z.string().optional().describe('Breakpoint ID'),
      file: z.string().optional().describe('File path (used with line if ID not provided)'),
      line: z.number().optional().describe('Line number (used with file if ID not provided)'),
      enabled: z.boolean().describe('Set to true to enable, false to disable'),
    },
    async (args) => {
      const result = await ipc.request<T.BreakpointInfo | null>(IPC_ROUTES.TOGGLE_BREAKPOINT, args);
      if (!result) {
        return { content: [{ type: 'text' as const, text: 'Breakpoint not found.' }] };
      }
      return { content: [{ type: 'text' as const, text: `Breakpoint ${args.enabled ? 'enabled' : 'disabled'}.` }] };
    },
  );
}
