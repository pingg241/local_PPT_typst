import { getTypstHealth, typst } from "./typst.js";
import { applyFillColor, parseAndApplySize } from "./svg.js";
import { BRIDGE_CONFIG, DOM_IDS, PREVIEW_CONFIG, STORAGE_KEYS, FILL_COLOR_DISABLED } from "./constants.js";
import { getHTMLElement, getInputElement } from "./utils/dom.js";
import {
  getFillColor,
  getFontSize,
  getMathModeEnabled,
  getTypstCode,
  setButtonEnabled,
  setMathModeEnabled,
  setPreviewState,
  setTypstServiceState,
} from "./ui.js";
import { storeValue, getStoredValue } from "./utils/storage.js";
import { lastTypstShapeId } from "./shape.js";
import { renderDiagnostics } from "./preview/diagnostics.js";
import { refreshTypstEditorContext } from "./editor.js";

let previewTimerId: number | null = null;
let latestPreviewTaskId = 0;

/**
 * 统一调度预览更新，避免每个输入事件都立刻触发一次编译。
 */
function schedulePreviewUpdate(delay: number = BRIDGE_CONFIG.PREVIEW_DEBOUNCE_MS) {
  if (previewTimerId !== null) {
    window.clearTimeout(previewTimerId);
  }

  previewTimerId = window.setTimeout(() => {
    previewTimerId = null;
    void updatePreview();
  }, delay);
}

/**
 * 响应编辑器内容变化。
 */
export function handleTypstSourceChange() {
  updateButtonState();
  const rawCode = getTypstCode().trim();
  if (!rawCode) {
    setPreviewState("预览待输入", "输入 Typst 内容后会自动刷新本地编译预览。", "neutral");
  } else {
    setPreviewState("等待刷新", "检测到内容变化，正在准备重新编译预览。", "neutral");
  }
  schedulePreviewUpdate();
}

/**
 * 绑定预览相关的输入事件。
 */
export function setupPreviewListeners() {
  const fontSizeInput = getInputElement(DOM_IDS.FONT_SIZE);
  const fillColorInput = getInputElement(DOM_IDS.FILL_COLOR);
  const fillColorEnabled = getInputElement(DOM_IDS.FILL_COLOR_ENABLED);
  const previewFillEnabled = getInputElement(DOM_IDS.PREVIEW_FILL_ENABLED);
  const mathModeEnabled = getInputElement(DOM_IDS.MATH_MODE_ENABLED);

  fontSizeInput.addEventListener("input", () => {
    const fontSize = getFontSize();
    storeValue(STORAGE_KEYS.FONT_SIZE, fontSize);
    refreshTypstEditorContext();
    schedulePreviewUpdate();
  });

  fillColorInput.addEventListener("input", () => {
    const fillColor = getFillColor();
    storeValue(STORAGE_KEYS.FILL_COLOR, fillColor);
    schedulePreviewUpdate(0);
  });

  fillColorEnabled.addEventListener("change", () => {
    const fillColor = getFillColor();
    const colorInput = getInputElement(DOM_IDS.FILL_COLOR);
    colorInput.disabled = !fillColorEnabled.checked;
    syncPreviewFillToggleState(fillColorEnabled.checked);
    storeValue(STORAGE_KEYS.FILL_COLOR, fillColor || FILL_COLOR_DISABLED);
    schedulePreviewUpdate(0);
  });

  previewFillEnabled.addEventListener("change", () => {
    storeValue(STORAGE_KEYS.PREVIEW_FILL, previewFillEnabled.checked.toString());
    schedulePreviewUpdate(0);
  });

  mathModeEnabled.addEventListener("change", () => {
    const mathMode = getMathModeEnabled();
    if (!lastTypstShapeId) {
      storeValue(STORAGE_KEYS.MATH_MODE, mathMode.toString());
    }
    updateMathModeVisuals();
    refreshTypstEditorContext();
    schedulePreviewUpdate(0);
  });

  syncPreviewFillToggleState(fillColorEnabled.checked);
  updateMathModeVisuals();
}

/**
 * 当用户启用固定填充色时，预览区不再保留 Typst 原始颜色。
 */
function syncPreviewFillToggleState(isFillEnabled: boolean) {
  const previewFillEnabled = getInputElement(DOM_IDS.PREVIEW_FILL_ENABLED);

  if (isFillEnabled) {
    previewFillEnabled.checked = false;
    previewFillEnabled.disabled = true;
    storeValue(STORAGE_KEYS.PREVIEW_FILL, "false");
    return;
  }

  previewFillEnabled.disabled = false;
}

/**
 * 根据当前填充色勾选状态同步预览开关。
 */
export function syncPreviewFillToggleFromFillCheckbox() {
  const fillColorEnabled = getInputElement(DOM_IDS.FILL_COLOR_ENABLED);
  syncPreviewFillToggleState(fillColorEnabled.checked);
}

/**
 * 从本地存储恢复数学模式。
 */
