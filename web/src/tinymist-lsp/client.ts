import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { BRIDGE_CONFIG } from "../constants.js";
import { buildVirtualDocument, toLspPosition, toMonacoRange } from "./document.js";
import {
  mapDiagnosticSeverity,
  normalizeHoverContents,
  toMonacoCompletionItem,
  toMonacoInlineCompletion,
} from "./monaco-adapter.js";
import {
  COMPLETION_TRIGGER_CHARACTERS,
  TINYMIST_CONNECT_TIMEOUT_MS,
  type AssistStatusReporter,
  type BridgeEnvelope,
  type CompletionWithPayload,
  type DocumentContext,
  type JsonRpcMessage,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type LspCompletionItem,
  type LspCompletionList,
  type LspHover,
  type PendingRequest,
  type PublishDiagnosticsParams,
  type TinymistSessionUris,
} from "./protocol.js";

/**
 * 负责把 Monaco 与 Tinymist LSP 连接起来。
 */
export class TinymistLspClient {
  private readonly model: monaco.editor.ITextModel;
  private readonly getDocumentContext: () => DocumentContext;
  private readonly reportStatus: AssistStatusReporter;
  private readonly sessionUris: TinymistSessionUris;
  private readonly providerDisposables: monaco.IDisposable[] = [];
  private readonly requestMap = new Map<number, PendingRequest>();

  private socket: WebSocket | null = null;
  private modelDisposable: monaco.IDisposable | null = null;
  private lastCompletionRequest: { key: string; promise: Promise<LspCompletionItem[]> } | null = null;
  private ready = false;
  private nextRequestId = 1;
  private documentVersion = 1;
  private disposed = false;

  constructor(
    model: monaco.editor.ITextModel,
    getDocumentContext: () => DocumentContext,
    reportStatus: AssistStatusReporter,
    sessionUris: TinymistSessionUris,
  ) {
    this.model = model;
    this.getDocumentContext = getDocumentContext;
    this.reportStatus = reportStatus;
    this.sessionUris = sessionUris;
  }

  /**
   * 建立 WebSocket 连接并初始化 LSP 会话。
   */
  async initialize() {
    this.reportStatus("正在连接 Tinymist 智能补全...", false);
    this.registerProviders();
    this.installModelListener();

    try {
      await this.openSocket();
      await this.sendInitialize();
      this.ready = true;
      this.reportStatus("Tinymist 智能补全已连接。", false);
      this.refreshDocument(true);
    } catch (error) {
      this.reportStatus(
        error instanceof Error
          ? `${error.message} 已退回基础编辑模式。`
          : "Tinymist 智能补全初始化失败，已退回基础编辑模式。",
        true,
      );
      this.dispose();
    }
  }

