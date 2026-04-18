import { BRIDGE_CONFIG } from "./constants.js";

export interface CompilationResult {
  svg: string | null;
  diagnostics: Diagnostics;
}

/**
 * 本地桥接服务返回的诊断结构。
 */
export interface DiagnosticMessage {
  package: string;
  path: string;
  severity: string;
  range: string;
  message: string;
}

export type Diagnostics = (string | DiagnosticMessage)[] | undefined;

type BridgeHealth = {
  ok: boolean;
  available: boolean;
  message: string;
};

type CompileResponse = {
  ok: boolean;
  svg: string | null;
  diagnostics: Diagnostics;
};

let lastHealth: BridgeHealth = {
  ok: false,
  available: false,
  message: "尚未连接本地 Typst 服务。",
};

/**
 * 统一发起带超时的本地桥接请求。
 */
async function requestBridge(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => {
    controller.abort();
  }, BRIDGE_CONFIG.REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${BRIDGE_CONFIG.BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 初始化本地 Typst 编译环境。
 */
export async function initTypst(): Promise<BridgeHealth> {
  try {
    const response = await requestBridge("/health", {
      method: "GET",
    });

    if (!response.ok) {
      lastHealth = {
        ok: false,
        available: false,
        message: "本地 Typst 服务响应异常，请先运行 npm run bridge。",
      };
      return lastHealth;
    }

    const health = await response.json() as BridgeHealth;
    lastHealth = health;
    return lastHealth;
  } catch (error) {
    lastHealth = {
      ok: false,
      available: false,
      message: error instanceof Error
        ? `无法连接本地 Typst 服务：${error.message}`
        : "无法连接本地 Typst 服务，请先运行 npm run bridge。",
    };
    return lastHealth;
  }
}

/**
 * 读取最近一次健康检查结果。
 */
export function getTypstHealth() {
  return lastHealth;
}

/**
 * 通过本地 Typst CLI 编译输入内容。
 */
export async function typst(source: string, fontSize: string, mathMode: boolean): Promise<CompilationResult> {
  try {
    const response = await requestBridge("/compile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source,
        fontSize,
        mathMode,
      }),
    });

    const result = await response.json() as CompileResponse;

    if (!response.ok || !result.ok) {
      lastHealth = {
        ok: false,
        available: false,
        message: "本地 Typst 编译失败。",
      };
      return {
        svg: null,
        diagnostics: result.diagnostics && result.diagnostics.length > 0
          ? result.diagnostics
          : ["本地 Typst 编译失败。"],
      };
    }

    lastHealth = {
      ok: true,
      available: true,
      message: "本地 Typst 已连接。",
    };

    return {
      svg: result.svg,
      diagnostics: result.diagnostics,
    };
  } catch (error) {
    lastHealth = {
      ok: false,
      available: false,
      message: "本地 Typst 服务不可用。",
    };

    return {
      svg: null,
      diagnostics: [
        error instanceof Error
          ? `无法连接本地 Typst 服务：${error.message}`
          : "无法连接本地 Typst 服务，请先运行 npm run bridge。",
      ],
    };
  }
}