export function restoreMathModeFromStorage() {
  const savedMathMode = getStoredValue(STORAGE_KEYS.MATH_MODE);
  if (savedMathMode !== null) {
    setMathModeEnabled(savedMathMode === "true");
    updateMathModeVisuals();
    refreshTypstEditorContext();
    schedulePreviewUpdate(0);
  }
}

/**
 * 根据数学模式切换输入区的视觉状态。
 */
export function updateMathModeVisuals() {
  const mathMode = getMathModeEnabled();
  const inputWrapper = getHTMLElement(DOM_IDS.INPUT_WRAPPER);
  const editorHelpText = getHTMLElement(DOM_IDS.EDITOR_HELP_TEXT);

  if (mathMode) {
    inputWrapper.classList.remove("math-mode-disabled");
    editorHelpText.textContent = "输入 Typst 公式，例如 a^2 + b^2 = c^2";
  } else {
    inputWrapper.classList.add("math-mode-disabled");
    editorHelpText.textContent = "输入完整 Typst 内容，例如 $ a^2 + b^2 = c^2 $";
  }
}

/**
 * 用本地 Typst 结果刷新预览区。
 */
export async function updatePreview() {
  const taskId = ++latestPreviewTaskId;
  const rawCode = getTypstCode().trim();
  const fontSize = getFontSize();
  const mathMode = getMathModeEnabled();
  const previewElement = getHTMLElement(DOM_IDS.PREVIEW_CONTENT);
  const diagnosticsContainer = getHTMLElement(DOM_IDS.DIAGNOSTICS_CONTAINER);
  const diagnosticsContent = getHTMLElement(DOM_IDS.DIAGNOSTICS_CONTENT);

  if (!rawCode) {
    renderPreviewPlaceholder(previewElement, "等待输入", "写入 Typst 内容后，这里会自动出现本地编译结果。");
    diagnosticsContainer.hidden = true;
    setPreviewState("预览待输入", "输入 Typst 内容后会自动刷新本地编译预览。", "neutral");
    return;
  }

  setPreviewState("正在编译", "正在调用本地 Typst 编译当前内容。", "neutral");
  const result = await typst(rawCode, fontSize, mathMode);
  if (taskId !== latestPreviewTaskId) {
    return;
  }

  const health = getTypstHealth();
  setTypstServiceState(health.message, health.available);

  if (result.diagnostics && result.diagnostics.length > 0) {
    diagnosticsContainer.hidden = false;
    renderDiagnostics(result.diagnostics, diagnosticsContent, mathMode);
  } else {
    diagnosticsContainer.hidden = true;
  }

  if (!result.svg) {
    renderPreviewPlaceholder(previewElement, "预览暂不可用", "请先根据下方诊断修正内容，编译通过后会自动恢复。");
    setPreviewState("编译失败", "本地 Typst 没有产出可显示的 SVG，请先修正诊断。", "error");
    return;
  }

  const { svgElement: processedSvg } = parseAndApplySize(result.svg);
  previewElement.innerHTML = processedSvg.outerHTML;

  const svgElement = previewElement.querySelector("svg");
  if (!svgElement) {
    return;
  }

  svgElement.style.width = "100%";
  svgElement.style.height = "auto";
  svgElement.style.maxHeight = PREVIEW_CONFIG.MAX_HEIGHT;

  const fillColor = getFillColor();
  if (fillColor) {
    applyFillColor(svgElement, fillColor);
    setPreviewState(
      result.diagnostics && result.diagnostics.length > 0 ? "带诊断预览" : "预览已同步",
      result.diagnostics && result.diagnostics.length > 0
        ? "已生成预览，但仍有诊断信息需要处理。"
        : "预览已按统一填充色同步到当前内容。",
      result.diagnostics && result.diagnostics.length > 0 ? "warn" : "ok",
    );
    return;
  }

  const isDarkMode = document.documentElement.classList.contains("dark-mode");
  const previewFill = isDarkMode ? PREVIEW_CONFIG.DARK_MODE_FILL : PREVIEW_CONFIG.LIGHT_MODE_FILL;
  const shouldKeepTypstFill = getInputElement(DOM_IDS.PREVIEW_FILL_ENABLED).checked;
  if (!shouldKeepTypstFill) {
    applyFillColor(svgElement, previewFill);
  }

  setPreviewState(
    result.diagnostics && result.diagnostics.length > 0 ? "带诊断预览" : "预览已同步",
    result.diagnostics && result.diagnostics.length > 0
      ? "已生成预览，但仍有诊断信息需要处理。"
      : shouldKeepTypstFill
        ? "预览已按 Typst 原始配色同步。"
        : "预览已按当前主题配色同步。",
    result.diagnostics && result.diagnostics.length > 0 ? "warn" : "ok",
  );
}

/**
 * 根据输入内容决定主按钮是否可点击。
 */
export function updateButtonState() {
  const rawCode = getTypstCode().trim();
  setButtonEnabled(rawCode.length > 0);
}

/**
 * 在预览区渲染统一的空态/失败占位。
 */
function renderPreviewPlaceholder(container: HTMLElement, title: string, description: string) {
  container.innerHTML = `
    <div class="preview-placeholder">
      <strong>${title}</strong>
      <span>${description}</span>
    </div>
  `;
}
