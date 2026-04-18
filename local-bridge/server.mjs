import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

const HOST = process.env.PPTYPST_BRIDGE_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.PPTYPST_BRIDGE_PORT || "23627", 10);
const TYPST_BIN = resolveBinaryFromEnvironment("TYPST_BIN", "typst");
const TINYMIST_BIN = resolveBinaryFromEnvironment("TINYMIST_BIN", "tinymist");
const FONT_PATHS = process.env.TYPST_FONT_PATHS || "";
const PACKAGE_PATH = process.env.TYPST_PACKAGE_PATH || "";
const PACKAGE_CACHE_PATH = process.env.TYPST_PACKAGE_CACHE_PATH || "";
const TINYMIST_WORKSPACE_PATH = path.resolve(process.cwd());
const TINYMIST_DOCUMENT_PATH = path.join(TINYMIST_WORKSPACE_PATH, ".pptypst", "taskpane.typ");
const TINYMIST_WORKSPACE_URI = pathToFileURL(TINYMIST_WORKSPACE_PATH).href;
const TINYMIST_DOCUMENT_URI = pathToFileURL(TINYMIST_DOCUMENT_PATH).href;

/**
 * 统一整理环境变量里的可执行文件路径，去掉多余空白和外层引号。
 */
function normalizeBinaryValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.replace(/^"(.*)"$/u, "$1");
}

/**
 * 在 Windows 上补读一次用户级环境变量，兼容“旧终端未刷新环境”的场景。
 */
function readWindowsUserEnvironmentVariable(name) {
  if (process.platform !== "win32") {
    return "";
  }

  try {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `[Environment]::GetEnvironmentVariable('${name}', 'User')`,
      ],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );

    if (result.status !== 0) {
      return "";
    }

    return normalizeBinaryValue(result.stdout);
  } catch {
    return "";
  }
}

/**
 * 优先使用当前进程环境变量；如果缺失，再尝试读取 Windows 用户级环境变量。
 */
function resolveBinaryFromEnvironment(envName, fallbackValue) {
  const processValue = normalizeBinaryValue(process.env[envName]);
  if (processValue) {
    return processValue;
  }

  const userValue = readWindowsUserEnvironmentVariable(envName);
  if (userValue) {
    process.env[envName] = userValue;
    return userValue;
  }

  return fallbackValue;
}

/**
 * 把“找不到 typst 命令”这类底层错误转成更清晰的中文提示。
 */
function formatTypstLaunchError(error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    return "未找到 Typst 可执行文件。请先安装 Typst，或通过环境变量 TYPST_BIN 指向正确的可执行文件。";
  }

  if (error instanceof Error) {
    return `无法启动本地 Typst：${error.message}`;
  }

  return "无法启动本地 Typst。";
}

/**
 * 把“找不到 tinymist 命令”这类错误转成适合提示给用户的中文说明。
 */
function formatTinymistLaunchError(error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    return "未找到 Tinymist 可执行文件。请先安装 Tinymist，或通过环境变量 TINYMIST_BIN 指向正确的可执行文件。";
  }

  if (error instanceof Error) {
    return `无法启动本地 Tinymist：${error.message}`;
  }

  return "无法启动本地 Tinymist。";
}

/**
 * 去掉 Typst CLI 诊断输出里的 ANSI 颜色码。
 */
function stripAnsi(value) {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}

/**
 * 统一给响应补上跨域头，方便任务窗格直接访问本地桥接服务。
 */
function writeCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Private-Network", "true");
}

/**
 * 返回 JSON 响应。
 */
