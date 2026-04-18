import { FILL_COLOR_DISABLED, SHAPE_CONFIG, STORAGE_KEYS } from "./constants.js";
import { extractTypstCode, isTypstPayload } from "./payload.js";
import { readShapeTag } from "./shape.js";
import { storeValue } from "./utils/storage.js";
import { debug } from "./utils/logger.js";
import { getFillColor, getFontSize, getMathModeEnabled, getTypstCode, setStatus } from "./ui.js";
import { buildCompileFailureStatus, prepareTypstSvg } from "./insertion/compile.js";
import {
  calcShapeTopLeftToBeCentered,
  calculateCenteredPosition,
  clampPositionWithinSlide,
  fitSizeWithinSlide,
} from "./insertion/geometry.js";
import { findTypstShape, insertSvgAndTag } from "./insertion/shape-ops.js";
import type { SlideSize } from "./insertion/types.js";

/**
 * 把当前输入内容插入到 PowerPoint，或更新当前选中的单个 Typst 对象。
 */
export async function insertOrUpdateFormula() {
  const rawCode = getTypstCode();
  const fontSize = getFontSize();
  const fillColor = getFillColor();
  const mathMode = getMathModeEnabled();
  storeValue(STORAGE_KEYS.FONT_SIZE, fontSize);
  storeValue(STORAGE_KEYS.FILL_COLOR, fillColor);

  const prepared = await prepareTypstSvg(rawCode, fontSize, fillColor, mathMode);
  if (!prepared) {
    setStatus(buildCompileFailureStatus(), true);
    return;
  }

  try {
    await PowerPoint.run(async (context) => {
      const selection = context.presentation.getSelectedShapes();
      const selectedSlides = context.presentation.getSelectedSlides();
      const allSlides = context.presentation.slides;
      const pageSetup = context.presentation.pageSetup;

      selection.load("items");
      selectedSlides.load("items/id");
      allSlides.load("items/id");
      pageSetup.load(["slideWidth", "slideHeight"]);
      await context.sync();

      if (selection.items.length > 0) {
        selection.items.forEach((shape) => {
          shape.load(["id", "altTextDescription"]);
        });
        await context.sync();
      }

      const selectedTypstShapes = selection.items.filter(shape =>
        isTypstPayload(shape.altTextDescription),
      );
      if (selectedTypstShapes.length > 1) {
        setStatus("当前选中了多个 Typst 对象，请改用“批量改字号”，或只保留一个对象后再更新。", true);
        return;
      }

      const slideSize: SlideSize = {
        width: pageSetup.slideWidth,
        height: pageSetup.slideHeight,
      };
      const fittedSize = fitSizeWithinSlide(prepared.size, slideSize);

      const locatedTypstShape = await findTypstShape(
        selection.items,
        selectedSlides.items.map(slide => slide.id),
        allSlides.items,
        context,
      );

      const hasSelectedSlides = selectedSlides.items.length > 0;
      const hasAnySlides = allSlides.items.length > 0;
      if (!locatedTypstShape && !hasSelectedSlides && !hasAnySlides) {
        setStatus("没有可用的幻灯片用于插入内容。", true);
        return;
      }

      const fallbackSlide = hasSelectedSlides ? selectedSlides.items[0] : allSlides.items[0];
      const targetSlide = locatedTypstShape?.slide || fallbackSlide;

      if (locatedTypstShape) {
        locatedTypstShape.shape.load(["left", "top", "width", "height", "rotation"]);
      }
      targetSlide.load(["id", "shapes/items/id"]);
      await context.sync();

      const replacingShape = locatedTypstShape?.shape;
      const position = replacingShape
        ? clampPositionWithinSlide(
            calculateCenteredPosition(replacingShape, fittedSize),
            fittedSize,
            slideSize,
          )
        : calcShapeTopLeftToBeCentered(fittedSize, slideSize);
      const rotation = replacingShape?.rotation;

      const existingShapeIds = new Set(targetSlide.shapes.items.map(shape => shape.id));
      const insertedShape = await insertSvgAndTag(prepared.svg, {
        payload: prepared.payload,
        fontSize,
        fillColor: fillColor || null,
        mathMode,
        position,
        size: fittedSize,
        rotation,
      }, targetSlide.id, existingShapeIds);

      if (!insertedShape) {
        setStatus("插入 SVG 失败，旧内容已保留。", true);
        return;
      }

      if (replacingShape) {
        replacingShape.delete();
        await context.sync();
        setStatus("已更新 Typst 图形。");
        return;
      }

      setStatus("已插入 Typst 图形。");
    });
  } catch (error) {
    console.error("PowerPoint context error:", error);
    setStatus("PowerPoint API 调用失败，请查看控制台。", true);
  }
}

