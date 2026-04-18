import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import type {
  CompletionWithPayload,
  LspCompletionItem,
  LspInsertReplaceEdit,
  LspMarkupContent,
  LspMarkedString,
  LspRange,
  LspTextEdit,
} from "./protocol.js";

/**
 * 归一化 hover 内容，统一转成 Monaco 可识别的 markdown 数组。
 */
export function normalizeHoverContents(
  contents: string | LspMarkupContent | LspMarkedString | Array<string | LspMarkupContent | LspMarkedString>,
): monaco.IMarkdownString[] {
  const contentList = Array.isArray(contents) ? contents : [contents];
  return contentList.map((item) => {
    if (typeof item === "string") {
      return {
        value: item,
      };
    }

    if ("language" in item) {
      return {
        value: `\`\`\`${item.language}\n${item.value}\n\`\`\``,
      };
    }

    return {
      value: item.value,
    };
  });
}

/**
 * 把 LSP 文档说明字段转成 Monaco 可展示的文案。
 */
export function toMonacoDocumentation(
  documentation?: string | LspMarkupContent,
): monaco.IMarkdownString | string | undefined {
  if (!documentation) {
    return undefined;
  }

  if (typeof documentation === "string") {
    return documentation;
  }

  return {
    value: documentation.value,
  };
}

/**
 * 把 LSP completion kind 映射成 Monaco 对应枚举。
 */
export function mapCompletionItemKind(kind?: number) {
  switch (kind) {
    case 2:
      return monaco.languages.CompletionItemKind.Method;
    case 3:
      return monaco.languages.CompletionItemKind.Function;
    case 4:
      return monaco.languages.CompletionItemKind.Constructor;
    case 5:
      return monaco.languages.CompletionItemKind.Field;
    case 6:
      return monaco.languages.CompletionItemKind.Variable;
    case 7:
      return monaco.languages.CompletionItemKind.Class;
    case 8:
      return monaco.languages.CompletionItemKind.Interface;
    case 9:
      return monaco.languages.CompletionItemKind.Module;
    case 10:
      return monaco.languages.CompletionItemKind.Property;
    case 11:
      return monaco.languages.CompletionItemKind.Unit;
    case 12:
      return monaco.languages.CompletionItemKind.Value;
    case 13:
      return monaco.languages.CompletionItemKind.Enum;
    case 14:
      return monaco.languages.CompletionItemKind.Keyword;
    case 15:
      return monaco.languages.CompletionItemKind.Snippet;
    case 17:
      return monaco.languages.CompletionItemKind.File;
    case 18:
      return monaco.languages.CompletionItemKind.Reference;
    case 19:
      return monaco.languages.CompletionItemKind.Folder;
    case 21:
      return monaco.languages.CompletionItemKind.Constant;
    case 22:
      return monaco.languages.CompletionItemKind.Struct;
    case 23:
      return monaco.languages.CompletionItemKind.Event;
    case 24:
      return monaco.languages.CompletionItemKind.Operator;
    case 25:
      return monaco.languages.CompletionItemKind.TypeParameter;
    default:
      return monaco.languages.CompletionItemKind.Text;
  }
}

/**
 * 把 LSP 诊断级别映射成 Monaco marker 严重程度。
 */
export function mapDiagnosticSeverity(severity?: number) {
  switch (severity) {
    case 2:
      return monaco.MarkerSeverity.Warning;
    case 3:
      return monaco.MarkerSeverity.Info;
    case 4:
      return monaco.MarkerSeverity.Hint;
    default:
      return monaco.MarkerSeverity.Error;
  }
}

/**
 * 把 LSP text edit 的范围转换成 Monaco 可接受的格式。
 */
export function convertTextEditRange(
  textEdit: LspTextEdit | LspInsertReplaceEdit,
  toRange: (_range: LspRange) => monaco.IRange | null,
): monaco.IRange | { insert: monaco.IRange; replace: monaco.IRange } | null {
  if ("range" in textEdit) {
    return toRange(textEdit.range);
  }

  const insert = toRange(textEdit.insert);
  const replace = toRange(textEdit.replace);
  if (!insert || !replace) {
    return null;
  }

  return { insert, replace };
}

