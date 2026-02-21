import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { IpcClient } from '../ipc-client.js';
import { IPC_ROUTES } from '../../shared/constants.js';
import type * as T from '../../shared/types.js';

export function registerSessionTools(server: McpServer, ipc: IpcClient): void {
  server.tool(
    'debug_start',
    'Start a new debug session. Provide either the name of a launch.json configuration, or a full inline debug configuration object. Works with any debugger (Node.js, Python, C++, Go, etc.).',
    {
      configuration: z.union([
        z.string().describe('Name of a configuration from launch.json'),
        z.object({
          type: z.string().describe('Debugger type, e.g., "node", "python", "cppdbg", "go"'),
          name: z.string().describe('Display name for this debug session'),
          request: z.enum(['launch', 'attach']).describe('Whether to launch a new process or attach to an existing one'),
          program: z.string().optional().describe('Path to the program to debug'),
          args: z.array(z.string()).optional().describe('Command line arguments'),
          cwd: z.string().optional().describe('Working directory'),
          env: z.record(z.string()).optional().describe('Environment variables'),
        }).passthrough().describe('Inline debug configuration object'),
      ]),
      noDebug: z.boolean().optional().describe('If true, launch without debugging (just run)'),
      workspaceFolder: z.string().optional().describe('Workspace folder name for multi-root workspaces'),
    },
    async (args) => {
      const result = await ipc.request<T.StartSessionResponse>(IPC_ROUTES.START_SESSION, args);
      const text = result.success
        ? `Debug session started successfully.\nSession ID: ${result.sessionId}`
        : 'Failed to start debug session.';
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  server.tool(
    'debug_stop',
    'Stop a running debug session. If no sessionId is provided, stops the active session.',
    {
      sessionId: z.string().optional().describe('ID of the session to stop. Omit to stop the active session.'),
    },
    async (args) => {
      await ipc.request(IPC_ROUTES.STOP_SESSION, args);
      return { content: [{ type: 'text' as const, text: 'Debug session stopped.' }] };
    },
  );

  server.tool(
    'debug_restart',
    'Restart the current debug session (stop and re-launch with the same configuration).',
    {
      sessionId: z.string().optional().describe('ID of the session to restart'),
      configuration: z.union([
        z.string(),
        z.object({
          type: z.string(),
          name: z.string(),
          request: z.enum(['launch', 'attach']),
        }).passthrough(),
      ]).optional().describe('New configuration to use on restart. If omitted, uses the same config.'),
    },
    async (args) => {
      await ipc.request(IPC_ROUTES.RESTART_SESSION, args);
      return { content: [{ type: 'text' as const, text: 'Debug session restarted.' }] };
    },
  );

  server.tool(
    'debug_list_sessions',
    'List all currently active debug sessions.',
    {},
    async () => {
      const result = await ipc.request<T.ListSessionsResponse>(IPC_ROUTES.LIST_SESSIONS);
      if (!result.sessions || result.sessions.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No active debug sessions.' }] };
      }
      const lines = result.sessions.map(s =>
        `- ${s.name} (ID: ${s.id}, type: ${s.type}${s.workspaceFolder ? `, folder: ${s.workspaceFolder}` : ''})`,
      );
      return { content: [{ type: 'text' as const, text: `Active debug sessions:\n${lines.join('\n')}` }] };
    },
  );

  server.tool(
    'debug_list_configurations',
    'List all available debug configurations from launch.json files in the workspace.',
    {},
    async () => {
      const result = await ipc.request<T.ListConfigurationsResponse>(IPC_ROUTES.LIST_CONFIGURATIONS);
      if (!result.configurations || result.configurations.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No launch configurations found in the workspace.' }] };
      }
      const lines = result.configurations.map(c =>
        `- "${c.name}" (type: ${c.type}, request: ${c.request})`,
      );
      return { content: [{ type: 'text' as const, text: `Available launch configurations:\n${lines.join('\n')}` }] };
    },
  );
}
