import type { SlideSize } from "./types.js";

/**
 * 让新图形保持旧图形的中心点。
 */
export function calculateCenteredPosition(
  oldShape: { left: number; top: number; width: number; height: number },
  newSize: { width: number; height: number },
): { left: number; top: number } {
  const centerX = oldShape.left + oldShape.width / 2;
  const centerY = oldShape.top + oldShape.height / 2;
  return {
    left: centerX - newSize.width / 2,
    top: centerY - newSize.height / 2,
  };
}

/**
 * 把图形缩放到幻灯片范围内，同时保持宽高比。
 */
export function fitSizeWithinSlide(
  shapeSize: { width: number; height: number },
  slideSize: SlideSize,
): { width: number; height: number } {
  if (shapeSize.width <= 0 || shapeSize.height <= 0) {
    return shapeSize;
  }

  const widthScale = slideSize.width / shapeSize.width;
  const heightScale = slideSize.height / shapeSize.height;
  const scale = Math.min(widthScale, heightScale, 1);

  return {
    width: shapeSize.width * scale,
    height: shapeSize.height * scale,
  };
}

/**
 * 保证图形不会超出幻灯片边界。
 */
export function clampPositionWithinSlide(
  position: { left: number; top: number },
  shapeSize: { width: number; height: number },
  slideSize: SlideSize,
): { left: number; top: number } {
  const maxLeft = Math.max(0, slideSize.width - shapeSize.width);
  const maxTop = Math.max(0, slideSize.height - shapeSize.height);

  return {
    left: Math.min(Math.max(0, position.left), maxLeft),
    top: Math.min(Math.max(0, position.top), maxTop),
  };
}

/**
 * 计算插入新图形时的默认居中位置。
 */
export function calcShapeTopLeftToBeCentered(
  shapeSize: { width: number; height: number },
  slideSize: SlideSize,
) {
  const centerX = (slideSize.width - shapeSize.width) / 2;
  const centerY = (slideSize.height - shapeSize.height) / 2;
  return clampPositionWithinSlide({ left: centerX, top: centerY }, shapeSize, slideSize);
}
