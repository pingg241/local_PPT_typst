/**
 * 基于 File System Access API 的文件选择逻辑。
 */

import "./types.js";
import { getHTMLElement } from "../utils/dom.js";
import { setStatus } from "../ui.js";
import { setFileHandle, setSelectedFile } from "./state.js";
import { updateFileUI } from "./ui.js";
import { DOM_IDS } from "../constants.js";
import { lastTypstShapeId } from "../shape.js";

/**
 * 统一处理用户选中的文件，无论来源是文件选择器还是拖放。
 */
export function processFile(file: File, handle?: FileSystemFileHandle): void {
  // 仅允许导入 Typst 源文件或纯文本文件。
  if (!file.name.endsWith(".typ") && !file.name.endsWith(".txt")) {
    setStatus("请选择 `.typ` 或 `.txt` 文件。", true);
    return;
  }

  setFileHandle(handle || null);
  setSelectedFile(file);
  const isEditingExistingFormula = lastTypstShapeId !== null;
  updateFileUI(file, isEditingExistingFormula);
  setStatus(`已选择文件：${file.name}`);
}

/**
 * 打开文件选择器。
 *
 * 如果当前环境不支持 File System Access API，则退回到普通文件输入框。
 */
export async function pickFile(): Promise<void> {
  if (!("showOpenFilePicker" in window)) {
    const fileInput = getHTMLElement(DOM_IDS.FILE_INPUT) as HTMLInputElement;
    fileInput.click();
    return;
  }

  try {
    // 优先使用 File System Access API，这样后续可以直接重新读取磁盘上的同一文件。
    const handles = await window.showOpenFilePicker({
      types: [
        {
          description: "Typst 文件",
          accept: {
            "text/plain": [".typ", ".txt"],
          },
        },
      ],
      multiple: false,
    });

    if (handles.length > 0) {
      const handle = handles[0];
      const file = await handle.getFile();
      processFile(file, handle);
    }
  } catch (error) {
    // 用户取消选择时不提示，其他错误则打印到控制台。
    if ((error as Error).name !== "AbortError") {
      console.error("选择文件时出错：", error);
    }
  }
}

/**
 * 处理普通文件输入框的变更事件。
 */
export function handleFileInputChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = input.files;

  if (files && files.length > 0) {
    processFile(files[0]);
    // 清空值，确保再次选择同一个文件时也会触发 change 事件。
    input.value = "";
  }
}
