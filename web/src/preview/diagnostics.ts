import type { DiagnosticMessage } from "../typst.js";

/**
 * 渲染诊断信息到预览面板。
 */
export function renderDiagnostics(
  diagnostics: (string | DiagnosticMessage)[],
  content: HTMLElement,
  mathMode: boolean,
) {
  content.innerHTML = "";

  diagnostics.forEach((diagnostic, index) => {
    if (typeof diagnostic === "string") {
      const diagnosticElement = document.createElement("div");
      diagnosticElement.className = "diagnostic";
      diagnosticElement.textContent = diagnostic;
      content.appendChild(diagnosticElement);
      return;
    }

    if (index > 0) {
      const separator = document.createElement("hr");
      separator.className = "diagnostic-separator";
      content.appendChild(separator);
    }

    const diagnosticElement = document.createElement("div");
    diagnosticElement.className = `diagnostic diagnostic-${diagnostic.severity.toLowerCase()}`;

    const headerDiv = document.createElement("div");
    headerDiv.className = "diagnostic-header";

    const severitySpan = document.createElement("span");
    severitySpan.className = "diagnostic-severity";
    severitySpan.textContent = diagnostic.severity;

    const rangeSpan = document.createElement("span");
    rangeSpan.className = "diagnostic-range";
    rangeSpan.textContent = correctDiagnosticRange(diagnostic.range, mathMode);

    headerDiv.appendChild(severitySpan);
    headerDiv.appendChild(rangeSpan);

    const messageSpan = document.createElement("span");
    messageSpan.className = "diagnostic-message";
    messageSpan.textContent = diagnostic.message;

    diagnosticElement.appendChild(headerDiv);
    diagnosticElement.appendChild(messageSpan);
    content.appendChild(diagnosticElement);
  });
}

/**
 * 修正本地桥接层额外包裹行数带来的诊断偏移。
 */
function correctDiagnosticRange(range: string, mathMode: boolean): string {
  const rangeRegex = /(\d+):(\d+)-(\d+):(\d+)/;
  const match = range.match(rangeRegex);
  if (match) {
    const offset = mathMode ? 3 : 2;
    const startLine = Math.max(1, Number.parseInt(match[1], 10) - offset);
    const startCol = Number.parseInt(match[2], 10);
    const endLine = Math.max(1, Number.parseInt(match[3], 10) - offset);
    const endCol = Number.parseInt(match[4], 10);
    return `${startLine.toString()}:${startCol.toString()}-${endLine.toString()}:${endCol.toString()}`;
  }
  return range;
}
