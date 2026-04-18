import { BRIDGE_CONFIG } from "../constants.js";
import type { BridgeHealth } from "./protocol.js";
import { TINYMIST_CONNECT_TIMEOUT_MS } from "./protocol.js";

/**
 * 使用桥接服务查询 Tinymist 是否可用。
 */
export async function readTinymistHealth(): Promise<BridgeHealth> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => {
    controller.abort();
  }, TINYMIST_CONNECT_TIMEOUT_MS);

  try {
    const response = await fetch(`${BRIDGE_CONFIG.BASE_URL}/tinymist-health`, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        available: false,
        message: "Tinymist 服务响应异常。",
      };
    }

    return await response.json() as BridgeHealth;
  } catch (error) {
    return {
      ok: false,
      available: false,
      message: error instanceof Error
        ? `无法连接本地 Tinymist 服务：${error.message}`
        : "无法连接本地 Tinymist 服务。",
    };
  } finally {
    window.clearTimeout(timer);
  }
}
