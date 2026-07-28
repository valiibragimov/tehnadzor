import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chromePath =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const targetUrl =
  process.env.VIEWER_HARNESS_URL ||
  "http://127.0.0.1:8000/tools/viewer-harness/index.html?autotest=1";
const debugPort = Number(process.env.CDP_PORT || 9222);
const settleMs = Number(process.env.SETTLE_MS || 45000);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJson(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response.json();
      }
    } catch {
      // Retry until timeout.
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function createCdpClient(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(String(event.data || "{}"));
    if (payload.id && pending.has(payload.id)) {
      const { resolve, reject } = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) {
        reject(new Error(payload.error.message || "CDP command failed"));
      } else {
        resolve(payload.result);
      }
      return;
    }

    const callbacks = listeners.get(payload.method);
    if (!callbacks) return;
    for (const callback of callbacks) {
      callback(payload.params || {});
    }
  });

  socket.addEventListener("error", (event) => {
    for (const { reject } of pending.values()) {
      reject(event.error || new Error("WebSocket error"));
    }
    pending.clear();
  });

  await once(socket, "open");

  return {
    send(method, params = {}) {
      const id = nextId++;
      const message = JSON.stringify({ id, method, params });
      socket.send(message);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    on(method, callback) {
      if (!listeners.has(method)) {
        listeners.set(method, new Set());
      }
      listeners.get(method).add(callback);
      return () => listeners.get(method)?.delete(callback);
    },
    close() {
      socket.close();
    }
  };
}

async function main() {
  const userDataDir = await mkdtemp(join(tmpdir(), "viewer-harness-chrome-"));
  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "--headless=new",
      "--disable-gpu",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "about:blank"
    ],
    {
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const cleanup = async () => {
    if (!chrome.killed) {
      chrome.kill();
    }
    await rm(userDataDir, { recursive: true, force: true });
  };

  try {
    const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json`);
    const pageTarget = targets.find((entry) => entry.type === "page");
    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error("No debuggable Chrome page target found");
    }

    const client = await createCdpClient(pageTarget.webSocketDebuggerUrl);
    const consoleEntries = [];
    const exceptions = [];

    client.on("Runtime.consoleAPICalled", (params) => {
      const args = Array.isArray(params.args)
        ? params.args.map((arg) => arg.value ?? arg.description ?? arg.type)
        : [];
      consoleEntries.push({
        type: params.type,
        text: args.join(" ")
      });
    });

    client.on("Runtime.exceptionThrown", (params) => {
      exceptions.push(
        params.exceptionDetails?.text ||
          params.exceptionDetails?.exception?.description ||
          "Runtime exception"
      );
    });

    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");

    await client.send("Page.navigate", { url: targetUrl });
    await delay(settleMs);

    const domResult = await client.send("Runtime.evaluate", {
      expression: `(() => ({
        autotest: document.querySelector('#autotestResult')?.textContent || '',
        status: document.querySelector('#status')?.textContent || '',
        floors: Array.from(document.querySelectorAll('[data-bim-floor-key]')).map((button) => button.textContent.trim()),
        hint: document.querySelector('.bim-workspace__hint')?.textContent || '',
        viewportMessage: document.querySelector('.bim-workspace__empty3d')?.textContent || '',
        title: document.querySelector('.bim-workspace__inspector-title')?.textContent || '',
        renderFailures: window.__viewerHarnessRenderFailures || []
      }))()`,
      returnByValue: true
    });

    const summary = {
      url: targetUrl,
      settleMs,
      dom: domResult.result?.value || null,
      consoleEntries,
      exceptions,
      chromeStderr: stderr.trim()
    };

    console.log(JSON.stringify(summary, null, 2));
    client.close();
  } finally {
    try {
      await cleanup();
    } catch (error) {
      if (error?.code !== "EBUSY") {
        console.warn("[viewer-harness-check] Cleanup failed:", error);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
