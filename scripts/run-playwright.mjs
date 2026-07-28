import { spawn } from "node:child_process";

const suppliedBaseUrl = String(process.env.PLAYWRIGHT_BASE_URL ?? "").trim();
const baseUrl = suppliedBaseUrl || "http://127.0.0.1:3100";
const playwrightArgs = ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)];

function spawnProcess(args, options = {}) {
  return spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
}

async function waitForServer(url, timeoutMs = 120_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0 && response.status < 500) return;
    } catch {
      // The development server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

let server = null;
try {
  if (!suppliedBaseUrl) {
    server = spawnProcess([
      "node_modules/next/dist/bin/next",
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3100",
    ]);
    await waitForServer(`${baseUrl}/login`);
  }

  const runner = spawnProcess(playwrightArgs, {
    env: { ...process.env, PLAYWRIGHT_BASE_URL: baseUrl },
  });
  const exitCode = await waitForExit(runner);
  process.exitCode = exitCode;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (server && !server.killed) {
    server.kill("SIGTERM");
  }
}
