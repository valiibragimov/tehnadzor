import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const serverDirectory = resolve(scriptDirectory, "..");
const projectRoot = resolve(serverDirectory, "..");
const typescriptCli = resolve(projectRoot, "node_modules", "typescript", "bin", "tsc");
const tsconfig = resolve(projectRoot, "tsconfig.server.json");
const serverEntry = resolve(serverDirectory, "dist", "server", "src", "index.js");

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    ...options
  });
}

function waitForExit(child) {
  return new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
}

const initialBuild = run(process.execPath, [typescriptCli, "-p", tsconfig]);
const initialResult = await waitForExit(initialBuild);

if (initialResult.code !== 0) {
  process.exit(initialResult.code ?? 1);
}

const compiler = run(process.execPath, [
  typescriptCli,
  "-p",
  tsconfig,
  "--watch",
  "--preserveWatchOutput"
]);
const server = run(process.execPath, ["--watch", serverEntry], {
  cwd: serverDirectory
});

let shuttingDown = false;

function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of [compiler, server]) {
    if (!child.killed) child.kill(signal);
  }

  process.exitCode = exitCode;
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

for (const child of [compiler, server]) {
  child.once("error", (error) => {
    console.error(error);
    shutdown("SIGTERM", 1);
  });
  child.once("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`Development process stopped unexpectedly (${signal || code}).`);
      shutdown("SIGTERM", code ?? 1);
    }
  });
}
