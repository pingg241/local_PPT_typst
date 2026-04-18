import { isTypstPayload } from "../payload.js";
import { lastTypstShapeId, writeShapeProperties, type TypstShapeInfo } from "../shape.js";
import { debug } from "../utils/logger.js";
import type { LocatedTypstShape } from "./types.js";

/**
 * 插入 SVG 并写入 Typst 元数据。
 */
export async function insertSvgAndTag(
  svg: string,
  info: TypstShapeInfo,
  targetSlideId: string,
  existingShapeIds: Set<string>,
): Promise<PowerPoint.Shape | null> {
  return new Promise<PowerPoint.Shape | null>((resolve) => {
    Office.context.document.setSelectedDataAsync(
      svg,
      { coercionType: Office.CoercionType.XmlSvg },
      (result) => {
        if (result.status !== Office.AsyncResultStatus.Succeeded) {
          console.error("Insert failed:", result.error);
          resolve(null);
          return;
        }

        void PowerPoint.run(async (context) => {
          const shapeToTag = await findInsertedShape(targetSlideId, existingShapeIds, context);
          if (!shapeToTag) {
            console.warn("No shape found after insertion; cannot tag Typst payload.");
            resolve(null);
            return;
          }

          await writeShapeProperties(shapeToTag, info, context);
          resolve(shapeToTag);
        }).catch((error: unknown) => {
          console.error("Tagging inserted shape failed:", error);
          resolve(null);
        });
      },
    );
  });
}

/**
 * 查找当前真正要被更新的 Typst 对象。
 */
export async function findTypstShape(
  selectedShapes: PowerPoint.Shape[],
  selectedSlideIds: string[],
  allSlides: PowerPoint.Slide[],
  context: PowerPoint.RequestContext,
): Promise<LocatedTypstShape | undefined> {
  const typstShape = selectedShapes.find(shape => isTypstPayload(shape.altTextDescription));
  if (typstShape) {
    const selectedSlide = allSlides.find(slide => slide.id === selectedSlideIds[0]);
    if (!selectedSlide || selectedSlide.isNullObject) {
      return undefined;
    }

    return {
      shape: typstShape,
      slide: selectedSlide,
    };
  }

  const cachedShapeId = lastTypstShapeId;
  if (!cachedShapeId?.slideId) {
    return undefined;
  }

  try {
    const targetSlide = allSlides.find(slide => slide.id === cachedShapeId.slideId);
    if (!targetSlide || targetSlide.isNullObject) {
      return undefined;
    }

    targetSlide.shapes.load("items/id");
    await context.sync();

    const shape = targetSlide.shapes.items.find(item => item.id === cachedShapeId.shapeId);
    if (!shape) {
      return undefined;
    }

    return {
      shape,
      slide: targetSlide,
    };
  } catch (error) {
    debug("Fallback to last selection failed:", error);
    return undefined;
  }
}

/**
 * 在插入完成后定位新建出来的 SVG 图形。
 */
export async function findInsertedShape(
  slideId: string,
  existingShapeIds: Set<string>,
  context: PowerPoint.RequestContext,
): Promise<PowerPoint.Shape | null> {
  try {
    const slide = context.presentation.slides.getItem(slideId);
    slide.shapes.load("items/id");
    await context.sync();

    const newShapes = slide.shapes.items.filter(shape => !existingShapeIds.has(shape.id));
    if (newShapes.length > 0) {
      return newShapes[newShapes.length - 1];
    }

    if (slide.shapes.items.length > 0) {
      return slide.shapes.items[slide.shapes.items.length - 1];
    }
  } catch (error) {
    debug("Shape diff fallback failed:", error);
  }

  const postShapes = context.presentation.getSelectedShapes();
  postShapes.load("items");
  await context.sync();

  return postShapes.items.length > 0 ? postShapes.items[postShapes.items.length - 1] : null;
}
