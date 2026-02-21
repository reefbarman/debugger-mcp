// --- Port File ---

export interface PortFileContent {
  port: number;
  authToken: string;
  pid: number;
  workspaceFolder?: string;
  timestamp: number;
}

// --- Session Management ---

export interface StartSessionRequest {
  configuration: string | DebugConfiguration;
  workspaceFolder?: string;
  noDebug?: boolean;
}

export interface DebugConfiguration {
  type: string;
  name: string;
  request: 'launch' | 'attach';
  [key: string]: unknown;
}

export interface StartSessionResponse {
  success: boolean;
  sessionId?: string;
}

export interface StopSessionRequest {
  sessionId?: string;
}

export interface RestartSessionRequest {
  sessionId?: string;
  configuration?: string | DebugConfiguration;
}

export interface SessionInfo {
  id: string;
  name: string;
  type: string;
  workspaceFolder?: string;
}

export interface ListSessionsResponse {
  sessions: SessionInfo[];
}

export interface ListConfigurationsResponse {
  configurations: Array<{
    name: string;
    type: string;
    request: string;
  }>;
}

// --- Execution Control ---

export interface ExecutionRequest {
  sessionId?: string;
  threadId?: number;
  /** Number of times to repeat the step (e.g., step over 5 lines). Only for step commands. */
  count?: number;
}

/** Returned by all execution commands (continue, step, pause) with full stop state. */
export interface StoppedState {
  /** Why the debugger stopped: "step", "breakpoint", "exception", "pause", "entry", etc. */
  reason: string;
  /** File path where execution stopped */
  file?: string;
  /** Line number (1-based) */
  line?: number;
  /** Column number (1-based) */
  column?: number;
  /** Function name at the stop location */
  functionName?: string;
  /** Thread ID that stopped */
  threadId?: number;
  /** Frame ID of the top frame (useful for follow-up evaluate calls) */
  frameId?: number;
  /** Local variables at the stop location (non-expensive scopes only) */
  locals?: VariableInfo[];
  /** Whether the program exited instead of stopping */
  exited?: boolean;
  /** Process exit code (only present when exited is true) */
  exitCode?: number;
}

// --- Output ---

export interface OutputEntry {
  category: string;
  output: string;
  timestamp: number;
}

export interface GetOutputRequest {
  sessionId?: string;
  /** Only return entries from these categories (default: ["stdout", "stderr"]) */
  categories?: string[];
  /** Clear the buffer after reading */
  clear?: boolean;
}

export interface GetOutputResponse {
  output: OutputEntry[];
}

// --- Status ---

export interface GetStatusRequest {
  sessionId?: string;
}

export interface GetStatusResponse {
  /** Whether a debug session is active */
  active: boolean;
  /** Session info if active */
  session?: SessionInfo;
  /** Whether the debugger is currently stopped (paused at a breakpoint/step) */
  stopped: boolean;
  /** Current stop location and locals (if stopped) */
  state?: StoppedState;
}

// --- Breakpoints ---

export interface SetBreakpointRequest {
  file: string;
  line: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
  enabled?: boolean;
}

export interface SetFunctionBreakpointRequest {
  functionName: string;
  condition?: string;
  hitCondition?: string;
  enabled?: boolean;
}

export interface RemoveBreakpointRequest {
  file?: string;
  line?: number;
  id?: string;
  removeAll?: boolean;
  /** Remove all breakpoints in this file (ignores line) */
  removeAllInFile?: string;
}

export interface ToggleBreakpointRequest {
  id?: string;
  file?: string;
  line?: number;
  enabled: boolean;
}

export interface BreakpointInfo {
  id: string;
  type: 'source' | 'function';
  enabled: boolean;
  verified: boolean;
  file?: string;
  line?: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
  functionName?: string;
}

export interface ListBreakpointsResponse {
  breakpoints: BreakpointInfo[];
}

// --- State Inspection ---

export interface GetThreadsRequest {
  sessionId?: string;
}

export interface GetThreadsResponse {
  threads: Array<{
    id: number;
    name: string;
  }>;
}

export interface GetStackTraceRequest {
  sessionId?: string;
  threadId: number;
  startFrame?: number;
  levels?: number;
}

export interface StackFrame {
  id: number;
  name: string;
  source?: { path?: string; name?: string };
  line: number;
  column: number;
  moduleId?: number | string;
}

export interface GetStackTraceResponse {
  stackFrames: StackFrame[];
  totalFrames?: number;
}

export interface GetScopesRequest {
  sessionId?: string;
  frameId: number;
}

export interface ScopeInfo {
  name: string;
  variablesReference: number;
  expensive: boolean;
  namedVariables?: number;
  indexedVariables?: number;
}

export interface GetScopesResponse {
  scopes: ScopeInfo[];
}

export interface GetVariablesRequest {
  sessionId?: string;
  variablesReference: number;
  filter?: 'indexed' | 'named';
  start?: number;
  count?: number;
}

export interface VariableInfo {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
}

export interface GetVariablesResponse {
  variables: VariableInfo[];
}

export interface EvaluateRequest {
  sessionId?: string;
  expression: string;
  frameId?: number;
  context?: 'watch' | 'repl' | 'hover' | 'clipboard';
}

export interface EvaluateResponse {
  result: string;
  type?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
}

// --- Generic IPC ---

export interface IpcErrorResponse {
  success: false;
  error: string;
}

export interface IpcSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export type IpcResponse<T = unknown> = IpcSuccessResponse<T> | IpcErrorResponse;
