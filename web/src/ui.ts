import { DOM_IDS, DEFAULTS, BUTTON_TEXT, STORAGE_KEYS, FILL_COLOR_DISABLED } from "./constants.js";
import { getInputElement, getHTMLElement, getButtonElement } from "./utils/dom.js";
import { insertOrUpdateFormula, bulkUpdateFontSize } from "./insertion.js";
import { getStoredValue } from "./utils/storage.js";
import { handleGenerateFromFile } from "./file/file.js";
import { getTypstEditorValue, refreshTypstEditorContext, setTypstEditorValue } from "./editor.js";

type Tone = "neutral" | "ok" | "warn" | "error";

/**
 * Initializes the UI state.
 */
export function initializeUIState() {
  const savedFontSize = getStoredValue(STORAGE_KEYS.FONT_SIZE);
  if (savedFontSize) {
    setFontSize(savedFontSize);
  }

  const savedFillColor = getStoredValue(STORAGE_KEYS.FILL_COLOR);
  if (savedFillColor) {
    setFillColor(savedFillColor === FILL_COLOR_DISABLED ? null : savedFillColor);
  }

  const savedMathMode = getStoredValue(STORAGE_KEYS.MATH_MODE);
  if (savedMathMode !== null) {
    setMathModeEnabled(savedMathMode === "true");
  }

  const savedPreviewFill = getStoredValue(STORAGE_KEYS.PREVIEW_FILL);
  if (savedPreviewFill !== null) {
    setPreviewFillEnabled(savedPreviewFill === "true");
  }

  setWorkspaceMode(
    "新建模式",
    "未选中 Typst 对象，插入会创建新的图形。",
    "neutral",
  );
  setTypstServiceState("正在检测本地 Typst 服务。", false, "neutral");
  setAssistServiceState("智能补全初始化中...", false, "neutral");
  setPreviewState("预览待输入", "输入 Typst 内容后会自动刷新本地编译预览。", "neutral");
}

/**
 * Sets up event listeners for UI interactions.
 */
export function setupEventListeners() {
  const insertButton = getButtonElement(DOM_IDS.INSERT_BTN);
  insertButton.onclick = insertOrUpdateFormula;

  const bulkUpdateButton = getButtonElement(DOM_IDS.BULK_UPDATE_BTN);
  bulkUpdateButton.onclick = bulkUpdateFontSize;

  const handleCtrlEnter = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      void insertOrUpdateFormula();
    }
  };

  const fontSizeInput = getInputElement(DOM_IDS.FONT_SIZE);
  fontSizeInput.addEventListener("keydown", handleCtrlEnter);

  const generateFromFileBtn = getButtonElement(DOM_IDS.GENERATE_FROM_FILE_BTN);
  generateFromFileBtn.onclick = handleGenerateFromFile;
}

/**
 * Sets the status message in the UI.
 */
export function setStatus(message: string, isError = false) {
  const statusElement = getHTMLElement(DOM_IDS.STATUS);
  const statusBar = getHTMLElement(DOM_IDS.STATUS_BAR);
  statusElement.textContent = message || "";
  statusElement.classList.toggle("error", isError);
  statusBar.dataset.tone = isError ? "error" : "neutral";
}

/**
 * @returns the current font size from the UI
 */
export function getFontSize(): string {
  return getInputElement(DOM_IDS.FONT_SIZE).value;
}

/**
 * Sets the font size in the UI.
 */
export function setFontSize(fontSize: string) {
  getInputElement(DOM_IDS.FONT_SIZE).value = fontSize;
  refreshTypstEditorContext();
}

/**
 * @returns Fill color value or empty string if disabled
 */
export function getFillColor(): string {
  const checkbox = getInputElement(DOM_IDS.FILL_COLOR_ENABLED);
  const enabled = checkbox.checked;
  if (!enabled) return "";

  const fillColorInput = getInputElement(DOM_IDS.FILL_COLOR);
  return fillColorInput.value || DEFAULTS.FILL_COLOR;
}

/**
 * @returns whether preview should keep Typst's own fill colors.
 */
export function getPreviewFillEnabled(): boolean {
  const checkbox = getInputElement(DOM_IDS.PREVIEW_FILL_ENABLED);
  return checkbox.checked;
}

/**
 * Sets whether preview should keep Typst's own fill colors.
 */
export function setPreviewFillEnabled(enabled: boolean) {
  const checkbox = getInputElement(DOM_IDS.PREVIEW_FILL_ENABLED);
  checkbox.checked = enabled;
}

/**
 * Sets the fill color in the UI.
 *
 * @param color Fill color to set, or null to disable
 */
export function setFillColor(color: string | null) {
  const fillColorInput = getInputElement(DOM_IDS.FILL_COLOR);
  const checkbox = getInputElement(DOM_IDS.FILL_COLOR_ENABLED);

  if (color) {
    checkbox.checked = true;
    fillColorInput.value = color;
    fillColorInput.disabled = false;
  } else {
    checkbox.checked = false;
    fillColorInput.disabled = true;
  }
}

/**
 * @returns Typst source code from the UI input
 */
