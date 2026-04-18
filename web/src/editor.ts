type EditorContext = {
  fontSize: string;
  mathMode: boolean;
};

type InitializeTypstEditorOptions = {
  onSubmit: () => void;
  onContentChange: () => void;
  getDocumentContext: () => EditorContext;
  setAssistStatus: (_message: string, _isError: boolean) => void;
};

type EditorRuntimeModule = typeof import("./editor-runtime.js");

let editorRuntimePromise: Promise<EditorRuntimeModule> | null = null;
let editorRuntime: EditorRuntimeModule | null = null;
let pendingEditorValue = "";
let hasPendingEditorValue = false;
let pendingContextRefresh = false;
let pendingThemeSync = false;

/**
 * 按需加载真正的 Monaco 编辑器运行时，避免把重依赖打进主入口。
 */
async function loadEditorRuntime() {
  if (!editorRuntimePromise) {
    editorRuntimePromise = import("./editor-runtime.js");
  }

  const runtime = await editorRuntimePromise;
  editorRuntime = runtime;
  return runtime;
}

/**
 * 初始化 Typst 编辑器。
 */
export async function initializeTypstEditor(options: InitializeTypstEditorOptions) {
  const runtime = await loadEditorRuntime();
  await runtime.initializeTypstEditor(options);

  if (hasPendingEditorValue) {
    runtime.setTypstEditorValue(pendingEditorValue);
    hasPendingEditorValue = false;
  }

  if (pendingContextRefresh) {
    runtime.refreshTypstEditorContext();
    pendingContextRefresh = false;
  }

  if (pendingThemeSync) {
    runtime.syncTypstEditorTheme();
    pendingThemeSync = false;
  }
}

/**
 * 读取当前编辑器内容；如果运行时尚未加载，则返回本地缓存值。
 */
export function getTypstEditorValue() {
  return editorRuntime?.getTypstEditorValue() || pendingEditorValue;
}

/**
 * 写入编辑器内容；在运行时尚未完成加载时先缓存，初始化后再回放。
 */
export function setTypstEditorValue(value: string) {
  pendingEditorValue = value;
  hasPendingEditorValue = true;
  editorRuntime?.setTypstEditorValue(value);
}

/**
 * 通知编辑器刷新与上下文相关的状态。
 */
export function refreshTypstEditorContext() {
  pendingContextRefresh = true;
  editorRuntime?.refreshTypstEditorContext();
}

/**
 * 同步当前主题到编辑器。
 */
export function syncTypstEditorTheme() {
  pendingThemeSync = true;
  editorRuntime?.syncTypstEditorTheme();
}

/**
 * 释放编辑器资源。
 */
export function disposeTypstEditor() {
  editorRuntime?.disposeTypstEditor();
  editorRuntime = null;
  editorRuntimePromise = null;
}
