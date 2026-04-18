/**
 * 文件处理主流程与对外导出方法。
 */

import { insertOrUpdateFormula } from "../insertion.js";
import { setStatus, setTypstCode, getMathModeEnabled, setMathModeEnabled } from "../ui.js";
import { getFileHandle, getSelectedFile, clearFileState } from "./state.js";
import { showFilePickerError, hideFileUI } from "./ui.js";

/**
 * 根据当前选中的文件生成或更新图形。
 */
export async function handleGenerateFromFile(): Promise<void> {
  const fileHandle = getFileHandle();
  const selectedFile = getSelectedFile();

  if (!fileHandle && !selectedFile) {
    setStatus("请先选择一个文件。", true);
    return;
  }

  try {
    let content: string;
    let fileName: string;

    if (fileHandle) {
      const file = await fileHandle.getFile();
      content = await file.text();
      fileName = file.name;
    } else if (selectedFile) {
      content = await selectedFile.text();
      fileName = selectedFile.name;
    } else {
      console.error("没有可用的文件对象或句柄，这里本不应该发生。");
      return;
    }

    setTypstCode(content);
    setStatus(`已载入文件内容：${fileName}`);

    // 从文件生成时，通常文件内部已经自己写好了数学分隔符，
    // 所以这里临时关闭“仅公式模式”，避免重复包裹 `$`。
    const previousMathMode = getMathModeEnabled();
    setMathModeEnabled(false);
    try {
      await insertOrUpdateFormula();
    } finally {
      // 恢复用户原本的数学模式设置。
      setMathModeEnabled(previousMathMode);
    }
  } catch (error) {
    console.error(error);
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    let statusMsg = `读取文件失败：${error}`;

    if (error instanceof DOMException) {
      if (error.name === "NotReadableError") {
        if ("showOpenFilePicker" in window) {
          // 浏览器支持文件系统接口，但读取仍失败，通常需要重新授权。
          statusMsg = "无法读取该文件，请重新选择一次。";
        } else {
          // 当前环境不支持 File System Access API，例如部分 macOS WebView。
          statusMsg = "磁盘上的文件变更后无法自动重新读取，请重新选择一次。"
            + "（这通常是因为当前环境不支持 File System Access API。）";
        }
      } else if (error.name === "NotFoundError") {
        statusMsg = "磁盘上已经找不到这个文件了，请重新选择。";
      }
    }
    setStatus(statusMsg, true);

    clearFileState();
    hideFileUI();
  }
}

/**
 * 供功能区按钮调用的“从文件生成”入口。
 *
 * 这个方法在 `manifest.xml` 里注册为 FunctionFile 命令。
 */
export async function generateFromFile(event: Office.AddinCommands.Event): Promise<void> {
  try {
    const fileHandle = getFileHandle();
    const selectedFile = getSelectedFile();

    if (!fileHandle && !selectedFile) {
      await Office.addin.showAsTaskpane();
      showFilePickerError();
    } else {
      await handleGenerateFromFile();
    }

    event.completed();
  } catch (error) {
    console.error("执行从文件生成命令时出错：", error);
    event.completed();
  }
}
