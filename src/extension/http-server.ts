import * as http from 'http';
import { DebugService } from './debug-service.js';
import { SessionTracker } from './session-tracker.js';
import { IPC_ROUTES } from '../shared/constants.js';

export class HttpServer {
  private server: http.Server | undefined;
  private port: number = 0;

  constructor(
    private debugService: DebugService,
    private sessionTracker: SessionTracker,
    private authToken: string,
  ) {}

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server!.address();
        if (typeof address === 'object' && address) {
          this.port = address.port;
          resolve(this.port);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });

      this.server.on('error', reject);
    });
  }

  stop(): void {
    this.server?.close();
    this.server = undefined;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.setHeader('Content-Type', 'application/json');

    // Validate auth token (skip for health check)
    const url = req.url ?? '';
    if (url !== IPC_ROUTES.HEALTH) {
      const authHeader = req.headers['authorization'];
      if (authHeader !== `Bearer ${this.authToken}`) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
        return;
      }
    }

    try {
      const body = req.method === 'POST' ? await this.readBody(req) : {};
      const result = await this.routeRequest(url, body);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: result }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = (error as any)?.statusCode ?? 500;
      res.writeHead(statusCode);
      res.end(JSON.stringify({ success: false, error: message }));
    }
  }

  private async routeRequest(url: string, body: any): Promise<any> {
    switch (url) {
      case IPC_ROUTES.HEALTH:
        return { status: 'ok', sessions: this.sessionTracker.getAllSessions().length };

      // Session management
      case IPC_ROUTES.START_SESSION:
        return this.debugService.startSession(body, this.sessionTracker);
      case IPC_ROUTES.STOP_SESSION:
        await this.debugService.stopSession(body.sessionId, this.sessionTracker);
        return {};
      case IPC_ROUTES.RESTART_SESSION:
        await this.debugService.stopSession(body.sessionId, this.sessionTracker);
        await new Promise(r => setTimeout(r, 500));
        return this.debugService.startSession(body, this.sessionTracker);
      case IPC_ROUTES.LIST_SESSIONS:
        return { sessions: this.sessionTracker.getAllSessions() };
      case IPC_ROUTES.LIST_CONFIGURATIONS:
        return this.debugService.listConfigurations();

      // Execution control — now returns StoppedState
      case IPC_ROUTES.CONTINUE:
        return this.debugService.continue(body.sessionId, body.threadId, this.sessionTracker);
      case IPC_ROUTES.PAUSE:
        return this.debugService.pause(body.sessionId, body.threadId, this.sessionTracker);
      case IPC_ROUTES.STEP_OVER:
        return this.debugService.stepOver(body.sessionId, body.threadId, body.count, this.sessionTracker);
      case IPC_ROUTES.STEP_INTO:
        return this.debugService.stepInto(body.sessionId, body.threadId, body.count, this.sessionTracker);
      case IPC_ROUTES.STEP_OUT:
        return this.debugService.stepOut(body.sessionId, body.threadId, body.count, this.sessionTracker);

      // Breakpoints
      case IPC_ROUTES.SET_BREAKPOINT:
        return this.debugService.setBreakpoint(body);
      case IPC_ROUTES.SET_FUNCTION_BREAKPOINT:
        return this.debugService.setFunctionBreakpoint(body);
      case IPC_ROUTES.REMOVE_BREAKPOINT:
        return this.debugService.removeBreakpoint(body);
      case IPC_ROUTES.LIST_BREAKPOINTS:
        return this.debugService.listBreakpoints();
      case IPC_ROUTES.TOGGLE_BREAKPOINT:
        return this.debugService.toggleBreakpoint(body);

      // State inspection
      case IPC_ROUTES.GET_THREADS:
        return this.debugService.getThreads(body.sessionId, this.sessionTracker);
      case IPC_ROUTES.GET_STACK_TRACE:
        return this.debugService.getStackTrace(body, this.sessionTracker);
      case IPC_ROUTES.GET_SCOPES:
        return this.debugService.getScopes(body, this.sessionTracker);
      case IPC_ROUTES.GET_VARIABLES:
        return this.debugService.getVariables(body, this.sessionTracker);
      case IPC_ROUTES.EVALUATE:
        return this.debugService.evaluate(body, this.sessionTracker);

      // Status & Output
      case IPC_ROUTES.GET_STATUS:
        return this.debugService.getStatus(body.sessionId, this.sessionTracker);
      case IPC_ROUTES.GET_OUTPUT:
        return this.debugService.getOutput(body.sessionId, this.sessionTracker, body.categories, body.clear);

      default: {
        const err = new Error(`Unknown route: ${url}`);
        (err as any).statusCode = 404;
        throw err;
      }
    }
  }

  private readBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf-8');
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }
}
