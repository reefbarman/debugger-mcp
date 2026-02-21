# Debugger MCP

A VS Code extension that exposes an MCP (Model Context Protocol) server, allowing AI agents like Claude Code and Claude Desktop to control VS Code's debugger. Language-agnostic — works with any debug adapter (Node.js, Python, C++, Go, Rust, Java, etc.).

## Features

- **22 MCP tools** for full debugger control
- **Works with any debugger** that implements the Debug Adapter Protocol
- **Execution commands block until the debugger stops** and return the stop location + local variables in a single response
- **Captures program output** (stdout/stderr) for inspection
- **Multi-window support** — each VS Code window runs its own bridge

## Architecture

```
Claude Code CLI / Desktop
       |  (stdio: JSON-RPC)
       v
MCP Server Process (dist/mcp-server.js)
       |  (HTTP to localhost:<port>)
       v
VS Code Extension (dist/extension.js)
       |  (vscode.debug.* API)
       v
Debug Adapter Protocol → Any Debugger
```

The extension starts a localhost HTTP server on a random port with a random auth token, and writes both to a temporary port file. The MCP server (spawned by the AI client via stdio) reads this file to communicate with the extension.

## Installation

This extension is not yet published to the VS Code Marketplace. Install it manually from the `.vsix` file.

### 1. Download the `.vsix`

Download `vscode-debugger-mcp-0.1.0.vsix` from this repository (it's in the repo root).

### 2. Install in VS Code

**Option A — Command line:**

```bash
code --install-extension vscode-debugger-mcp-0.1.0.vsix
```

**Option B — VS Code UI:**

1. Open VS Code
2. Go to the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Click the `...` menu at the top of the Extensions sidebar
4. Select **Install from VSIX...**
5. Browse to the downloaded `.vsix` file

### 3. Reload VS Code

After installation, reload the window (`Ctrl+Shift+P` / `Cmd+Shift+P` → **Developer: Reload Window**). The extension activates automatically on startup.

### From source (development)

```bash
git clone git@github.com:reefbarman/debugger-mcp.git
cd debugger-mcp
npm install
npm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host.

## MCP Client Configuration

### Claude Code

```bash
claude mcp add vscode-debugger node /path/to/vscode-debugger-mcp/dist/mcp-server.js
```

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "vscode-debugger": {
      "command": "node",
      "args": ["/path/to/vscode-debugger-mcp/dist/mcp-server.js"]
    }
  }
}
```

### VS Code (Copilot / other MCP clients)

Add to `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "vscode-debugger": {
      "command": "node",
      "args": ["/path/to/vscode-debugger-mcp/dist/mcp-server.js"]
    }
  }
}
```

## Tools

### Session Management

| Tool | Description |
|------|-------------|
| `debug_start` | Start a debug session from a launch.json config name or inline configuration |
| `debug_stop` | Stop a debug session |
| `debug_restart` | Restart a debug session |
| `debug_list_sessions` | List active debug sessions |
| `debug_list_configurations` | List available launch.json configurations |

### Execution Control

| Tool | Description |
|------|-------------|
| `debug_continue` | Resume execution until next breakpoint or exit. Returns stop location + locals |
| `debug_pause` | Pause a running program. Returns stop location + locals |
| `debug_step_over` | Step over (next line). Supports `count` for batch stepping |
| `debug_step_into` | Step into function calls. Supports `count` for batch stepping |
| `debug_step_out` | Step out of current function. Supports `count` for batch stepping |

### Breakpoints

| Tool | Description |
|------|-------------|
| `debug_set_breakpoint` | Set a source breakpoint (supports condition, hit count, logpoint) |
| `debug_set_function_breakpoint` | Set a function-name breakpoint |
| `debug_remove_breakpoint` | Remove by ID, file+line, all in file, or all |
| `debug_list_breakpoints` | List all breakpoints with details |
| `debug_toggle_breakpoint` | Enable/disable a breakpoint without removing it |

### State Inspection

| Tool | Description |
|------|-------------|
| `debug_get_threads` | List threads |
| `debug_get_stack_trace` | Get call stack for a thread |
| `debug_get_scopes` | Get variable scopes for a stack frame |
| `debug_get_variables` | Get variables in a scope or expand a structured variable |
| `debug_evaluate` | Evaluate an expression in the debug context |

### Status & Output

| Tool | Description |
|------|-------------|
| `debug_status` | Quick "where am I?" — session, stop location, and locals |
| `debug_get_output` | Get captured program output (stdout/stderr) |

## Build Scripts

| Script | Description |
|--------|-------------|
| `npm run compile` | Type-check and build both bundles |
| `npm run build` | Production build (minified, no source maps) |
| `npm run watch` | Watch mode for development |
| `npm run package` | Production build + package into `.vsix` |
| `npm run check-types` | Type-check only (no emit) |

## How It Works

1. **Extension activates** on VS Code startup and starts a localhost HTTP server on a random port
2. **Port file** is written to the OS temp directory containing `{ port, authToken, pid, workspaceFolder, timestamp }`
3. **MCP server** (spawned by the AI client) reads the port file, validates it (PID check, timestamp freshness), and sends authenticated HTTP requests
4. **Debug commands** are forwarded to the VS Code debug API
5. **DAP message interception** captures stopped events, program output, and exit codes in real-time
6. **Execution commands** (continue, step) block until the debugger pauses, then automatically gather the stop location and local variables

## Security

- HTTP server binds to `127.0.0.1` only (no network exposure)
- Random UUID auth token required on every request
- Token is shared only through a local temp file
- Port file includes PID for stale-file detection

## License

MIT
