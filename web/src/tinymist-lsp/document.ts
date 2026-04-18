import type * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import type { DocumentContext, LspPosition, LspRange } from "./protocol.js";

/**
 * 构造与本地编译一致的虚拟 Typst 文档。
 */
export function buildVirtualDocument(rawCode: string, context: DocumentContext) {
  const body = context.mathMode ? `$\n${rawCode}\n$` : rawCode;
  return "#set page(margin: 3pt, background: none, width: auto, fill: none, height: auto)"
    + `\n#set text(size: ${context.fontSize}pt)\n${body}`;
}

/**
 * 把 Monaco 位置映射到虚拟文档里的 LSP 位置。
 */
export function toLspPosition(position: monaco.Position, context: DocumentContext): LspPosition {
  const lineOffset = getVirtualDocumentLineOffset(context);
  return {
    line: position.lineNumber - 1 + lineOffset,
    character: position.column - 1,
  };
}

/**
 * 把 LSP 范围映射回 Monaco 可显示的范围。
 */
export function toMonacoRange(range: LspRange, context: DocumentContext): monaco.IRange | null {
  const lineOffset = getVirtualDocumentLineOffset(context);
  const startLineNumber = range.start.line - lineOffset + 1;
  const endLineNumber = range.end.line - lineOffset + 1;

  if (startLineNumber < 1 || endLineNumber < 1) {
    return null;
  }

  return {
    startLineNumber,
    startColumn: range.start.character + 1,
    endLineNumber,
    endColumn: range.end.character + 1,
  };
}

/**
 * 计算虚拟文档相对真实编辑器内容的行偏移。
 */
function getVirtualDocumentLineOffset(context: DocumentContext) {
  return context.mathMode ? 3 : 2;
}
