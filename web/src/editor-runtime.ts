import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import "monaco-editor/min/vs/editor/editor.main.css";
import "monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js";
import "monaco-editor/esm/vs/editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js";
import "monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js";
import { DOM_IDS } from "./constants.js";
import { disposeTinymistLsp, initializeTinymistLsp, refreshTinymistDocument } from "./tinymist-lsp.js";
import { getHTMLElement } from "./utils/dom.js";

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

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker: (_workerId: string, _label: string) => Worker;
    };
  }
}

const TYPST_LANGUAGE_ID = "typst";
const TYPST_MODEL_URI = monaco.Uri.parse("file:///pptypst/taskpane.typ");

let typstEditor: monaco.editor.IStandaloneCodeEditor | null = null;
let typstModel: monaco.editor.ITextModel | null = null;
let isApplyingExternalValue = false;

/**
 * 初始化 Typst 编辑器，并接上 Tinymist 智能提示。
 */
export async function initializeTypstEditor(options: InitializeTypstEditorOptions) {
  configureMonacoWorker();
  registerTypstLanguage();

  const editorHost = getHTMLElement(DOM_IDS.TYPST_INPUT);
  const assistStatus = getHTMLElement(DOM_IDS.EDITOR_ASSIST_STATUS);
  assistStatus.textContent = "智能补全：正在初始化...";
  assistStatus.classList.remove("error");

  typstModel = monaco.editor.getModel(TYPST_MODEL_URI)
    || monaco.editor.createModel("", TYPST_LANGUAGE_ID, TYPST_MODEL_URI);

  typstEditor = monaco.editor.create(editorHost, {
    model: typstModel,
    theme: isDarkMode() ? "vs-dark" : "vs",
    minimap: { enabled: false },
    automaticLayout: true,
    wordWrap: "on",
    scrollBeyondLastLine: false,
    fixedOverflowWidgets: true,
    quickSuggestions: {
      other: true,
      comments: false,
      strings: true,
    },
    quickSuggestionsDelay: 90,
    suggestOnTriggerCharacters: true,
    tabCompletion: "on",
    acceptSuggestionOnEnter: "smart",
    suggest: {
      preview: true,
      previewMode: "subwordSmart",
      selectionMode: "whenQuickSuggestion",
      showStatusBar: false,
      showInlineDetails: true,
      localityBonus: true,
      snippetsPreventQuickSuggestions: false,
    },
    inlineSuggest: {
      enabled: true,
      mode: "subwordSmart",
      suppressSuggestions: false,
      showToolbar: "onHover",
      minShowDelay: 80,
    },
    scrollbar: {
      handleMouseWheel: false,
      alwaysConsumeMouseWheel: false,
    },
    snippetSuggestions: "top",
    padding: {
      top: 10,
      bottom: 10,
    },
    lineNumbers: "off",
    folding: false,
    glyphMargin: false,
    overviewRulerLanes: 0,
    renderLineHighlight: "none",
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 0,
    fontSize: 14,
    fontFamily: "\"Cascadia Code\", \"Consolas\", monospace",
    fontLigatures: true,
    tabSize: 2,
    insertSpaces: true,
    ariaLabel: "Typst 编辑器",
  });

  // 只有在编辑器真正聚焦后才接管滚轮，避免鼠标悬停时锁住整个任务窗格的滚动。
  typstEditor.onDidFocusEditorText(() => {
    syncEditorMouseWheelMode(true);
  });

  typstEditor.onDidBlurEditorText(() => {
    syncEditorMouseWheelMode(false);
  });

  typstEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    options.onSubmit();
  });

  typstModel.onDidChangeContent(() => {
    if (isApplyingExternalValue) {
      return;
    }

    options.onContentChange();
  });

  await initializeTinymistLsp(
    typstModel,
    options.getDocumentContext,
    (message, isError) => {
      assistStatus.textContent = `智能补全：${message}`;
      assistStatus.classList.toggle("error", isError);
      options.setAssistStatus(message, isError);
    },
  );
}

/**
 * 读取当前编辑器里的 Typst 源码。
 */
export function getTypstEditorValue() {
  return typstModel?.getValue() || "";
}

/**
 * 把外部内容写入编辑器，并避免触发一次额外的输入链路。
 */
export function setTypstEditorValue(value: string) {
  if (!typstModel || typstModel.getValue() === value) {
    return;
  }

  isApplyingExternalValue = true;
  typstModel.setValue(value);
  isApplyingExternalValue = false;
  refreshTinymistDocument();
}

/**
 * 当字号或数学模式变化时，刷新 Tinymist 的虚拟文档。
 */
export function refreshTypstEditorContext() {
  refreshTinymistDocument();
}

/**
 * 根据当前主题切换 Monaco 颜色方案。
 */
export function syncTypstEditorTheme() {
  if (!typstEditor) {
    return;
  }

  monaco.editor.setTheme(isDarkMode() ? "vs-dark" : "vs");
}

/**
 * 清理编辑器资源。
 */
export function disposeTypstEditor() {
  disposeTinymistLsp();
  typstEditor?.dispose();
  typstEditor = null;
}

/**
 * 配置 Monaco 所需的编辑器 worker。
 */
function configureMonacoWorker() {
  window.MonacoEnvironment = {
    getWorker() {
      return new editorWorker();
    },
  };
}

/**
 * 注册最基础的 Typst 语言配置，让编辑体验比原始 textarea 更像代码编辑器。
 */
function registerTypstLanguage() {
  if (monaco.languages.getLanguages().some(language => language.id === TYPST_LANGUAGE_ID)) {
    return;
  }

  monaco.languages.register({ id: TYPST_LANGUAGE_ID });
  monaco.languages.setLanguageConfiguration(TYPST_LANGUAGE_ID, {
    comments: {
      lineComment: "//",
      blockComment: ["/*", "*/"],
    },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "\"", close: "\"" },
      { open: "$", close: "$" },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "\"", close: "\"" },
      { open: "$", close: "$" },
    ],
  });

  monaco.languages.setMonarchTokensProvider(TYPST_LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/#(let|set|show|if|else|for|while|break|continue|return|import|include|context|as)\b/, "keyword"],
        [/#\w[\w-]*/, "predefined"],
        [/\$[^$]*\$/, "number"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@string"],
        [/[{}()[\]]/, "@brackets"],
        [/\b\d+(\.\d+)?\b/, "number"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/./, "comment"],
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
    },
  });
}

/**
 * 当前是否为暗色主题。
 */
function isDarkMode() {
  return document.documentElement.classList.contains("dark-mode");
}

/**
 * 按编辑器聚焦状态切换滚轮接管，减少任务窗格滚动冲突。
 */
function syncEditorMouseWheelMode(enabled: boolean) {
  if (!typstEditor) {
    return;
  }

  typstEditor.updateOptions({
    scrollbar: {
      handleMouseWheel: enabled,
    },
  });
}
