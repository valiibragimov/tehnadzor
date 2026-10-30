import { createServer, request } from "node:http";

// Test-only, loopback-only relay. Cut a real WebChannel response mid-stream
// once so the SDK's network error and cancellation paths run unchanged.
export async function startFirestoreTransportProxy(address) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(address)) throw Error("A loopback emulator is required");
  const [host, port] = address.split(":");
  let armed = false, disconnects = 0;
  const server = createServer((incoming, outgoing) => {
    const upstream = request({ hostname: host, port, method: incoming.method, path: incoming.url,
      headers: { ...incoming.headers, host: address } });
    upstream.on("error", () => outgoing.destroy());
    incoming.on("aborted", () => upstream.destroy());
    outgoing.on("close", () => upstream.destroy());
    upstream.on("response", response => {
      outgoing.writeHead(response.statusCode, response.headers);
      response.on("error", () => outgoing.destroy());
      response.on("data", chunk => {
        if (armed && incoming.url.includes("/Listen/channel")) {
          armed = false; disconnects += 1;
          outgoing.destroy(); response.destroy();
        } else outgoing.write(chunk);
      });
      response.on("end", () => outgoing.end());
    });
    incoming.pipe(upstream);
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return {
    address: `127.0.0.1:${server.address().port}`,
    dropNextListenResponse() { armed = true; },
    get disconnects() { return disconnects; },
    close() { server.closeAllConnections(); return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  };
}
