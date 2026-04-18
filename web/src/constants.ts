/**
 * 应用级常量。
 */

/**
 * PowerPoint 图形配置。
 */
export const SHAPE_CONFIG = {
  NAME: "Typst Shape",
  TAGS: {
    FONT_SIZE: "TypstFontSize",
    FILL_COLOR: "TypstFillColor",
    MATH_MODE: "TypstMathMode",
  },
} as const;

/**
 * 填充色的特殊值。
 */
export const FILL_COLOR_DISABLED = "disabled";

/**
 * 界面里会用到的 DOM ID。
 */
export const DOM_IDS = {
  STATUS_BAR: "statusBar",
  STATUS: "status",
  FONT_SIZE: "fontSize",
  FILL_COLOR_ENABLED: "fillColorEnabled",
  FILL_COLOR: "fillColor",
  PREVIEW_FILL_ENABLED: "previewFillEnabled",
  MATH_MODE_ENABLED: "mathModeEnabled",
  INPUT_WRAPPER: "inputWrapper",
  TYPST_INPUT: "typstInput",
  EDITOR_HELP_TEXT: "editorHelpText",
  EDITOR_ASSIST_STATUS: "editorAssistStatus",
  INSERT_BTN: "insertBtn",
  BULK_UPDATE_BTN: "bulkUpdateBtn",
  PREVIEW_CONTENT: "previewContent",
  DARK_MODE_TOGGLE: "darkModeToggle",
  DIAGNOSTICS_CONTAINER: "diagnosticsContainer",
  DIAGNOSTICS_CONTENT: "diagnosticsContent",
  FILE_INPUT: "fileInput",
  GENERATE_FROM_FILE_BTN: "generateFromFileBtn",
  FILE_INFO: "fileInfo",
  FILE_NAME: "fileName",
  DROPZONE_LABEL: "dropzoneLabel",
  THEME_TOGGLE_BTN: "themeToggleBtn",
  ABOUT_LINK: "aboutLink",
  ABOUT_MODAL: "aboutModal",
  ABOUT_MODAL_CLOSE: "aboutModalClose",
  WORKSPACE_MODE_VALUE: "workspaceModeValue",
  WORKSPACE_MODE_HINT: "workspaceModeHint",
  TYPST_SERVICE_STATUS: "typstServiceStatus",
  ASSIST_SERVICE_STATUS: "assistServiceStatus",
  PREVIEW_STATE_STATUS: "previewStateStatus",
  PREVIEW_META: "previewMeta",
} as const;

/**
 * 本地存储键名。
 */
export const STORAGE_KEYS = {
  FONT_SIZE: "typstFontSize",
  FILL_COLOR: "typstFillColor",
  PREVIEW_FILL: "typstPreviewFill",
  MATH_MODE: "typstMathMode",
  THEME: "typstTheme",
} as const;

/**
 * 本地 Typst 桥接服务配置。
 */
export const BRIDGE_CONFIG = {
  BASE_URL: "http://127.0.0.1:23627",
  REQUEST_TIMEOUT_MS: 15000,
  PREVIEW_DEBOUNCE_MS: 180,
} as const;

/**
 * SVG 处理常量。
 */
export const SVG_CONFIG = {
  PADDING_RATIO: 0.04,
  FALLBACK_WIDTH: 400,
  FALLBACK_HEIGHT: 250,
} as const;

/**
 * 主题值。
 */
export const THEMES = {
  DARK: "dark",
  LIGHT: "light",
} as const;

/**
 * 预览区配置。
 */
export const PREVIEW_CONFIG = {
  MAX_HEIGHT: "320px",
  DARK_MODE_FILL: "#ffffff",
  LIGHT_MODE_FILL: "#000000",
} as const;

/**
 * 按钮文案。
 */
export const BUTTON_TEXT = {
  INSERT: "插入图形",
  UPDATE: "更新图形",
  INSERT_SHORTCUT: "Ctrl+Enter",
  GENERATE_FROM_FILE: "从文件生成",
  UPDATE_FROM_FILE: "从文件更新",
} as const;

/**
 * 默认值。
 */
export const DEFAULTS = {
  FONT_SIZE: "28",
  FILL_COLOR: "#000000",
} as const;
