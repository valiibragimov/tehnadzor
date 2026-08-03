const unavailable = async () => undefined;

export function ensureBimVisualPanel() {
  return {
    open: () => undefined,
    close: () => undefined,
    toggle: () => undefined,
    render: unavailable,
    debug: unavailable,
    destroy: unavailable
  };
}
