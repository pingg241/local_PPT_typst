/**
 * 预处理后的 SVG 结果。
 */
export type PreparedSvgResult = {
  svg: string;
  size: { width: number; height: number };
  payload: string;
};

/**
 * 幻灯片尺寸。
 */
export type SlideSize = {
  width: number;
  height: number;
};

/**
 * 带所属幻灯片信息的 Typst 图形。
 */
export type LocatedTypstShape = {
  shape: PowerPoint.Shape;
  slide: PowerPoint.Slide;
};