function writeJson(response, statusCode, payload) {
  writeCorsHeaders(response);
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

/**
 * 读取请求体里的 JSON 数据。
 */
async function readJsonBody(request) {
  const chunks = [];
  let totalLength = 0;

  for await (const chunk of request) {
    totalLength += chunk.length;
    if (totalLength > 2 * 1024 * 1024) {
      throw new Error("请求体过大。");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

/**
 * 与前端保持同一套包裹逻辑，确保预览和插入结果一致。
 */
function buildRawTypstString(rawCode, fontSize, mathMode) {
  let code = rawCode;
  if (mathMode) {
    code = `$\n${rawCode}\n$`;
  }

  return "#set page(margin: 3pt, background: none, width: auto, fill: none, height: auto)"
    + `\n#set text(size: ${fontSize}pt)\n${code}`;
}

/**
 * 把 Typst CLI 的短格式诊断解析成前端可直接消费的结构。
 */
function parseDiagnostics(stderrText) {
  const diagnostics = [];
  const lines = stripAnsi(stderrText)
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean);

  const diagnosticRegex = /^(.*):(\d+):(\d+):\s+(error|warning|info):\s+(.*)$/iu;

  lines.forEach((line) => {
    const match = line.match(diagnosticRegex);
    if (!match) {
      diagnostics.push(line);
      return;
    }

    const [, filePath, lineNumber, columnNumber, severity, message] = match;
    diagnostics.push({
      package: "typst-cli",
      path: filePath,
      severity: severity[0].toUpperCase() + severity.slice(1).toLowerCase(),
      range: `${lineNumber}:${columnNumber}-${lineNumber}:${columnNumber}`,
      message,
    });
  });

  return diagnostics;
}

/**
 * 执行 typst compile，并把 SVG 与诊断信息一起返回。
 */
async function compileTypst({ source, fontSize, mathMode }) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pptypst-local-"));
  const inputPath = path.join(tempDir, "main.typ");
  const outputPath = path.join(tempDir, "main.svg");
  const typstSource = buildRawTypstString(source, fontSize, mathMode);

  try {
    await writeFile(inputPath, typstSource, "utf8");

    const args = [
      "compile",
      "--format",
      "svg",
      "--diagnostic-format",
      "short",
      inputPath,
      outputPath,
    ];

    if (FONT_PATHS) {
      args.push("--font-path", FONT_PATHS);
    }
    if (PACKAGE_PATH) {
      args.push("--package-path", PACKAGE_PATH);
    }
    if (PACKAGE_CACHE_PATH) {
      args.push("--package-cache-path", PACKAGE_CACHE_PATH);
    }

    let result;
    try {
      result = await new Promise((resolve, reject) => {
        const child = spawn(TYPST_BIN, args, {
          env: process.env,
          windowsHide: true,
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", chunk => {
          stdout += chunk.toString("utf8");
        });
        child.stderr.on("data", chunk => {
          stderr += chunk.toString("utf8");
        });
        child.on("error", reject);
        child.on("close", code => {
          resolve({ code, stdout, stderr });
        });
      });
    } catch (error) {
      return {
        ok: false,
        svg: null,
        diagnostics: [formatTypstLaunchError(error)],
      };
    }

    const diagnostics = parseDiagnostics(result.stderr || result.stdout);

    if (result.code !== 0) {
      return {
        ok: false,
        svg: null,
        diagnostics: diagnostics.length > 0 ? diagnostics : ["本地 Typst 编译失败。"],
      };
    }

    const svg = await readFile(outputPath, "utf8");
    return {
      ok: true,
      svg,
      diagnostics,
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

/**
 * 统一读取本机命令的版本信息。
 */
async function readBinaryVersion(binary, args, formatLaunchError, unavailableMessage) {
  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      env: process.env,
      windowsHide: true,
    });

    let output = "";
    child.stdout.on("data", chunk => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", chunk => {
      output += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      resolve({
        available: false,
        message: formatLaunchError(error),
      });
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({
          available: true,
          message: output.trim() || `${binary} 已连接。`,
        });
        return;
      }

      resolve({
        available: false,
        message: output.trim() || unavailableMessage,
      });
    });
  });
}

/**
 * 查询本机 Typst 版本，启动时和健康检查都会复用。
 */
