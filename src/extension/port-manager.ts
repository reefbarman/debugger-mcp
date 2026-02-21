import * as vscode from 'vscode';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { getPortFilePath } from '../shared/constants.js';
import type { PortFileContent } from '../shared/types.js';

export class PortManager {
  private portFiles: string[] = [];
  private _authToken: string;

  constructor() {
    this._authToken = crypto.randomUUID();
  }

  get authToken(): string {
    return this._authToken;
  }

  async writePort(port: number): Promise<void> {

    const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const content: PortFileContent = {
      port,
      authToken: this._authToken,
      pid: process.pid,
      workspaceFolder: wsFolder,
      timestamp: Date.now(),
    };

    const json = JSON.stringify(content);

    // Write the default (non-workspace-specific) port file
    const defaultFile = getPortFilePath();
    fs.writeFileSync(defaultFile, json, 'utf-8');
    this.portFiles.push(defaultFile);

    // Also write a workspace-specific port file
    if (wsFolder) {
      const wsFile = getPortFilePath(wsFolder);
      fs.writeFileSync(wsFile, json, 'utf-8');
      this.portFiles.push(wsFile);
    }
  }

  cleanup(): void {
    for (const file of this.portFiles) {
      try {
        fs.unlinkSync(file);
      } catch {
        // ignore — file may already be gone
      }
    }
    this.portFiles = [];
  }
}
