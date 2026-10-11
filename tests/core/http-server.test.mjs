import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { createReportApi } from "../../dist/infrastructure/api/client.js";

async function startServer(authRequired) {
  // Deliberately pass no user credentials or repository dotenv file to the child.
  const child = spawn(process.execPath, [resolve("server/dist/server/src/index.js")], {
    cwd: resolve("tests"), stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PORT: "0", AUTH_REQUIRED: String(authRequired), FIREBASE_PROJECT_ID: "synthetic-http-tests", DOTENV_CONFIG_PATH: "nonexistent-test.env" }
  });
  const port = await new Promise((resolvePort, reject) => {
    const deadline = setTimeout(() => { child.kill(); reject(new Error("Server startup timed out")); }, 10000);
    child.once("error", error => { clearTimeout(deadline); reject(error); });
    child.once("exit", code => { clearTimeout(deadline); reject(new Error(`Server exited during startup: ${code}`)); });
    child.stdout.on("data", chunk => {
      const match = String(chunk).match(/listeningPort=(\d+)/);
      if (match) { clearTimeout(deadline); resolvePort(Number(match[1])); }
    });
    child.stderr.resume();
  });
  return { url: `http://127.0.0.1:${port}`, close: async () => { const exited = once(child, "exit"); child.kill(); await exited; } };
}

test("HTTP routes preserve auth before any Firebase persistence work", async () => {
  const server = await startServer(true);
  try {
    assert.equal((await createReportApi(server.url).health()).status, "running");
    const response = await fetch(`${server.url}/generateReport`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).ok, false);
  } finally { await server.close(); }
});

test("typed client works end-to-end; invalid and oversized requests are rejected", async () => {
  const server = await startServer(false);
  try {
    const stats = { total: 1, exceeded: 0 };
    const text = await createReportApi(server.url).generateReport({ projectId: "synthetic", summaryData: { project: "Synthetic", geo: stats, reinf: stats, geom: stats, strength: stats } }, {});
    assert.match(text, /ИТОГОВОЕ ЗАКЛЮЧЕНИЕ/u);
    const invalid = await fetch(`${server.url}/generateReport`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(invalid.status, 400);
    const oversized = await fetch(`${server.url}/generateReport`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: "x".repeat(110000) }) });
    assert.equal(oversized.status, 413);
  } finally { await server.close(); }
});
