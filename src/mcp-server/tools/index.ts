import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { IpcClient } from '../ipc-client.js';
import { registerSessionTools } from './session-tools.js';
import { registerExecutionTools } from './execution-tools.js';
import { registerBreakpointTools } from './breakpoint-tools.js';
import { registerInspectionTools } from './inspection-tools.js';
import { registerStatusTools } from './status-tools.js';

export function registerAllTools(server: McpServer, ipc: IpcClient): void {
  registerSessionTools(server, ipc);
  registerExecutionTools(server, ipc);
  registerBreakpointTools(server, ipc);
  registerInspectionTools(server, ipc);
  registerStatusTools(server, ipc);
}
