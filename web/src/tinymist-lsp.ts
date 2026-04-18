import type * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { readTinymistHealth } from "./tinymist-lsp/bridge.js";
import { TinymistLspClient } from "./tinymist-lsp/client.js";
import type { AssistStatusReporter, DocumentContext, TinymistSessionUris } from "./tinymist-lsp/protocol.js";

let currentClient: TinymistLspClient | null = null;

/**
 * 初始化 Tinymist LSP；如果环境缺失，则自动退回基础编辑模式。
 */
export async function initializeTinymistLsp(
  model: monaco.editor.ITextModel,
  getDocumentContext: () => DocumentContext,
  reportStatus: AssistStatusReporter,
) {
  disposeTinymistLsp();

  const health = await readTinymistHealth();
  if (!health.available) {
    reportStatus(`${health.message} 已退回基础编辑模式。`, true);
    return;
  }

  const sessionUris = readTinymistSessionUris(health);
  if (!sessionUris) {
    reportStatus("Tinymist 会话缺少有效的工作区路径信息，已退回基础编辑模式。", true);
    return;
  }

  const client = new TinymistLspClient(model, getDocumentContext, reportStatus, sessionUris);
  currentClient = client;
  await client.initialize();
}

/**
 * 当字号或数学模式变化时，把最新的虚拟文档重新同步给 Tinymist。
 */
export function refreshTinymistDocument() {
  currentClient?.refreshDocument();
}

/**
 * 释放当前 LSP 连接。
 */
export function disposeTinymistLsp() {
  currentClient?.dispose();
  currentClient = null;
}

/**
 * 从桥接健康检查结果中提取本次 LSP 会话要使用的文件 URI。
 */
function readTinymistSessionUris(health: {
  workspaceUri?: string;
  documentUri?: string;
}): TinymistSessionUris | null {
  if (!health.workspaceUri || !health.documentUri) {
    return null;
  }

  return {
    workspaceUri: health.workspaceUri,
    documentUri: health.documentUri,
  };
}
