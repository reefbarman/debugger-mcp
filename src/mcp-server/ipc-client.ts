import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { PortFileContent } from '../shared/types.js';

const PORT_FILE_PREFIX = 'vscode-debugger-mcp';

export class IpcClient {
  private port: number | null = null;
  private authToken: string | null = null;
  private portFileContent: PortFileContent | null = null;

  discoverPort(workspacePath?: string): number {
    // Try workspace-specific port file first
    if (workspacePath) {
      const crypto = require('crypto') as typeof import('crypto');
      const hash = crypto.createHash('sha256').update(workspacePath).digest('hex').slice(0, 12);
      const wsPortFile = path.join(os.tmpdir(), `${PORT_FILE_PREFIX}-${hash}.port`);
      if (fs.existsSync(wsPortFile)) {
        return this.loadPortFile(wsPortFile);
      }
    }

    // Fall back to default port file
    const defaultFile = path.join(os.tmpdir(), `${PORT_FILE_PREFIX}.port`);
    if (!fs.existsSync(defaultFile)) {
      throw new Error(
        'VS Code Debugger MCP extension is not running.\n' +
        'Please open VS Code and ensure the "Debugger MCP" extension is installed and activated.\n' +
        `Expected port file at: ${defaultFile}`,
      );
    }

    return this.loadPortFile(defaultFile);
  }

  async request<T>(routePath: string, body?: any): Promise<T> {
    if (!this.port) {
      this.discoverPort();
    }

    return new Promise<T>((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : undefined;

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: this.port!,
          path: routePath,
          method: payload ? 'POST' : 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.authToken}`,
            ...(payload ? { 'Content-Length': String(Buffer.byteLength(payload)) } : {}),
          },
          timeout: 30000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf-8');
              const parsed = JSON.parse(raw);
              if (parsed.success) {
                resolve(parsed.data as T);
              } else {
                reject(new Error(parsed.error ?? 'Unknown error from VS Code extension'));
              }
            } catch {
              reject(new Error('Failed to parse response from VS Code extension'));
            }
          });
        },
      );

      req.on('error', (err) => {
        reject(new Error(
          `Cannot connect to VS Code extension on port ${this.port}. ` +
          `Is VS Code running? Error: ${err.message}`,
        ));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request to VS Code extension timed out (30s)'));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  getWorkspaceFolder(): string | undefined {
    return this.portFileContent?.workspaceFolder;
  }

  private loadPortFile(filePath: string): number {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const content: PortFileContent = JSON.parse(raw);

    // Check staleness (24 hours)
    if (Date.now() - content.timestamp > 24 * 60 * 60 * 1000) {
      throw new Error(
        'VS Code Debugger MCP extension port file is stale (> 24h old). Please restart VS Code.',
      );
    }

    // Check if PID is still running
    if (!this.isProcessRunning(content.pid)) {
      throw new Error(
        `VS Code process (PID ${content.pid}) is no longer running. Please restart VS Code.`,
      );
    }

    this.port = content.port;
    this.authToken = content.authToken;
    this.portFileContent = content;
    return this.port;
  }

  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
