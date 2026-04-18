/**
 * 文件导入相关的界面更新逻辑。
 */

import { DOM_IDS } from "../constants.js";
import { getButtonElement, getHTMLElement } from "../utils/dom.js";
import { setStatus, setFileButtonText } from "../ui.js";

/**
 * 把已选文件信息同步到界面。
 *
 * @param file 当前文件
 * @param isEditingExistingFormula 当前是否处于更新已有公式的状态
 */
export function updateFileUI(file: File, isEditingExistingFormula: boolean): void {
  const generateBtn = getButtonElement(DOM_IDS.GENERATE_FROM_FILE_BTN);
  generateBtn.hidden = false;

  const fileInfo = getHTMLElement(DOM_IDS.FILE_INFO);
  fileInfo.hidden = false;
  fileInfo.classList.add("show");

  const fileName = getHTMLElement(DOM_IDS.FILE_NAME);
  fileName.textContent = file.name;

  const dropzoneLabel = getHTMLElement(DOM_IDS.DROPZONE_LABEL);
  dropzoneLabel.style.borderColor = "";

  setFileButtonText(isEditingExistingFormula);
}

/**
 * 在未选择文件时显示错误态。
 */
export function showFilePickerError(): void {
  const dropzoneLabel = getHTMLElement(DOM_IDS.DROPZONE_LABEL);
  dropzoneLabel.style.borderColor = "var(--error-color)";
  setStatus("请先选择一个文件。", true);
}

/**
 * 隐藏文件信息区域。
 */
export function hideFileUI(): void {
  getButtonElement(DOM_IDS.GENERATE_FROM_FILE_BTN).hidden = true;
  const fileInfo = getHTMLElement(DOM_IDS.FILE_INFO);
  fileInfo.hidden = true;
  fileInfo.classList.remove("show");
}
