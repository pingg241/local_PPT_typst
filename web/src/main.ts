import {
  initializeUIState,
  setAssistServiceState,
  setStatus,
  setTypstServiceState,
  setupEventListeners,
} from "./ui.js";
import { getTypstHealth, initTypst } from "./typst.js";
import { handleTypstSourceChange, setupPreviewListeners, updateButtonState } from "./preview.js";
import { initializeDarkMode, setupDarkModeToggle } from "./theme.js";
import { handleSelectionChange } from "./selection.js";
import { generateFromFile, initializeDropzone } from "./file/file.js";
import { DOM_IDS } from "./constants.js";
import { getHTMLElement } from "./utils/dom.js";
import { getFontSize, getMathModeEnabled } from "./ui.js";
import { insertOrUpdateFormula } from "./insertion.js";
import { initializeTypstEditor } from "./editor.js";

Office.actions.associate("generateFromFile", (event: Office.AddinCommands.Event) => {
  void generateFromFile(event);
});

/**
 * 绑定“关于”弹窗的打开与关闭逻辑。
 */
function setupAboutModal() {
  const aboutLink = getHTMLElement(DOM_IDS.ABOUT_LINK);
  const aboutModal = getHTMLElement(DOM_IDS.ABOUT_MODAL);
  const closeBtn = getHTMLElement(DOM_IDS.ABOUT_MODAL_CLOSE);

  aboutLink.addEventListener("click", (event) => {
    event.preventDefault();
    aboutModal.classList.add("active");
  });

  closeBtn.addEventListener("click", () => {
    aboutModal.classList.remove("active");
  });

  aboutModal.addEventListener("click", (event) => {
    if (event.target === aboutModal) {
      aboutModal.classList.remove("active");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && aboutModal.classList.contains("active")) {
      aboutModal.classList.remove("active");
    }
  });
}

/**
 * 初始化 Office 插件。
 */
await Office.onReady(async (info) => {
  if (info.host !== Office.HostType.PowerPoint) {
    return;
  }

  initializeDarkMode();
  setupDarkModeToggle();
  setupAboutModal();
  const editorInitialization = initializeTypstEditor({
    onSubmit: () => {
      void insertOrUpdateFormula();
    },
    onContentChange: handleTypstSourceChange,
    getDocumentContext: () => ({
      fontSize: getFontSize(),
      mathMode: getMathModeEnabled(),
    }),
    setAssistStatus: (message, isError) => {
      setAssistServiceState(message, isError);
    },
  });
  initializeUIState();
  initializeDropzone();
  setupEventListeners();
  setupPreviewListeners();
  updateButtonState();

  setStatus("正在连接本地 Typst 服务...");
  setTypstServiceState("正在连接本地 Typst 服务...", false, "neutral");
  const healthPromise = initTypst();
  await editorInitialization;
  const health = await healthPromise;
  setTypstServiceState(health.message, health.available);
  setStatus(
    health.available
      ? "本地 Typst 服务已连接，可以开始预览和插入。"
      : health.message,
    !health.available,
  );

  Office.context.document.addHandlerAsync(
    Office.EventType.DocumentSelectionChanged,
    handleSelectionChange,
  );

  await handleSelectionChange();

  const latestHealth = getTypstHealth();
  if (!latestHealth.available) {
    setTypstServiceState(latestHealth.message, latestHealth.available);
    setStatus(`${latestHealth.message} 预览与插入会在服务恢复后自动生效。`, true);
  }
});
