import { spawn } from "node:child_process";

const npmCommand = "npm";
const needsShell = process.platform === "win32";
const childProcesses = [];
let shuttingDown = false;

/**
 * 给子进程输出加上前缀，便于在单窗口里区分日志来源。
 */
function pipeWithPrefix(stream, prefix, targetStream) {
  let buffer = "";

  stream.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? "";

    lines.forEach((line) => {
      targetStream.write(`[${prefix}] ${line}\n`);
    });
  });

  stream.on("end", () => {
    if (!buffer) {
      return;
    }

    targetStream.write(`[${prefix}] ${buffer}\n`);
    buffer = "";
  });
}

/**
 * 统一拉起一个 npm 脚本，并把输出合并到当前终端。
 */
function spawnNpmScript(scriptName, prefix) {
  const child = spawn(npmCommand, ["run", scriptName], {
    cwd: process.cwd(),
    env: process.env,
    shell: needsShell,
    stdio: ["inherit", "pipe", "pipe"],
    windowsHide: false,
  });

  pipeWithPrefix(child.stdout, prefix, process.stdout);
  pipeWithPrefix(child.stderr, prefix, process.stderr);
  childProcesses.push(child);

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const reason = signal
      ? `收到信号 ${signal}`
      : `退出码 ${String(code ?? 0)}`;
    const exitCode = typeof code === "number" ? code : 0;
    process.stderr.write(`[dev] ${prefix} 已结束，原因：${reason}\n`);

    void shutdown(exitCode === 0 ? 0 : exitCode);
  });

  child.on("error", (error) => {
    process.stderr.write(`[dev] 启动 ${prefix} 失败：${error.message}\n`);
    void shutdown(1);
  });
}

/**
 * 关闭所有子进程，确保 Ctrl+C 时不会留下后台服务。
 */
async function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  process.stdout.write("[dev] 正在关闭本地开发服务...\n");

  childProcesses.forEach((child) => {
    if (child.killed) {
      return;
    }

    try {
      child.kill("SIGTERM");
    } catch {
      // 某些平台上进程可能已经退出，这里直接忽略即可。
    }
  });

  await new Promise((resolve) => {
    setTimeout(resolve, 300);
  });

  childProcesses.forEach((child) => {
    if (child.killed) {
      return;
    }

    try {
      child.kill("SIGKILL");
    } catch {
      // 同上，避免因为进程状态竞争导致关闭流程报错。
    }
  });

  process.exit(exitCode);
}

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});

process.stdout.write("[dev] 单窗口启动本地桥接服务和 Vite 开发服务器。\n");
spawnNpmScript("bridge", "bridge");
spawnNpmScript("dev:web", "web");
