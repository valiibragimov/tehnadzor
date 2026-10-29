import type { IncomingMessage, ServerResponse } from "node:http";

/** A normal request-body close is not a disconnect; the response owns the lifetime. */
export async function withClientCancellation<T>(request: IncomingMessage, response: ServerResponse, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(Object.assign(new Error("Client disconnected."), { status: 499 }));
  const onClose = () => { if (!response.writableFinished) cancel(); };
  request.once("aborted", cancel);
  response.once("close", onClose);
  if (request.aborted || response.destroyed) cancel();
  try {
    controller.signal.throwIfAborted();
    return await operation(controller.signal);
  } finally {
    request.removeListener("aborted", cancel);
    response.removeListener("close", onClose);
  }
}
