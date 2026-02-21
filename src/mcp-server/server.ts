import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { IpcClient } from './ipc-client.js';
import { registerAllTools } from './tools/index.js';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from '../shared/constants.js';

async function main(): Promise<void> {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  const ipcClient = new IpcClient();

  // Try to discover the port early for a fast-fail with a clear error.
  // Don't crash — the extension might start later and tools will report the error.
  try {
    ipcClient.discoverPort();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[warn] ${message}`);
  }

  registerAllTools(server, ipcClient);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error starting MCP server:', error);
  process.exit(1);
});