async function readTypstVersion() {
  return readBinaryVersion(
    TYPST_BIN,
    ["--version"],
    formatTypstLaunchError,
    "本地 Typst 不可用。",
  );
}

/**
 * 查询本机 Tinymist 版本，供智能补全健康检查使用。
 */
async function readTinymistVersion() {
  const result = await readBinaryVersion(
    TINYMIST_BIN,
    ["--version"],
    formatTinymistLaunchError,
    "本地 Tinymist 不可用。",
  );

  return {
    ...result,
    workspaceUri: TINYMIST_WORKSPACE_URI,
    documentUri: TINYMIST_DOCUMENT_URI,
  };
}

/**
 * 把一条 JSON-RPC 消息编码成 LSP 所需的 Content-Length 帧。
 */
function encodeLspFrame(payload) {
  const body = Buffer.from(payload, "utf8");
  const header = Buffer.from(`Content-Length: ${body.length.toString()}\r\n\r\n`, "utf8");
  return Buffer.concat([header, body]);
}

/**
 * 从 Tinymist stdout 中解析完整的 LSP 消息。
 */
function extractLspMessages(buffer) {
  const messages = [];
  let remaining = buffer;

  while (remaining.length > 0) {
    const headerEnd = remaining.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      break;
    }

    const headerText = remaining.subarray(0, headerEnd).toString("utf8");
    const contentLengthMatch = headerText.match(/Content-Length:\s*(\d+)/iu);
    if (!contentLengthMatch) {
      throw new Error("Tinymist LSP 消息缺少 Content-Length。");
    }

    const contentLength = Number.parseInt(contentLengthMatch[1], 10);
    const bodyStart = headerEnd + 4;
    if (remaining.length < bodyStart + contentLength) {
      break;
    }

    const body = remaining.subarray(bodyStart, bodyStart + contentLength).toString("utf8");
    messages.push(body);
    remaining = remaining.subarray(bodyStart + contentLength);
  }

  return {
    messages,
    remainder: remaining,
  };
}

/**
 * 通过 WebSocket 发送桥接层自定义事件。
 */
function sendBridgeEnvelope(websocket, kind, message) {
  if (websocket.readyState !== WebSocket.OPEN) {
    return;
  }

  websocket.send(JSON.stringify({ kind, message }));
}

/**
 * 关闭 WebSocket 连接，避免重复抛错。
 */
function safeCloseSocket(websocket) {
  if (websocket.readyState === WebSocket.CLOSING || websocket.readyState === WebSocket.CLOSED) {
    return;
  }

  websocket.close();
}

/**
 * 为一个前端连接启动独立的 Tinymist LSP 会话。
 */
