// Synthetic CPU boundary for real Piscina queue, cancellation and timeout tests.
module.exports = ({ bytes }) => {
  const state = new Int32Array(bytes.buffer);
  Atomics.store(state, 0, 1);
  while (Atomics.load(state, 1) === 0) Atomics.wait(state, 1, 0, 100);
  return { ok: true, model: { importedCount: 1, countsByType: { column: 1 } } };
};
