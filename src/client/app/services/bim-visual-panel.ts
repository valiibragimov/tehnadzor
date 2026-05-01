import type { BimElement } from "../../types/domain.js";

interface BimVisualPanelOptions {
  host?: HTMLElement | null;
  sourceCard?: Element | null;
  getAllElements?: () => Array<Partial<BimElement> & Record<string, unknown>>;
  getFilteredElements?: () => Array<Partial<BimElement> & Record<string, unknown>>;
  getSelectedElement?: () => (Partial<BimElement> & Record<string, unknown>) | null;
  getSelectedId?: () => string | null;
  getCurrentProjectId?: () => string | null;
  getCurrentIfcFile?: (...args: unknown[]) => unknown;
  onSelect?: (elementId: string) => void;
  labelBuilder?: (element: Partial<BimElement> & Record<string, unknown>) => string;
  moduleKey?: string;
}

interface BimVisualPanelApi {
  open: (...args: unknown[]) => unknown;
  close: (...args: unknown[]) => unknown;
  toggle: (...args: unknown[]) => unknown;
  render: (...args: unknown[]) => Promise<unknown>;
  debug: (...args: unknown[]) => Promise<unknown>;
  destroy: (...args: unknown[]) => Promise<unknown>;
}

let runtimePromise: Promise<{ ensureBimVisualPanel: (options?: BimVisualPanelOptions) => BimVisualPanelApi }> | null = null;

function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = import("../vendor/thatopen-bim-visual-panel.bundle.js");
  }
  return runtimePromise;
}

function createLazyApi(options: BimVisualPanelOptions): BimVisualPanelApi {
  let realApi: BimVisualPanelApi | null = null;
  let bootPromise: Promise<BimVisualPanelApi | null> | null = null;
  const queuedCalls: Array<[keyof BimVisualPanelApi, unknown[]]> = [];

  const boot = () => {
    if (bootPromise) return bootPromise;

    bootPromise = loadRuntime()
      .then((module) => {
        realApi = module.ensureBimVisualPanel(options);
        for (const [method, args] of queuedCalls.splice(0)) {
          realApi?.[method]?.(...args);
        }
        return realApi;
      })
      .catch((error) => {
        console.error("[BIM viewer] Failed to load That Open runtime", error);
        return null;
      });

    return bootPromise;
  };

  const call = (method: keyof BimVisualPanelApi, args: unknown[]) => {
    if (realApi?.[method]) {
      return realApi[method](...args);
    }
    queuedCalls.push([method, args]);
    void boot();
    return undefined;
  };

  const callAsync = async (method: keyof BimVisualPanelApi, args: unknown[]) => {
    const api = realApi || await boot();
    return api?.[method]?.(...args);
  };

  void boot();

  return {
    open(...args) {
      return call("open", args);
    },
    close(...args) {
      return call("close", args);
    },
    toggle(...args) {
      return call("toggle", args);
    },
    render(...args) {
      return callAsync("render", args);
    },
    debug(...args) {
      return callAsync("debug", args);
    },
    destroy(...args) {
      return callAsync("destroy", args);
    }
  };
}

export function ensureBimVisualPanel(options: BimVisualPanelOptions = {}) {
  return createLazyApi(options);
}