export function getTypstCode(): string {
  return getTypstEditorValue();
}

/**
 * Sets the Typst code in the UI input.
 */
export function setTypstCode(typstCode: string) {
  setTypstEditorValue(typstCode);
}

/**
 * Updates the button text based on whether a Typst shape is selected.
 */
export function setButtonText(isEditingExistingFormula: boolean) {
  const button = getButtonElement(DOM_IDS.INSERT_BTN);
  const label = isEditingExistingFormula ? BUTTON_TEXT.UPDATE : BUTTON_TEXT.INSERT;
  button.innerHTML = `
    <span class="primary-btn-label">${label}</span>
    <span class="primary-btn-shortcut" aria-hidden="true">${BUTTON_TEXT.INSERT_SHORTCUT}</span>
  `;
  button.setAttribute("aria-label", `${label}，快捷键 ${BUTTON_TEXT.INSERT_SHORTCUT}`);

  if (isEditingExistingFormula) {
    button.classList.add("update-mode");
  } else {
    button.classList.remove("update-mode");
  }
}

/**
 * Enables or disables the insert button.
 */
export function setButtonEnabled(enabled: boolean) {
  const button = getHTMLElement(DOM_IDS.INSERT_BTN) as HTMLButtonElement;
  button.disabled = !enabled;
}

/**
 * Shows or hides the bulk update button.
 *
 * This button is used to update the font size of multiple selected Typst shapes.
 */
export function setBulkUpdateButtonVisible(visible: boolean) {
  const button = getButtonElement(DOM_IDS.BULK_UPDATE_BTN);
  button.hidden = !visible;
}

/**
 * @returns Whether math mode is enabled
 */
export function getMathModeEnabled(): boolean {
  const checkbox = getInputElement(DOM_IDS.MATH_MODE_ENABLED);
  return checkbox.checked;
}

/**
 * Sets the math mode enabled state in the UI.
 */
export function setMathModeEnabled(enabled: boolean) {
  const checkbox = getInputElement(DOM_IDS.MATH_MODE_ENABLED);
  checkbox.checked = enabled;
  refreshTypstEditorContext();
}

/**
 * Updates the file button text based on whether a Typst shape is selected.
 */
export function setFileButtonText(isEditingExistingFormula: boolean) {
  const button = getButtonElement(DOM_IDS.GENERATE_FROM_FILE_BTN);
  button.textContent = isEditingExistingFormula ? BUTTON_TEXT.UPDATE_FROM_FILE : BUTTON_TEXT.GENERATE_FROM_FILE;
}

/**
 * 更新顶部的工作模式摘要。
 */
export function setWorkspaceMode(title: string, hint: string, tone: Tone = "neutral") {
  const titleElement = getHTMLElement(DOM_IDS.WORKSPACE_MODE_VALUE);
  const hintElement = getHTMLElement(DOM_IDS.WORKSPACE_MODE_HINT);

  titleElement.textContent = title;
  hintElement.textContent = hint;
  applyTone(titleElement, tone);
}

/**
 * 更新 Typst 服务状态徽标。
 */
export function setTypstServiceState(message: string, available: boolean, tone?: Tone) {
  const resolvedTone = tone || (available ? "ok" : "error");
  const label = resolvedTone === "neutral"
    ? "Typst 待检测"
    : available
      ? "Typst 已连接"
      : "Typst 未连接";
  setChip(DOM_IDS.TYPST_SERVICE_STATUS, label, message, resolvedTone);
}

/**
 * 更新智能补全状态徽标。
 */
export function setAssistServiceState(message: string, isError: boolean, tone?: Tone) {
  let label = "补全可用";
  let resolvedTone = tone || (isError ? "warn" : "ok");

  if (resolvedTone === "neutral" || /初始化/u.test(message) || /正在连接/u.test(message)) {
    label = "补全初始化中";
    resolvedTone = tone || "neutral";
  } else if (isError || /退回基础编辑模式/u.test(message)) {
    label = "基础编辑模式";
  } else if (/已连接/u.test(message)) {
    label = "补全已连接";
  } else if (/连接/u.test(message)) {
    label = "补全连接中";
    resolvedTone = tone || "neutral";
  }

  setChip(DOM_IDS.ASSIST_SERVICE_STATUS, label, message, resolvedTone);
}

/**
 * 更新预览区的状态和辅助说明。
 */
export function setPreviewState(label: string, detail: string, tone: Tone = "neutral") {
  setChip(DOM_IDS.PREVIEW_STATE_STATUS, label, detail, tone);
  const previewMeta = getHTMLElement(DOM_IDS.PREVIEW_META);
  previewMeta.textContent = detail;
}

/**
 * 统一更新状态徽标文字、提示和语义色。
 */
function setChip(id: string, label: string, title: string, tone: Tone) {
  const element = getHTMLElement(id);
  element.textContent = label;
  element.title = title;
  applyTone(element, tone);
}

/**
 * 通过 data-tone 给元素挂上可复用的语义色。
 */
function applyTone(element: HTMLElement, tone: Tone) {
  element.dataset.tone = tone;
}
