import type * as monaco from "monaco-editor/esm/vs/editor/editor.api";

export type DocumentContext = {
  fontSize: string;
  mathMode: boolean;
};

export type AssistStatusReporter = (_message: string, _isError: boolean) => void;

export type BridgeHealth = {
  ok: boolean;
  available: boolean;
  message: string;
  workspaceUri?: string;
  documentUri?: string;
};

export type TinymistSessionUris = {
  workspaceUri: string;
  documentUri: string;
};

export type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
};

export type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: JsonRpcError;
};

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export type BridgeEnvelope = {
  kind: "bridge/error";
  message?: string;
};

export type LspPosition = {
  line: number;
  character: number;
};

export type LspRange = {
  start: LspPosition;
  end: LspPosition;
};

export type LspMarkupContent = {
  kind: "plaintext" | "markdown";
  value: string;
};

export type LspMarkedString = {
  language: string;
  value: string;
};

export type LspHover = {
  contents: string | LspMarkupContent | LspMarkedString | Array<string | LspMarkupContent | LspMarkedString>;
  range?: LspRange;
};

export type LspTextEdit = {
  newText: string;
  range: LspRange;
};

export type LspInsertReplaceEdit = {
  newText: string;
  insert: LspRange;
  replace: LspRange;
};

export type LspCompletionItem = {
  label: string | { label: string; description?: string; detail?: string };
  kind?: number;
  detail?: string;
  documentation?: string | LspMarkupContent;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  insertTextFormat?: number;
  textEdit?: LspTextEdit | LspInsertReplaceEdit;
  additionalTextEdits?: LspTextEdit[];
  commitCharacters?: string[];
  preselect?: boolean;
  data?: unknown;
};

export type LspCompletionList = {
  isIncomplete?: boolean;
  items: LspCompletionItem[];
};

export type LspDiagnostic = {
  range: LspRange;
  severity?: number;
  code?: number | string;
  source?: string;
  message: string;
};

export type PublishDiagnosticsParams = {
  uri: string;
  diagnostics: LspDiagnostic[];
};

export type PendingRequest = {
  resolve: (_value: unknown) => void;
  reject: (_reason?: unknown) => void;
};

export type CompletionWithPayload = monaco.languages.CompletionItem & {
  __lspItem?: LspCompletionItem;
  __position?: monaco.Position;
};

export const COMPLETION_TRIGGER_CHARACTERS = ["#", "(", ",", ".", ":", "/", "[", "]", "$", "@", "<"];
export const TINYMIST_CONNECT_TIMEOUT_MS = 3000;