/**
 * 从 completion item 中提取真正要插入的文本。
 */
export function extractCompletionInsertText(item: LspCompletionItem, fallbackText: string) {
  if (item.textEdit) {
    return item.textEdit.newText;
  }

  return item.insertText || fallbackText;
}

/**
 * 把 LSP completion item 转成 Monaco 可展示的候选项。
 */
export function toMonacoCompletionItem(
  model: monaco.editor.ITextModel,
  item: LspCompletionItem,
  position: monaco.Position,
  toRange: (_range: LspRange) => monaco.IRange | null,
): CompletionWithPayload {
  const label = typeof item.label === "string" ? item.label : item.label.label;
  const defaultRange = getDefaultCompletionRange(model, position);

  const textEditRange = item.textEdit
    ? convertTextEditRange(item.textEdit, toRange)
    : null;
  const insertText = extractCompletionInsertText(item, label);

  const additionalTextEdits: monaco.editor.ISingleEditOperation[] = [];
  item.additionalTextEdits?.forEach((edit) => {
    const range = toRange(edit.range);
    if (!range) {
      return;
    }

    additionalTextEdits.push({
      range,
      text: edit.newText,
    });
  });

  return {
    label,
    kind: mapCompletionItemKind(item.kind),
    detail: item.detail,
    documentation: toMonacoDocumentation(item.documentation),
    sortText: item.sortText,
    filterText: item.filterText,
    insertText,
    insertTextRules: item.insertTextFormat === 2
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
    range: textEditRange || defaultRange,
    additionalTextEdits: additionalTextEdits.length > 0 ? additionalTextEdits : undefined,
    commitCharacters: item.commitCharacters,
    preselect: item.preselect,
    __lspItem: item,
    __position: position,
  };
}

/**
 * 把 LSP completion item 转成 Monaco 可展示的 inline ghost text。
 */
export function toMonacoInlineCompletion(
  model: monaco.editor.ITextModel,
  item: LspCompletionItem,
  position: monaco.Position,
  toRange: (_range: LspRange) => monaco.IRange | null,
): monaco.languages.InlineCompletion | null {
  const defaultRange = getDefaultCompletionRange(model, position);
  const textEditRange = item.textEdit
    ? convertTextEditRange(item.textEdit, toRange)
    : null;
  const range = normalizeInlineCompletionRange(textEditRange || defaultRange);
  if (!range) {
    return null;
  }

  const insertText = extractCompletionInsertText(
    item,
    typeof item.label === "string" ? item.label : item.label.label,
  );
  if (!insertText) {
    return null;
  }

  const additionalTextEdits: monaco.editor.ISingleEditOperation[] = [];
  item.additionalTextEdits?.forEach((edit) => {
    const editRange = toRange(edit.range);
    if (!editRange) {
      return;
    }

    additionalTextEdits.push({
      range: editRange,
      text: edit.newText,
    });
  });

  return {
    insertText: item.insertTextFormat === 2
      ? { snippet: insertText }
      : insertText,
    range,
    additionalTextEdits: additionalTextEdits.length > 0 ? additionalTextEdits : undefined,
    completeBracketPairs: true,
  };
}

/**
 * 计算当前位置默认应该替换的词范围。
 */
function getDefaultCompletionRange(model: monaco.editor.ITextModel, position: monaco.Position): monaco.IRange {
  const word = model.getWordUntilPosition(position);
  return {
    startLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: word.endColumn,
  };
}

/**
 * Inline ghost text 只能处理单行替换范围，这里把多种 Monaco range 统一收口。
 */
function normalizeInlineCompletionRange(
  range: monaco.IRange | { insert: monaco.IRange; replace: monaco.IRange },
): monaco.IRange | null {
  const candidate = "insert" in range ? range.replace : range;
  if (candidate.startLineNumber !== candidate.endLineNumber) {
    return null;
  }

  return candidate;
}
