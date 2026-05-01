import type { AnalyticsCurrent, BimElement, Inspection, Project } from "./domain.js";

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
    currentProjectId?: string | null;
    currentUserEngineerName?: string | null;
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
    dispatchAppEvent?: (...args: unknown[]) => void;
    selectProject?: (...args: unknown[]) => void;
    registration?: ServiceWorkerRegistration;
    clients?: Clients;
    skipWaiting?: () => Promise<void> | void;
    columns?: unknown[];
    beams?: unknown[];
    walls?: unknown[];
    addNode?: (...args: unknown[]) => unknown;
    saveGeomCheck?: (...args: unknown[]) => Promise<unknown> | unknown;
    saveReinfCheck?: (...args: unknown[]) => Promise<unknown> | unknown;
    saveStrengthCheck?: (...args: unknown[]) => Promise<unknown> | unknown;
    loadReinfChecks?: (...args: unknown[]) => unknown;
    saveReinfChecks?: (...args: unknown[]) => unknown;
    renderReinfChecks?: (...args: unknown[]) => unknown;
    loadReinfCheck?: (...args: unknown[]) => unknown;
    updateReinfLocationFieldsVisibility?: (...args: unknown[]) => unknown;
    loadStrengthChecks?: (...args: unknown[]) => unknown;
    saveStrengthChecks?: (...args: unknown[]) => unknown;
    renderStrengthChecks?: (...args: unknown[]) => unknown;
    loadStrengthCheck?: (...args: unknown[]) => unknown;
    updateStrengthFieldsVisibility?: (...args: unknown[]) => unknown;
    geomGetColumns?: () => unknown[];
    geomGetBeams?: () => unknown[];
    geomGetWalls?: () => unknown[];
    geomGetStairs?: () => unknown[];
    reinfGetColumns?: () => unknown[];
    reinfGetBeams?: () => unknown[];
    reinfGetWalls?: () => unknown[];
    showNotification?: (message: string, type?: string, duration?: number) => void;
    updateSummaryTab?: (...args: unknown[]) => unknown;
    upsertJournalEntry?: (entry: Inspection | Record<string, unknown>) => unknown;
    chartJsWarningShown?: boolean;
    openKnowledgeSubcategory?: (...args: unknown[]) => unknown;
    showKnowledgeMainPage?: (...args: unknown[]) => unknown;
    showKnowledgeCategoryPage?: (...args: unknown[]) => unknown;
    showAllArticles?: (...args: unknown[]) => unknown;
    openArticle?: (...args: unknown[]) => unknown;
  }

  interface GlobalThis {
    __APP_CONFIG__?: Record<string, unknown>;
    currentUserEngineerName?: string | null;
    currentProjectId?: string | null;
    registration?: ServiceWorkerRegistration;
    clients?: Clients;
    skipWaiting?: () => Promise<void> | void;
    checked?: unknown[];
    nodes?: unknown[];
    reinfChecks?: unknown[];
    geomChecks?: unknown[];
    strengthChecks?: unknown[];
    state?: Record<string, unknown>;
    LS?: Record<string, string>;
    construction?: HTMLSelectElement | null;
    engineer?: HTMLInputElement | HTMLSelectElement | null;
    dateInput?: HTMLInputElement | null;
    projectSelector?: HTMLSelectElement | null;
    loadNode?: (...args: unknown[]) => unknown;
    saveNodes?: (...args: unknown[]) => unknown;
    loadReinfCheck?: (...args: unknown[]) => unknown;
    loadGeomCheck?: (...args: unknown[]) => unknown;
    loadStrengthCheck?: (...args: unknown[]) => unknown;
    loadReinfChecks?: (...args: unknown[]) => unknown;
    saveReinfChecks?: (...args: unknown[]) => unknown;
    renderReinfChecks?: (...args: unknown[]) => unknown;
    updateReinfLocationFieldsVisibility?: (...args: unknown[]) => unknown;
    loadStrengthChecks?: (...args: unknown[]) => unknown;
    saveStrengthChecks?: (...args: unknown[]) => unknown;
    renderStrengthChecks?: (...args: unknown[]) => unknown;
    updateStrengthFieldsVisibility?: (...args: unknown[]) => unknown;
    addJournalEntry?: (entry: Inspection | Record<string, unknown>) => unknown;
    applyJournalFilter?: (...args: unknown[]) => unknown;
    notifyFirestoreSyncStatus?: (...args: unknown[]) => unknown;
    renderNodes?: (...args: unknown[]) => unknown;
    renderReinfChecks?: (...args: unknown[]) => unknown;
    renderGeomChecks?: (...args: unknown[]) => unknown;
    renderStrengthChecks?: (...args: unknown[]) => unknown;
    saveNodes?: (...args: unknown[]) => unknown;
    saveReinfChecks?: (...args: unknown[]) => unknown;
    saveGeomChecks?: (...args: unknown[]) => unknown;
    saveStrengthChecks?: (...args: unknown[]) => unknown;
    setConstructionAndTrigger?: (...args: unknown[]) => unknown;
    setJournalFilters?: (...args: unknown[]) => unknown;
    updateSummaryTab?: (
      currentProject?: Project | null,
      analyticsCurrent?: AnalyticsCurrent | null,
      selectedBimElement?: BimElement | null
    ) => unknown;
    loadJournalFromFirestore?: (...args: unknown[]) => unknown;
    evaluateGeoNode?: (...args: unknown[]) => unknown;
    upsertJournalEntry?: (entry: Inspection | Record<string, unknown>) => unknown;
    currentColumnNodeKey?: string | null;
    currentWallNodeKey?: string | null;
    currentBeamNodeKey?: string | null;
    currentReinfCheckId?: string | null;
    currentGeomCheckId?: string | null;
    currentStrengthCheckId?: string | null;
  }
  
  var currentProjectId: string | null;
  var currentUserEngineerName: string | null;
  var journal: Array<Record<string, unknown>>;
  var journalEntries: Array<Record<string, unknown>>;
  var journalFilteredEntries: Array<Record<string, unknown>>;
  var journalFilterModule: string | null;
  var journalFilterConstruction: string | null;
  var construction: HTMLSelectElement | null;
  var dateInput: HTMLInputElement | null;
  var projectSelector: HTMLSelectElement | null;
  var LS: Record<string, string>;
  var updateSummaryTab: (...args: unknown[]) => unknown;
  var applyJournalFilter: (...args: unknown[]) => unknown;
  var setJournalFilters: (...args: unknown[]) => unknown;
  var suppressStrengthAutoSaveOnce: boolean;
  var nodes: Map<string, Record<string, unknown>>;
  var reinfChecks: Map<string, Record<string, unknown>>;
  var geomChecks: Map<string, Record<string, unknown>>;
  var strengthChecks: Map<string, Record<string, unknown>>;
  var state: Record<string, unknown>;
  var checked: Record<string, unknown>;
  var saveNodes: (...args: unknown[]) => unknown;
  var renderNodes: (...args: unknown[]) => unknown;
  var saveGeomChecks: (...args: unknown[]) => unknown;
  var renderGeomChecks: (...args: unknown[]) => unknown;
  var loadNode: (...args: unknown[]) => unknown;
  var loadGeomCheck: (...args: unknown[]) => unknown;
  var selectProject: (...args: unknown[]) => unknown;
  var setConstructionAndTrigger: (...args: unknown[]) => unknown;
  var currentColumnNodeKey: string | null;
  var currentWallNodeKey: string | null;
  var currentBeamNodeKey: string | null;
  var currentReinfCheckId: string | null;
  var currentGeomCheckId: string | null;
  var currentStrengthCheckId: string | null;
  var loadReinfChecks: (...args: unknown[]) => unknown;
  var saveReinfChecks: (...args: unknown[]) => unknown;
  var renderReinfChecks: (...args: unknown[]) => unknown;
  var loadReinfCheck: (...args: unknown[]) => unknown;
  var updateReinfLocationFieldsVisibility: (...args: unknown[]) => unknown;
  var loadStrengthChecks: (...args: unknown[]) => unknown;
  var saveStrengthChecks: (...args: unknown[]) => unknown;
  var renderStrengthChecks: (...args: unknown[]) => unknown;
  var loadStrengthCheck: (...args: unknown[]) => unknown;
  var updateStrengthFieldsVisibility: (...args: unknown[]) => unknown;
}

export {};
