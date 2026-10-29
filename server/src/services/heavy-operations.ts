interface HeavyOperationOptions {
  key: string;
  rateWindowMs?: number;
  rateMax?: number;
  inFlightMessage?: string;
  rateMessage?: string;
}

function operationError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

/** Process-local admission and lifetime; completion includes any started persistence. */
export function createHeavyOperationRunner({ maxKeys = 10000, retentionMs = 60000, now = Date.now } = {}) {
  if (!Number.isSafeInteger(maxKeys) || maxKeys < 1 || !Number.isFinite(retentionMs) || retentionMs < 1000) throw new Error("Invalid heavy operation limits");
  const history = new Map<string, { timestamps: number[]; expiresAt: number }>();
  const active = new Map<string, { controller: AbortController; promise: Promise<unknown> }>();
  let closing: Promise<void> | undefined;
  let closed = false;
  function prune() {
    const time = now();
    for (const [key, entry] of history) if (entry.expiresAt <= time) history.delete(key);
  }
  const timer = setInterval(prune, Math.min(retentionMs, 1000));
  timer.unref();
  return {
    async run<T>(options: HeavyOperationOptions, operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
      if (closed) throw operationError(503, "Server is shutting down.");
      signal?.throwIfAborted();
      const key = options.key.trim();
      if (!key) throw new Error("Heavy operation key is required");
      if (active.has(key)) throw operationError(409, options.inFlightMessage || "Operation is already running");
      const windowMs = Math.max(1000, Number(options.rateWindowMs) || 30000);
      const max = Math.max(1, Number(options.rateMax) || 1);
      const time = now();
      if (history.size >= maxKeys) prune();
      const timestamps = (history.get(key)?.timestamps || []).filter(timestamp => time - timestamp < Math.max(retentionMs, windowMs));
      if (timestamps.filter(timestamp => time - timestamp < windowMs).length >= max) throw operationError(429, options.rateMessage || "Too many requests. Please retry later.");
      if (!history.has(key) && history.size >= maxKeys) throw operationError(503, "Heavy operation capacity is full. Please retry later.");
      timestamps.push(time);
      history.set(key, { timestamps, expiresAt: time + Math.max(retentionMs, windowMs) });
      const controller = new AbortController();
      const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
      const promise = Promise.resolve().then(() => { combined.throwIfAborted(); return operation(combined); });
      active.set(key, { controller, promise });
      try { return await promise; }
      finally { active.delete(key); }
    },
    close(): Promise<void> {
      if (!closing) {
        closed = true;
        clearInterval(timer);
        for (const entry of active.values()) entry.controller.abort(operationError(503, "Server is shutting down."));
        closing = Promise.allSettled([...active.values()].map(entry => entry.promise)).then(() => { history.clear(); });
      }
      return closing;
    }
  };
}
