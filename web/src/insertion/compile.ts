import { createTypstPayload } from "../payload.js";
import { applyFillColor, normalizeAlphaHexColors, parseAndApplySize } from "../svg.js";
import { typst } from "../typst.js";
import type { PreparedSvgResult } from "./types.js";

/**
 * 编译 Typst，并把 SVG 处理成适合插入 PowerPoint 的形式。
 */
export async function prepareTypstSvg(
  typstCode: string,
  fontSize: string,
  fillColor: string | null,
  mathMode: boolean,
): Promise<PreparedSvgResult | null> {
  const result = await typst(typstCode, fontSize, mathMode);
  if (!result.svg) {
    return null;
  }

  const { svgElement, size } = parseAndApplySize(result.svg);
  if (fillColor) {
    applyFillColor(svgElement, fillColor);
  }
  normalizeAlphaHexColors(svgElement);

  const serializer = new XMLSerializer();
  const svg = serializer.serializeToString(svgElement);
  const payload = createTypstPayload(typstCode);

  return { svg, size, payload };
}

/**
 * 编译失败时给状态栏使用的短消息。
 */
export function buildCompileFailureStatus() {
  return "本地 Typst 编译失败，请先查看预览区的诊断信息。";
}