  /**
   * 把当前编辑器内容重新同步给 Tinymist。
   */
  refreshDocument(forceOpen = false) {
    if (!this.ready || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const virtualDocument = buildVirtualDocument(this.model.getValue(), this.getDocumentContext());
    if (forceOpen) {
      this.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri: this.sessionUris.documentUri,
          languageId: "typst",
          version: this.documentVersion,
          text: virtualDocument,
        },
      });
      return;
    }

    this.documentVersion += 1;
    this.sendNotification("textDocument/didChange", {
      textDocument: {
        uri: this.sessionUris.documentUri,
        version: this.documentVersion,
      },
      contentChanges: [
        {
          text: virtualDocument,
        },
      ],
    });
  }

  /**
   * 释放资源并关闭连接。
   */
  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.ready = false;

    this.providerDisposables.forEach((disposable) => {
      disposable.dispose();
    });
    this.providerDisposables.length = 0;

    this.modelDisposable?.dispose();
    this.modelDisposable = null;

    this.requestMap.forEach(({ reject }) => {
      reject(new Error("Tinymist 连接已关闭。"));
    });
    this.requestMap.clear();
    this.lastCompletionRequest = null;

    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // 浏览器可能已经在关闭连接，这里忽略即可。
      }
    }
    this.socket = null;

    monaco.editor.setModelMarkers(this.model, "tinymist", []);
  }

  /**
   * 建立到本地桥接服务的 WebSocket 连接。
   */
  private async openSocket() {
    const websocketUrl = `${BRIDGE_CONFIG.BASE_URL.replace(/^http/u, "ws")}/tinymist-lsp`;

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(websocketUrl);
      let opened = false;
      let timeoutId = 0;

      const cleanup = () => {
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("error", handleError);
        window.clearTimeout(timeoutId);
      };

      const handleOpen = () => {
        opened = true;
        cleanup();
        this.socket = socket;
        socket.addEventListener("message", (event) => {
          this.handleSocketMessage(event as MessageEvent<string>);
        });
        socket.addEventListener("close", () => {
          if (!this.disposed) {
            this.ready = false;
            this.reportStatus("Tinymist 连接已断开，已退回基础编辑模式。", true);
          }
        });
        resolve();
      };

      const handleError = () => {
        cleanup();
        reject(new Error("无法建立 Tinymist WebSocket 连接。"));
      };

      socket.addEventListener("open", handleOpen);
      socket.addEventListener("error", handleError);

      timeoutId = window.setTimeout(() => {
        if (!opened) {
          try {
            socket.close();
          } catch {
            // 忽略超时阶段的关闭异常。
          }
          reject(new Error("连接 Tinymist 超时。"));
        }
      }, TINYMIST_CONNECT_TIMEOUT_MS);
    });
  }

  /**
   * 发送 LSP initialize 请求。
   */
  private async sendInitialize() {
    const result = await this.sendRequest("initialize", {
      processId: null,
      clientInfo: {
        name: "PPTypst",
        version: "1.0.0",
      },
      locale: navigator.language,
      rootUri: this.sessionUris.workspaceUri,
      workspaceFolders: [
        {
          uri: this.sessionUris.workspaceUri,
          name: "pptypst",
        },
      ],
      capabilities: {
        general: {
          positionEncodings: ["utf-16"],
        },
        textDocument: {
          completion: {
            completionItem: {
              snippetSupport: true,
              insertReplaceSupport: true,
              documentationFormat: ["markdown", "plaintext"],
              resolveSupport: {
                properties: ["detail", "documentation", "additionalTextEdits"],
              },
            },
          },
          hover: {
            contentFormat: ["markdown", "plaintext"],
          },
          publishDiagnostics: {
            versionSupport: true,
          },
        },
      },
    });

    if (!result) {
      throw new Error("Tinymist 初始化失败。");
    }

    this.sendNotification("initialized", {});
  }

  /**
   * 注册 Monaco 侧的语言能力。
   */
  private registerProviders() {
    this.providerDisposables.push(
      monaco.languages.registerCompletionItemProvider("typst", {
        triggerCharacters: COMPLETION_TRIGGER_CHARACTERS,
        provideCompletionItems: async (_model, position, context) => {
          const result = await this.requestCompletion(position, context.triggerKind, context.triggerCharacter);
          return {
            suggestions: result,
          };
        },
        resolveCompletionItem: async (item) => {
          const completionItem = item as CompletionWithPayload;
          if (!completionItem.__lspItem || !completionItem.__position) {
            return item;
          }

          try {
            const resolved = await this.sendRequest("completionItem/resolve", completionItem.__lspItem);
            return toMonacoCompletionItem(
              this.model,
              resolved as LspCompletionItem,
              completionItem.__position,
              range => toMonacoRange(range, this.getDocumentContext()),
            );
          } catch {
            return item;
          }
        },
      }),
    );

    this.providerDisposables.push(
      monaco.languages.registerHoverProvider("typst", {
        provideHover: async (_model, position) => {
          return await this.requestHover(position);
        },
      }),
    );

    this.providerDisposables.push(
      monaco.languages.registerInlineCompletionsProvider("typst", {
        provideInlineCompletions: async (_model, position, context) => {
          if (context.selectedSuggestionInfo) {
            return {
              items: [],
              suppressSuggestions: false,
            };
          }

          const { triggerKind, triggerCharacter } = this.getInlineCompletionTrigger(position, context.triggerKind);
          const items = await this.requestInlineCompletions(position, triggerKind, triggerCharacter);
          return {
            items,
            suppressSuggestions: false,
            enableForwardStability: true,
          };
        },
        disposeInlineCompletions() {
          // 当前没有为 inline completion 持有额外资源，这里保留空实现即可。
        },
      }),
    );
  }

  /**
   * 安装文档变化监听器。
   */
  private installModelListener() {
    this.modelDisposable = this.model.onDidChangeContent(() => {
      this.lastCompletionRequest = null;
      this.refreshDocument();
    });
  }

  /**
   * 处理 WebSocket 收到的消息。
   */
  private handleSocketMessage(event: MessageEvent<string>) {
    const payload = typeof event.data === "string" ? event.data : "";
    if (!payload) {
      return;
    }

    let parsed: JsonRpcMessage | BridgeEnvelope;
    try {
      parsed = JSON.parse(payload) as JsonRpcMessage | BridgeEnvelope;
    } catch {
      return;
    }

    if ("kind" in parsed) {
      this.reportStatus(parsed.message || "Tinymist 服务发生未知错误。", true);
      return;
    }

    if ("method" in parsed) {
      if ("id" in parsed) {
        this.handleServerRequest(parsed);
        return;
      }

      if (parsed.method === "textDocument/publishDiagnostics") {
        this.handleDiagnostics(parsed.params as PublishDiagnosticsParams);
      }
      return;
    }

    if ("id" in parsed) {
      const pending = this.requestMap.get(parsed.id);
      if (!pending) {
        return;
      }

      this.requestMap.delete(parsed.id);
      if (parsed.error) {
        pending.reject(new Error(parsed.error.message));
        return;
      }

      pending.resolve(parsed.result);
    }
  }

  /**
   * 处理 Tinymist 主动发给客户端的请求，避免服务器等待超时。
   */
  private handleServerRequest(request: JsonRpcRequest) {
    const params = request.params as { items?: unknown[] } | undefined;
    let result = null;

    if (request.method === "workspace/configuration") {
      result = Array.from({ length: params?.items?.length || 0 }, () => null);
    } else if (request.method === "workspace/workspaceFolders") {
      result = [];
    }

    this.sendRawMessage({
      jsonrpc: "2.0",
      id: request.id,
      result,
    });
  }

  /**
   * 发送一个带返回值的 LSP 请求。
   */
  private sendRequest(method: string, params?: unknown) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Tinymist 连接尚未建立。"));
    }

    const id = this.nextRequestId++;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise<unknown>((resolve, reject) => {
      this.requestMap.set(id, { resolve, reject });
      this.sendRawMessage(request);
    });
  }

  /**
   * 发送一个无需返回值的 LSP 通知。
   */
  private sendNotification(method: string, params?: unknown) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };
    this.sendRawMessage(notification);
  }

  /**
   * 直接发送一条 JSON-RPC 消息。
   */
  private sendRawMessage(message: JsonRpcMessage) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  /**
   * 请求当前位置的补全项。
   */
  private async requestCompletion(
    position: monaco.Position,
    triggerKind: monaco.languages.CompletionTriggerKind,
    triggerCharacter?: string,
  ): Promise<monaco.languages.CompletionItem[]> {
    const items = await this.requestLspCompletionItems(position, triggerKind, triggerCharacter);
    return items.map(item => toMonacoCompletionItem(
      this.model,
      item,
      position,
      range => toMonacoRange(range, this.getDocumentContext()),
    ));
  }

  /**
   * 请求当前位置的悬浮提示。
   */
  private async requestHover(position: monaco.Position): Promise<monaco.languages.Hover | null> {
    if (!this.ready) {
      return null;
    }

    try {
      const result = await this.sendRequest("textDocument/hover", {
        textDocument: {
          uri: this.sessionUris.documentUri,
        },
        position: toLspPosition(position, this.getDocumentContext()),
      }) as LspHover | null;

      if (!result) {
        return null;
      }

      const range = result.range ? toMonacoRange(result.range, this.getDocumentContext()) : undefined;
      return {
        contents: normalizeHoverContents(result.contents),
        range: range || undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * 请求当前位置的 inline ghost text。
   */
  private async requestInlineCompletions(
    position: monaco.Position,
    triggerKind: monaco.languages.CompletionTriggerKind,
    triggerCharacter?: string,
  ): Promise<monaco.languages.InlineCompletion[]> {
    const items = await this.requestLspCompletionItems(position, triggerKind, triggerCharacter);
    const inlineItems = items
      .map(item => toMonacoInlineCompletion(
        this.model,
        item,
        position,
        range => toMonacoRange(range, this.getDocumentContext()),
      ))
      .filter((item): item is monaco.languages.InlineCompletion => Boolean(item));

    return inlineItems.slice(0, 3);
  }

  /**
   * 统一向 Tinymist 请求补全结果，并缓存同一位置的短时间重复请求。
   */
  private async requestLspCompletionItems(
    position: monaco.Position,
    triggerKind: monaco.languages.CompletionTriggerKind,
    triggerCharacter?: string,
  ): Promise<LspCompletionItem[]> {
    if (!this.ready) {
      return [];
    }

    const requestKey = [
      this.model.getVersionId(),
      position.lineNumber,
      position.column,
      triggerKind,
      triggerCharacter || "",
      this.getDocumentContext().fontSize,
      this.getDocumentContext().mathMode ? "math" : "text",
    ].join(":");

    if (this.lastCompletionRequest?.key === requestKey) {
      return await this.lastCompletionRequest.promise;
    }

    const promise = this.sendRequest("textDocument/completion", {
      textDocument: {
        uri: this.sessionUris.documentUri,
      },
      position: toLspPosition(position, this.getDocumentContext()),
      context: {
        triggerKind,
        triggerCharacter,
      },
    }).then((result) => {
      const completionList = Array.isArray(result)
        ? { items: result as LspCompletionItem[] }
        : result as LspCompletionList;
      return completionList.items;
    }).catch(() => []);

    this.lastCompletionRequest = {
      key: requestKey,
      promise,
    };

    return await promise;
  }

  /**
   * Inline completion 无法直接拿到触发字符，这里根据光标前一个字符推断。
   */
  private getInlineCompletionTrigger(
    position: monaco.Position,
    inlineTriggerKind: monaco.languages.InlineCompletionTriggerKind,
  ): {
    triggerKind: monaco.languages.CompletionTriggerKind;
    triggerCharacter?: string;
  } {
    const linePrefix = this.model.getLineContent(position.lineNumber).slice(0, position.column - 1);
    const previousCharacter = linePrefix.slice(-1) || undefined;
    if (previousCharacter && COMPLETION_TRIGGER_CHARACTERS.includes(previousCharacter)) {
      return {
        triggerKind: monaco.languages.CompletionTriggerKind.TriggerCharacter,
        triggerCharacter: previousCharacter,
      };
    }

    return {
      triggerKind: inlineTriggerKind === monaco.languages.InlineCompletionTriggerKind.Explicit
        ? monaco.languages.CompletionTriggerKind.TriggerForIncompleteCompletions
        : monaco.languages.CompletionTriggerKind.Invoke,
    };
  }

  /**
   * 把诊断通知转成 Monaco marker。
   */
  private handleDiagnostics(params: PublishDiagnosticsParams) {
    if (params.uri !== this.sessionUris.documentUri) {
      return;
    }

    const markers: monaco.editor.IMarkerData[] = [];
    params.diagnostics.forEach((diagnostic) => {
      const range = toMonacoRange(diagnostic.range, this.getDocumentContext());
      if (!range) {
        return;
      }

      markers.push({
        severity: mapDiagnosticSeverity(diagnostic.severity),
        message: diagnostic.message,
        source: diagnostic.source || "tinymist",
        code: diagnostic.code !== undefined ? String(diagnostic.code) : undefined,
        startLineNumber: range.startLineNumber,
        startColumn: range.startColumn,
        endLineNumber: range.endLineNumber,
        endColumn: range.endColumn,
      });
    });

    monaco.editor.setModelMarkers(this.model, "tinymist", markers);
  }
}
