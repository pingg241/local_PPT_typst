import { SHAPE_CONFIG, FILL_COLOR_DISABLED } from "./constants.js";
import { debug } from "./utils/logger.js";

export type TypstShapeId = {
  slideId: string | null;
  shapeId: string;
};

export let lastTypstShapeId: TypstShapeId | null;

/**
 * 记录最近一次选中的 Typst 图形，方便在 PowerPoint 选区变化后继续更新。
 */
export function setLastTypstId(info: TypstShapeId | null) {
  lastTypstShapeId = info;
}

export type TypstShapeInfo = {
  payload: string;
  fontSize: string;
  fillColor: string | null;
  mathMode: boolean;
  position?: { left: number; top: number };
  rotation?: number;
  size: { width: number; height: number };
};

/**
 * 把位置、尺寸和 Typst 元数据写回图形。
 */
export async function writeShapeProperties(
  shape: PowerPoint.Shape,
  info: TypstShapeInfo,
  context: PowerPoint.RequestContext,
) {
  shape.altTextDescription = info.payload;
  shape.name = SHAPE_CONFIG.NAME;
  shape.tags.add(SHAPE_CONFIG.TAGS.FONT_SIZE, info.fontSize);
  shape.tags.add(
    SHAPE_CONFIG.TAGS.FILL_COLOR,
    info.fillColor === null ? FILL_COLOR_DISABLED : info.fillColor,
  );
  shape.tags.add(SHAPE_CONFIG.TAGS.MATH_MODE, info.mathMode.toString());

  if (info.size.height > 0 && info.size.width > 0) {
    shape.height = info.size.height;
    shape.width = info.size.width;
  }

  if (info.position) {
    shape.left = info.position.left;
    shape.top = info.position.top;
  }

  if (info.rotation !== undefined) {
    shape.rotation = info.rotation;
  }

  await context.sync();
}

/**
 * 从图形标签中读取指定值。
 */
export async function readShapeTag(
  shape: PowerPoint.Shape,
  tagName: string,
  context: PowerPoint.RequestContext,
): Promise<string | null> {
  try {
    const tag = shape.tags.getItemOrNullObject(tagName);
    tag.load("value");
    await context.sync();
    return tag.isNullObject ? null : tag.value;
  } catch (error) {
    debug(`Error reading tag ${tagName}:`, error);
    return null;
  }
}
