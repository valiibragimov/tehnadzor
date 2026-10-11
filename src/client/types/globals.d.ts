declare global {
  interface EventTarget {
    value?: string;
    checked?: boolean;
    disabled?: boolean;
    dataset?: DOMStringMap;
    classList?: DOMTokenList;
    className?: string;
    files?: FileList | null;
    focus?: () => void;
    closest?: (selectors: string) => Element | null;
    parentElement?: HTMLElement | null;
  }

  interface Element {
    dataset?: DOMStringMap;
    style?: CSSStyleDeclaration;
    click?: () => void;
    onclick?: ((this: GlobalEventHandlers, ev: MouseEvent) => unknown) | null;
  }

  interface HTMLElement {
    value?: string;
    checked?: boolean;
    disabled?: boolean;
    files?: FileList | null;
    src?: string;
    href?: string;
    options?: HTMLOptionsCollection;
    valueAsDate?: Date | null;
    onclick?: ((this: GlobalEventHandlers, ev: MouseEvent) => unknown) | null;
    getContext?: (contextId: string, options?: unknown) => unknown;
  }

  interface Event {
    request?: Request;
    waitUntil?(promise: Promise<unknown>): void;
    respondWith?(response: Promise<Response> | Response): void;
  }

  interface Window {
    __APP_CONFIG__?: Record<string, unknown>;
    Chart?: {
      new (...args: unknown[]): {
        destroy?: () => void;
      };
    };
    jspdf?: {
      jsPDF?: new (...args: unknown[]) => {
        setFont?: (...args: unknown[]) => unknown;
        setFontSize?: (...args: unknown[]) => unknown;
        addPage?: (...args: unknown[]) => unknown;
        splitTextToSize?: (...args: unknown[]) => string[];
        text?: (...args: unknown[]) => unknown;
        setLineWidth?: (...args: unknown[]) => unknown;
        line?: (...args: unknown[]) => unknown;
        rect?: (...args: unknown[]) => unknown;
        addImage?: (...args: unknown[]) => unknown;
        save?: (...args: unknown[]) => unknown;
      };
    };
    DEBUG?: boolean;
    registration?: ServiceWorkerRegistration;
    clients?: Clients;
    skipWaiting?: () => Promise<void> | void;
    chartJsWarningShown?: boolean;
  }

}

export {};
