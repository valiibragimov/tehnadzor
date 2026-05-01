import type { BimElement } from "./domain.js";

declare module "../vendor/thatopen-bim-visual-panel.bundle.js" {
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
    labelBuilder?: (element: Partial<BimElement> & Record<string, unknown>) => string | null | undefined;
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

  export function ensureBimVisualPanel(options?: BimVisualPanelOptions): BimVisualPanelApi;
}