function attachTinymistSession(websocket) {
  const child = spawn(TINYMIST_BIN, ["lsp"], {
    env: process.env,
    windowsHide: true,
  });

  let stdoutBuffer = Buffer.alloc(0);
  let stderrOutput = "";
  let closedByClient = false;

  child.stdout.on("data", (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, Buffer.from(chunk)]);

    try {
      const extracted = extractLspMessages(stdoutBuffer);
      stdoutBuffer = extracted.remainder;

      extracted.messages.forEach((message) => {
        if (websocket.readyState === WebSocket.OPEN) {
          websocket.send(message);
        }
      });
    } catch (error) {
      sendBridgeEnvelope(
        websocket,
        "bridge/error",
        error instanceof Error ? error.message : "Tinymist LSP 消息解析失败。",
      );
      safeCloseSocket(websocket);
      child.kill();
    }
  });

  child.stderr.on("data", (chunk) => {
    stderrOutput += chunk.toString("utf8");
  });

  child.on("error", (error) => {
    sendBridgeEnvelope(websocket, "bridge/error", formatTinymistLaunchError(error));
    safeCloseSocket(websocket);
  });

  child.on("close", (code) => {
    if (closedByClient) {
      return;
    }

    const trimmedError = stripAnsi(stderrOutput).trim();
    const fallbackMessage = code === 0
      ? "Tinymist 会话已结束。"
      : "Tinymist LSP 异常退出。";
    sendBridgeEnvelope(websocket, "bridge/error", trimmedError || fallbackMessage);
    safeCloseSocket(websocket);
  });

  websocket.on("message", (message) => {
    if (!child.stdin.writable) {
      return;
    }

    const payload = typeof message === "string" ? message : message.toString("utf8");
    child.stdin.write(encodeLspFrame(payload));
  });

  websocket.on("close", () => {
    closedByClient = true;
    if (child.stdin.writable) {
      child.stdin.end();
    }
    child.kill();
  });

  websocket.on("error", () => {
    closedByClient = true;
    if (child.stdin.writable) {
      child.stdin.end();
    }
    child.kill();
  });
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    writeJson(response, 400, { ok: false, message: "缺少请求地址。" });
    return;
  }

  if (request.method === "OPTIONS") {
    writeCorsHeaders(response);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    const version = await readTypstVersion();
    writeJson(response, 200, { ok: true, ...version });
    return;
  }

  if (request.method === "GET" && request.url === "/tinymist-health") {
    const version = await readTinymistVersion();
    writeJson(response, 200, { ok: true, ...version });
    return;
  }

  if (request.method === "POST" && request.url === "/compile") {
    try {
      const body = await readJsonBody(request);
      const source = typeof body.source === "string" ? body.source : "";
      const fontSize = typeof body.fontSize === "string" ? body.fontSize : "28";
      const mathMode = Boolean(body.mathMode);

      if (!source.trim()) {
        writeJson(response, 400, {
          ok: false,
          svg: null,
          diagnostics: ["请输入 Typst 内容。"],
        });
        return;
      }

      const result = await compileTypst({ source, fontSize, mathMode });
      writeJson(response, result.ok ? 200 : 422, result);
    } catch (error) {
      writeJson(response, 500, {
        ok: false,
        svg: null,
        diagnostics: [error instanceof Error ? error.message : "桥接服务发生未知错误。"],
      });
    }
    return;
  }

  writeJson(response, 404, { ok: false, message: "未找到对应接口。" });
});

const lspSocketServer = new WebSocketServer({ noServer: true });

lspSocketServer.on("connection", (websocket) => {
  attachTinymistSession(websocket);
});

server.on("upgrade", (request, socket, head) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || `${HOST}:${PORT}`}`);
  if (requestUrl.pathname !== "/tinymist-lsp") {
    socket.destroy();
    return;
  }

  lspSocketServer.handleUpgrade(request, socket, head, (websocket) => {
    lspSocketServer.emit("connection", websocket, request);
  });
});

server.on("error", (error) => {
  if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
    console.error(`[PPTypst Bridge] 端口 ${PORT} 已被占用，请先关闭旧的桥接服务，或修改 PPTYPST_BRIDGE_PORT。`);
    process.exit(1);
  }

  if (error instanceof Error) {
    console.error(`[PPTypst Bridge] 启动失败：${error.message}`);
    process.exit(1);
  }

  console.error("[PPTypst Bridge] 启动失败：发生未知错误。");
  process.exit(1);
});

server.listen(PORT, HOST, async () => {
  const [typstVersion, tinymistVersion] = await Promise.all([
    readTypstVersion(),
    readTinymistVersion(),
  ]);
  const typstMessage = typstVersion.available ? typstVersion.message : `警告：${typstVersion.message}`;
  const tinymistMessage = tinymistVersion.available ? tinymistVersion.message : `警告：${tinymistVersion.message}`;
  console.log(`[PPTypst Bridge] 已监听 http://${HOST}:${PORT}`);
  console.log(`[PPTypst Bridge] ${typstMessage}`);
  console.log(`[PPTypst Bridge] ${tinymistMessage}`);
});
