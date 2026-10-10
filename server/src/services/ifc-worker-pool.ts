import type { IfcModelData } from "../../../src/shared/bim/types";
import path from "node:path";
import { availableParallelism } from "node:os";
import Piscina from "piscina";
function positiveInteger(name: string, fallback: number, maximum: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`Invalid ${name}`);
  return value;
}
/** Bounded CPU work; Firestore and network I/O stay on the event loop. */
export function createIfcWorkerPool() {
  const maxBytes = positiveInteger("IFC_WORKER_MAX_BYTES", 25 * 1024 * 1024, 100 * 1024 * 1024);
  const maxQueue = positiveInteger("IFC_WORKER_QUEUE", 4, 64);
  const pool = new Piscina({
    filename: path.resolve(__dirname, "../workers/ifc-import.js"), minThreads: 0,
    maxThreads: positiveInteger("IFC_WORKER_THREADS", Math.min(2, Math.max(1, availableParallelism() - 1)), 16),
    maxQueue, concurrentTasksPerWorker: 1, idleTimeout: 30_000,
    resourceLimits: { maxOldGenerationSizeMb: positiveInteger("IFC_WORKER_HEAP_MB", 256, 4096) }
  });
  return {
    async parse(bytes: Uint8Array, options: { sourceModelId?: string; fileName?: string }, signal?: AbortSignal) {
      if (bytes.byteLength > maxBytes) throw Object.assign(new Error("IFC model exceeds the worker input limit."), { status: 413 });
      if (pool.queueSize >= maxQueue) throw Object.assign(new Error("IFC import queue is full. Please retry later."), { status: 503 });
      const deadline = AbortSignal.timeout(positiveInteger("IFC_WORKER_TIMEOUT_MS", 120_000, 600_000));
      try {
        const result: { ok: true; model: IfcModelData } | { ok: false; error: string } = await pool.run({ bytes, options }, { signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
        if (result.ok === false) throw Object.assign(new Error(result.error), { status: 422 });
        return result.model;
      } catch (error) {
        if (error.name === "AbortError" || error.code === "ERR_WORKER_OUT_OF_MEMORY") {
          throw Object.assign(new Error("IFC worker exceeded its execution limit. Please retry later."), { status: 503 });
        }
        throw error;
      }
    },
    close: () => pool.close(),
    get queueSize() { return pool.queueSize; }
  };
}
