import { FILL_COLOR_DISABLED, SHAPE_CONFIG, DEFAULTS } from "./constants.js";
import {
  updatePreview,
  updateButtonState,
  restoreMathModeFromStorage,
  updateMathModeVisuals,
  syncPreviewFillToggleFromFillCheckbox,
} from "./preview.js";
import { extractTypstCode, isTypstPayload } from "./payload.js";
import { readShapeTag, setLastTypstId } from "./shape.js";
import {
  setButtonText,
  setFillColor,
  setFontSize,
  setMathModeEnabled,
  setStatus,
  setTypstCode,
  setBulkUpdateButtonVisible,
  setFileButtonText,
  setWorkspaceMode,
} from "./ui.js";
import { debug } from "./utils/logger.js";

/**
 * 响应 PowerPoint 里的选区变化。
 */
export async function handleSelectionChange() {
  await PowerPoint.run(async (context) => {
    const shapes = context.presentation.getSelectedShapes();
    const slides = context.presentation.getSelectedSlides();
    shapes.load("items");
    slides.load("items/id");
    await context.sync();

    if (shapes.items.length > 0) {
      shapes.items.forEach(shape => shape.load(["id", "altTextDescription"]));
      await context.sync();
    }

    if (shapes.items.length === 0) {
      setLastTypstId(null);
      setButtonText(false);
      setBulkUpdateButtonVisible(false);
      setFileButtonText(false);
      setWorkspaceMode("新建模式", "未选中 Typst 对象，插入会创建新的图形。");
      restoreMathModeFromStorage();
      return;
    }

    const typstShapes = shapes.items.filter(shape => isTypstPayload(shape.altTextDescription));

    if (typstShapes.length > 1) {
      setBulkUpdateButtonVisible(true);
      setButtonText(false);
      setFileButtonText(false);
      setLastTypstId(null);
      setWorkspaceMode("批量模式", "已选中多个 Typst 对象，可使用“批量改字号”统一调整。", "warn");
      restoreMathModeFromStorage();
      setStatus("已选择多个 Typst 对象。主按钮不会更新任何对象，请改用“批量改字号”。");
      return;
    }

    if (typstShapes.length === 1) {
      const typstShape = typstShapes[0];
      typstShape.load(["id", "altTextDescription", "left", "top", "width", "height", "rotation", "tags"]);
      await context.sync();
      const slideId = slides.items.length > 0 ? slides.items[0].id : null;
      await loadTypstShape(typstShape, slideId, context);
      setButtonText(true);
      setFileButtonText(true);
      setBulkUpdateButtonVisible(false);
      setWorkspaceMode("更新模式", "已载入选中的 Typst 对象，主按钮会直接更新它。", "ok");
      return;
    }

    setLastTypstId(null);
    setButtonText(false);
    setFileButtonText(false);
    setBulkUpdateButtonVisible(false);
    setWorkspaceMode("新建模式", "当前选中的不是 Typst 对象，插入会创建新的图形。");
    restoreMathModeFromStorage();
  });
}

/**
 * 把当前选中的 Typst 对象加载到任务窗格中。
 */
async function loadTypstShape(
  typstShape: PowerPoint.Shape,
  slideId: string | null,
  context: PowerPoint.RequestContext,
) {
  try {
    const typstCode = extractTypstCode(typstShape.altTextDescription);
    const storedFontSize = await readShapeTag(typstShape, SHAPE_CONFIG.TAGS.FONT_SIZE, context);
    const storedFillColor = await readShapeTag(typstShape, SHAPE_CONFIG.TAGS.FILL_COLOR, context);
    const storedMathMode = await readShapeTag(typstShape, SHAPE_CONFIG.TAGS.MATH_MODE, context);

    setFontSize(storedFontSize || DEFAULTS.FONT_SIZE);

    const actualColor = await detectFillColor(typstShape, context);
    let fillColorToSet: string | null;
    if (actualColor) {
      fillColorToSet = actualColor;
    } else if (storedFillColor === FILL_COLOR_DISABLED || !storedFillColor) {
      fillColorToSet = null;
    } else {
      fillColorToSet = storedFillColor;
    }

    setFillColor(fillColorToSet);
    syncPreviewFillToggleFromFillCheckbox();
    setTypstCode(typstCode);
    setMathModeEnabled(storedMathMode === "true");
    updateMathModeVisuals();
    setLastTypstId({ slideId, shapeId: typstShape.id });

    updateButtonState();
    void updatePreview();
  } catch (error) {
    console.error("Decode error:", error);
    setStatus("读取选中对象里的 Typst 元数据失败。", true);
  }
}

/**
 * 读取图形当前的实际填充色。
 *
 * Office API 在主题色场景下仍有已知问题，因此这里只把读取失败当作回退分支。
 */
async function detectFillColor(
  shape: PowerPoint.Shape,
  context: PowerPoint.RequestContext,
): Promise<string | null> {
  try {
    shape.fill.load(["foregroundColor"]);
    await context.sync();
    return shape.fill.foregroundColor;
  } catch (error) {
    debug("Could not extract fill color from shape fill property:", error);
    return null;
  }
}