/**
 * 批量更新当前选中 Typst 对象的字号。
 */
export async function bulkUpdateFontSize() {
  const newFontSize = getFontSize();
  storeValue(STORAGE_KEYS.FONT_SIZE, newFontSize);

  try {
    await PowerPoint.run(async (context) => {
      const selection = context.presentation.getSelectedShapes();
      selection.load("items");
      await context.sync();

      if (selection.items.length > 0) {
        selection.items.forEach((shape) => {
          shape.load(["id", "altTextDescription", "left", "top", "width", "height", "rotation"]);
        });
        await context.sync();
      }

      const typstShapes = selection.items.filter(shape =>
        isTypstPayload(shape.altTextDescription),
      );
      if (typstShapes.length === 0) {
        setStatus("当前没有选中 Typst 对象。", true);
        return;
      }

      const pageSetup = context.presentation.pageSetup;
      pageSetup.load(["slideWidth", "slideHeight"]);
      await context.sync();

      const slideSize: SlideSize = {
        width: pageSetup.slideWidth,
        height: pageSetup.slideHeight,
      };

      let successCount = 0;

      for (const shape of typstShapes) {
        try {
          const typstCode = extractTypstCode(shape.altTextDescription);
          const storedFillColor = await readShapeTag(shape, SHAPE_CONFIG.TAGS.FILL_COLOR, context);
          const storedMathMode = await readShapeTag(shape, SHAPE_CONFIG.TAGS.MATH_MODE, context);
          const fillColor = !storedFillColor || storedFillColor === FILL_COLOR_DISABLED
            ? null
            : storedFillColor;
          const mathMode = storedMathMode === "true";

          const prepared = await prepareTypstSvg(typstCode, newFontSize, fillColor, mathMode);
          if (!prepared) {
            debug(`Typst compile failed for shape ${shape.id}`);
            continue;
          }

          const fittedSize = fitSizeWithinSlide(prepared.size, slideSize);
          const position = clampPositionWithinSlide(
            calculateCenteredPosition(shape, fittedSize),
            fittedSize,
            slideSize,
          );

          const parentSlide = shape.getParentSlide();
          parentSlide.load("id");
          parentSlide.shapes.load("items/id");
          await context.sync();

          const existingShapeIds = new Set(parentSlide.shapes.items.map((item: PowerPoint.Shape) => item.id));
          const insertedShape = await insertSvgAndTag(prepared.svg, {
            payload: prepared.payload,
            fontSize: newFontSize,
            fillColor,
            mathMode,
            position,
            size: fittedSize,
            rotation: shape.rotation,
          }, parentSlide.id, existingShapeIds);

          if (!insertedShape) {
            continue;
          }

          shape.delete();
          await context.sync();
          successCount++;
        } catch (error) {
          debug(`Error updating shape ${shape.id}:`, error);
        }
      }

      setStatus(`已更新 ${successCount.toString()} / ${typstShapes.length.toString()} 个 Typst 对象的字号。`);
    });
  } catch (error) {
    console.error("Bulk update error:", error);
    setStatus("批量更新失败，请查看控制台。", true);
  }
}
