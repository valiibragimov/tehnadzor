type DemoChartConfiguration = {
  type?: string;
  data?: unknown;
  options?: unknown;
};

class DemoChart {
  readonly config: DemoChartConfiguration;

  constructor(_context: unknown, config: DemoChartConfiguration) {
    this.config = config;
  }

  destroy() {}

  resize() {}

  update() {}
}

export async function ensureChartJsLoaded() {
  if (!window.Chart) {
    window.Chart = DemoChart as unknown as typeof window.Chart;
  }
  return true;
}

export async function ensureJsPdfLoaded() {
  return false;
}
