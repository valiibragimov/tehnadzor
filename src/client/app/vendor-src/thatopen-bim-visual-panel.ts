
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { getCachedProjectIfcFile } from "../services/ifc-file-cache.js";

import { IFC_NANOCAD_WARNING_MESSAGE, shouldShowIfcCoordinateWarning } from "../services/ifc-diagnostics.js";
import type { BimElement } from "../../types/domain.js";
import { createIfcLiteEngine } from "./ifc-lite-engine.js";

type ElementRecord = Partial<BimElement> & Record<string, unknown>;
type ModelIdMap = Record<string, Set<number>>;
type LabelBuilder = (element: ElementRecord) => string | null | undefined;

interface EnsureBimVisualPanelOptions {
  host?: HTMLElement | null;
  sourceCard?: Element | null;
  getAllElements?: () => ElementRecord[];
  getFilteredElements?: () => ElementRecord[];
  getSelectedElement?: () => ElementRecord | null;
  getSelectedId?: () => string | null;
  getCurrentProjectId?: () => string | null;
  getCurrentIfcFile?: (...args: unknown[]) => unknown;
  onSelect?: (elementId: string) => void;
  labelBuilder?: LabelBuilder;
  moduleKey?: string;
}

interface BimVisualPanelApiHandle {
  open: () => void;
  close: () => void;
  toggle: () => void;
  render: () => Promise<void>;
  debug: () => Promise<unknown>;
  destroy: () => Promise<void>;
}

interface BimVisualPanelElement extends HTMLDivElement {
  __thatopenBimApi?: BimVisualPanelApiHandle;
}

function compareLocale(left, right) {
  return String(left || "").localeCompare(String(right || ""), "ru", {
    numeric: true,
    sensitivity: "base"
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/этаж|storey|story|level/giu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function toFiniteNumber(value) {
  if (value == null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

function formatNumber(value, suffix = "") {
  const numeric = toFiniteNumber(value);
  if (numeric == null) return "Нет данных";
  const formatted = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: Number.isInteger(numeric) ? 0 : 2
  }).format(numeric);
  return suffix ? `${formatted} ${suffix}` : formatted;
}

function asElementRecord(element: unknown): ElementRecord {
  return (element && typeof element === "object" ? element : {}) as ElementRecord;
}

function getElementKey(element: unknown = {}) {
  const record = asElementRecord(element);
  return String(record.elementId || record.id || "").trim();
}

function getElementSourceModelId(element: unknown = {}) {
  const record = asElementRecord(element);
  const direct = String(record.sourceModelId || "").trim();
  if (direct) return direct;
  const key = getElementKey(record);
  const match = key.match(/^(.*)_(\d+)$/);
  return match ? String(match[1] || "").trim() : "";
}

function getElementExpressId(element: unknown = {}) {
  const record = asElementRecord(element);
  const key = getElementKey(record);
  const match = key.match(/_(\d+)$/);
  if (match) {
    const numeric = Number(match[1]);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const fallback = Number(record.expressId);
  return Number.isFinite(fallback) ? fallback : null;
}

function getElementLabel(element: unknown = {}, labelBuilder?: LabelBuilder) {
  const record = asElementRecord(element);
  if (typeof labelBuilder === "function") {
    return String(labelBuilder(record) || "").trim() || "BIM-элемент";
  }
  return String(record.name || record.mark || record.elementId || "BIM-элемент").trim();
}

function createModelIdMap(): ModelIdMap {
  return {};
}

function appendModelIdMap(target: ModelIdMap, modelId: unknown, localId: unknown) {
  const resolvedModelId = String(modelId || "").trim();
  const resolvedLocalId = Number(localId);
  if (!resolvedModelId || !Number.isFinite(resolvedLocalId)) return;

  if (!target[resolvedModelId]) {
    target[resolvedModelId] = new Set();
  }
  target[resolvedModelId].add(resolvedLocalId);
}

function buildModelIdMapForElement(element: unknown): ModelIdMap | null {
  const modelId = getElementSourceModelId(element);
  const localId = getElementExpressId(element);
  if (!modelId || !Number.isFinite(localId)) {
    return null;
  }
  const map = createModelIdMap();
  appendModelIdMap(map, modelId, localId);
  return map;
}

function buildModelIdMapForElements(elements: ElementRecord[] = []) {
  const map = createModelIdMap();
  elements.forEach((element) => {
    if (!element || typeof element !== "object") return;
    appendModelIdMap(map, getElementSourceModelId(element), getElementExpressId(element));
  });
  return map;
}

function hasModelIdMapEntries(modelIdMap) {
  return Object.values(modelIdMap || {}).some((ids) => ids instanceof Set && ids.size > 0);
}

function getUniqueSourceModelIds(elements = []) {
  const ids = new Set();
  elements.forEach((element) => {
    if (!element || typeof element !== "object") return;
    const sourceModelId = getElementSourceModelId(element);
    if (sourceModelId) ids.add(sourceModelId);
  });
  return [...ids].sort(compareLocale);
}

function buildElementIndex(elements = []) {
  const index = new Map();
  elements.forEach((element) => {
    if (!element || typeof element !== "object") return;
    const sourceModelId = getElementSourceModelId(element);
    const expressId = getElementExpressId(element);
    if (!sourceModelId || !Number.isFinite(expressId)) return;
    index.set(`${sourceModelId}:${expressId}`, element);
  });
  return index;
}

function findElementByModelIdMap(modelIdMap, index) {
  for (const [modelId, localIds] of Object.entries(modelIdMap || {})) {
    if (!(localIds instanceof Set)) continue;
    for (const localId of localIds) {
      const found = index.get(`${modelId}:${localId}`);
      if (found) return found;
    }
  }
  return null;
}

function filterModelIdMap(modelIdMap, allowedModelIds = new Set()) {
  const filtered = createModelIdMap();
  for (const [modelId, localIds] of Object.entries(modelIdMap || {})) {
    if (!allowedModelIds.has(modelId) || !(localIds instanceof Set) || localIds.size === 0) {
      continue;
    }
    filtered[modelId] = new Set(localIds);
  }
  return filtered;
}

function buildPropertiesHtml(element: ElementRecord | null = {}, labelBuilder?: LabelBuilder) {
  if (!element) {
    return `
      <div class="bim-workspace__properties-empty">
        Выберите элемент в 2D-плане или в 3D-модели, чтобы увидеть его свойства и передать данные в форму.
      </div>
    `;
  }

  const rows = [
    ["Элемент", getElementLabel(element, labelBuilder)],
    ["Тип", String(element.type || "").trim() || "Нет данных"],
    ["Этаж", String(element.floor || "").trim() || "Нет данных"],
    ["Марка", String(element.mark || "").trim() || "Нет данных"],
    ["Оси", String(element.resolvedAxes || element.axes || "").trim() || "Нет данных"],
    ["GUID IFC", String(element.ifcGuid || "").trim() || "Нет данных"],
    ["Source model", getElementSourceModelId(element) || "Нет данных"],
    ["Express ID", Number.isFinite(getElementExpressId(element)) ? String(getElementExpressId(element)) : "Нет данных"],
    ["Координата X", formatNumber(element.projectX, "мм")],
    ["Координата Y", formatNumber(element.projectY, "мм")],
    ["Отметка H", formatNumber(element.projectH, "мм")],
    ["Длина", formatNumber(element.length, "мм")],
    ["Ширина", formatNumber(element.width, "мм")],
    ["Высота", formatNumber(element.height, "мм")],
    ["Толщина", formatNumber(element.thickness, "мм")]
  ];

  return rows
    .map(([label, value]) => `
      <div class="bim-workspace__property">
        <div class="bim-workspace__property-label">${escapeHtml(label)}</div>
        <div class="bim-workspace__property-value">${escapeHtml(value)}</div>
      </div>
    `)
    .join("");
}

function buildFloorEntries(elements = []) {
  const floors = new Map();

  elements.forEach((element) => {
    const label = String(element?.floor || "").trim();
    if (!label) return;

    const normalized = normalizeLabel(label) || label.toLowerCase();
    if (!floors.has(normalized)) {
      floors.set(normalized, {
        id: normalized,
        label,
        count: 0
      });
    }

    const entry = floors.get(normalized);
    entry.count += 1;

    if (compareLocale(label, entry.label) < 0) {
      entry.label = label;
    }
  });

  return [...floors.values()].sort((left, right) => compareLocale(left.label, right.label));
}

function getFloorEntryById(floorEntries = [], floorId = "") {
  return floorEntries.find((entry) => entry.id === floorId) || null;
}

function getFloorElementsById(floorId = "", elements = []) {
  if (!floorId) return [];

  const exact = [];
  const loose = [];

  elements.forEach((element) => {
    if (!element || typeof element !== "object") return;
    const floorLabel = String(element.floor || "").trim();
    if (!floorLabel) return;

    const normalizedFloor = normalizeLabel(floorLabel) || floorLabel.toLowerCase();
    if (!normalizedFloor) return;

    if (normalizedFloor === floorId) {
      exact.push(element);
      return;
    }

    if (normalizedFloor.includes(floorId) || floorId.includes(normalizedFloor)) {
      loose.push(element);
    }
  });

  return exact.length ? exact : loose;
}

function buildFloorModelIdMap(floorId = "", elements = []) {
  return buildModelIdMapForElements(getFloorElementsById(floorId, elements));
}

function buildFloorChipsHtml(entries = [], activeViewId = "") {
  if (!entries.length) return "";

  return entries
    .map((entry) => {
      const suffix = entry.count > 0 ? ` • ${entry.count}` : "";
      return `
        <button
          type="button"
          class="bim-visual-stage__floor-chip${entry.id === activeViewId ? " is-active" : ""}"
          data-bim-floor-key="${escapeHtml(entry.id)}"
        >
          ${escapeHtml(`${entry.label}${suffix}`)}
        </button>
      `;
    })
    .join("");
}

function pickViewId({ currentViewId, selectedElement, floorEntries }) {
  const availableIds = new Set(floorEntries.map((entry) => entry.id));
  if (currentViewId && availableIds.has(currentViewId)) {
    return currentViewId;
  }

  const selectedFloor = String(selectedElement?.floor || "").trim();
  const normalizedSelectedFloor = normalizeLabel(selectedFloor) || selectedFloor.toLowerCase();
  if (normalizedSelectedFloor) {
    const matching = floorEntries.find((entry) => {
      const normalizedEntry = entry.id;
      return normalizedEntry && (
        normalizedEntry === normalizedSelectedFloor ||
        normalizedEntry.includes(normalizedSelectedFloor) ||
        normalizedSelectedFloor.includes(normalizedEntry)
      );
    });
    if (matching) return matching.id;
  }

  return floorEntries[0]?.id || "";
}

async function hasAvailableIfcSource({ projectId, sourceModelIds, getCurrentIfcFile }) {
  const currentFile = typeof getCurrentIfcFile === "function" ? getCurrentIfcFile() : null;
  if (currentFile instanceof File) {
    return true;
  }

  if (!projectId || !Array.isArray(sourceModelIds) || sourceModelIds.length === 0) {
    return false;
  }

  for (const sourceModelId of sourceModelIds) {
    const normalizedSourceModelId = String(sourceModelId || "").trim();
    if (!normalizedSourceModelId) continue;
    const cached = await getCachedProjectIfcFile({
      projectId,
      sourceModelId: normalizedSourceModelId
    });
    if (cached?.file) {
      return true;
    }
  }

  return false;
}

function createWorkspaceMarkup(workspaceId) {
  return `
    <div class="bim-workspace__backdrop" data-bim-workspace-close="true"></div>
    <section id="${workspaceId}" class="bim-workspace__surface" aria-hidden="true">
      <button type="button" class="bim-workspace__close" data-bim-workspace-close="true" aria-label="Закрыть BIM-viewer">×</button>
      <div class="bim-workspace__toolbar">
        <div class="bim-workspace__level-wrap">
          <span class="bim-workspace__level">Уровень</span>
          <div class="bim-workspace__floors"></div>
        </div>
        <div class="bim-workspace__hint">Клик по BIM-модели выбирает элемент и запускает автоподстановку.</div>
        <div class="bim-workspace__diagnostics" hidden>
          <span class="bim-workspace__diagnostic-warning"></span>
          <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact bim-workspace__normalize" data-bim-normalize-display="true" aria-pressed="false">
            <span class="lg-btn__label">Исправить отображение модели</span>
            <span class="lg-btn__glow" aria-hidden="true"></span>
          </button>
          <span class="bim-workspace__normalized-badge" hidden>Отображение нормализовано</span>
        </div>
      </div>
      <div class="bim-workspace__body">
        <div class="bim-workspace__stage-area">
          <div class="bim-workspace__model-head">
            <div class="bim-workspace__header-main">
              <div class="bim-workspace__intro">
                <h3 class="bim-workspace__title">Модель проекта</h3>
              </div>
              <div class="bim-workspace__actions">
                <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact bim-workspace__action" data-bim-action="toggle-background" aria-pressed="true">
                  <span class="lg-btn__label">Фон: тёмный</span>
                  <span class="lg-btn__glow" aria-hidden="true"></span>
                </button>
                <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact bim-workspace__action" data-bim-action="fit-all">
                  <span class="lg-btn__label">Fit ко всему</span>
                  <span class="lg-btn__glow" aria-hidden="true"></span>
                </button>
                <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact bim-workspace__action" data-bim-action="fit-selected">
                  <span class="lg-btn__label">Focus на выбранном</span>
                  <span class="lg-btn__glow" aria-hidden="true"></span>
                </button>
                <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact bim-workspace__action" data-bim-action="isolate">
                  <span class="lg-btn__label">Изолировать</span>
                  <span class="lg-btn__glow" aria-hidden="true"></span>
                </button>
                <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact bim-workspace__action" data-bim-action="show-all">
                  <span class="lg-btn__label">Показать всё</span>
                  <span class="lg-btn__glow" aria-hidden="true"></span>
                </button>
              </div>
              <div class="bim-workspace__mode-switch" role="tablist" aria-label="Режим BIM-viewer">
                <button type="button" class="bim-workspace__mode" data-bim-view-mode="2d" aria-selected="false">2D план</button>
                <button type="button" class="bim-workspace__mode is-active" data-bim-view-mode="3d" aria-selected="true">3D модель</button>
              </div>
            </div>
          </div>
          <div class="bim-workspace__stage bim-workspace__stage--3d is-active">
            <div class="bim-workspace__canvas3d"></div>
            <div class="bim-workspace__empty3d" hidden></div>
          </div>
        </div>
        <aside class="bim-workspace__inspector">
          <div class="bim-workspace__inspector-head">
            <div class="bim-workspace__inspector-eyebrow">Свойства</div>
            <div class="bim-workspace__inspector-title">BIM-элемент не выбран</div>
            <div class="bim-workspace__inspector-meta">Выберите элемент на плане или в 3D-модели, чтобы увидеть его свойства и передать данные в форму.</div>
          </div>
          <div class="bim-workspace__properties"></div>
        </aside>
      </div>
    </section>
  `;
}

export function ensureBimVisualPanel({
  host,
  sourceCard,
  getAllElements,
  getFilteredElements,
  getSelectedElement,
  getSelectedId,
  getCurrentProjectId,
  getCurrentIfcFile,
  onSelect,
  labelBuilder,
  moduleKey = "default"
}: EnsureBimVisualPanelOptions = {}) {
  if (!host || typeof getFilteredElements !== "function" || typeof onSelect !== "function") {
    return null;
  }

  const root = host.ownerDocument || document;
  const existingPanel = root.querySelector<BimVisualPanelElement>(`.bim-viewer-launcher[data-bim-visual-module="${moduleKey}"]`);
  if (existingPanel?.__thatopenBimApi) {
    return existingPanel.__thatopenBimApi;
  }

  root.querySelector(`.bim-workspace[data-bim-visual-module="${moduleKey}"]`)?.remove();

  const panel = root.createElement("div") as BimVisualPanelElement;
  panel.className = "bim-viewer-launcher";
  panel.dataset.bimVisualModule = moduleKey;
  panel.innerHTML = `
    <button
      type="button"
      class="btn-small btn-secondary lg-btn lg-btn--pill bim-viewer-launcher__button"
      aria-expanded="false"
      title="Открыть BIM-viewer"
    >
      <span class="lg-btn__label">Открыть BIM-viewer</span>
      <span class="lg-btn__glow" aria-hidden="true"></span>
    </button>
  `;

  const actionStack = host.querySelector<HTMLElement>(".geo-bim-header .bim-viewer-action-stack");
  const launcherSlot = actionStack?.querySelector<HTMLElement>(".bim-viewer-launcher-slot");
  const clearActionButton = host.querySelector(".geo-bim-header .bim-import-action");
  if (launcherSlot) {
    launcherSlot.replaceChildren(panel);
  } else if (clearActionButton) {
    let resolvedActionStack = clearActionButton.parentElement;
    if (!resolvedActionStack?.classList?.contains("bim-viewer-action-stack")) {
      resolvedActionStack = root.createElement("div");
      resolvedActionStack.className = "bim-viewer-action-stack";
      clearActionButton.parentElement?.insertBefore(resolvedActionStack, clearActionButton);
      resolvedActionStack.appendChild(clearActionButton);
    }
    resolvedActionStack.appendChild(panel);
  } else {
    const insertBeforeTarget =
      host.querySelector(".geo-bim-mainrow") ||
      sourceCard ||
      host.firstElementChild ||
      null;
    host.insertBefore(panel, insertBeforeTarget);
  }

  const workspaceId = `bim-workspace-${moduleKey}`;
  const workspace = root.createElement("div");
  workspace.className = "bim-workspace";
  workspace.dataset.bimVisualModule = moduleKey;
  workspace.dataset.open = "false";
  workspace.hidden = true;
  workspace.innerHTML = createWorkspaceMarkup(workspaceId);
  root.body.appendChild(workspace);

  const launchButton = panel.querySelector<HTMLButtonElement>(".bim-viewer-launcher__button");
  const workspaceSurfaceEl = workspace.querySelector<HTMLElement>(".bim-workspace__surface");
  const workspaceCanvasEl = workspace.querySelector<HTMLElement>(".bim-workspace__canvas3d");
  const workspaceStageEl = workspace.querySelector<HTMLElement>(".bim-workspace__stage--3d");
  const workspaceEmptyEl = workspace.querySelector<HTMLElement>(".bim-workspace__empty3d");
  const workspaceHintEl = workspace.querySelector<HTMLElement>(".bim-workspace__hint");
  const workspaceDiagnosticsEl = workspace.querySelector<HTMLElement>(".bim-workspace__diagnostics");
  const workspaceDiagnosticWarningEl = workspace.querySelector<HTMLElement>(".bim-workspace__diagnostic-warning");
  const workspaceNormalizeButton = workspace.querySelector<HTMLButtonElement>("[data-bim-normalize-display]");
  const workspaceNormalizedBadgeEl = workspace.querySelector<HTMLElement>(".bim-workspace__normalized-badge");
  const workspaceLevelEl = workspace.querySelector<HTMLElement>(".bim-workspace__level");
  const workspaceFloorsEl = workspace.querySelector<HTMLElement>(".bim-workspace__floors");
  const workspaceInspectorTitleEl = workspace.querySelector<HTMLElement>(".bim-workspace__inspector-title");
  const workspaceInspectorMetaEl = workspace.querySelector<HTMLElement>(".bim-workspace__inspector-meta");
  const workspacePropertiesEl = workspace.querySelector<HTMLElement>(".bim-workspace__properties");
  const workspaceModeButtons = [...workspace.querySelectorAll<HTMLElement>("[data-bim-view-mode]")];
  const workspaceActionButtons = [...workspace.querySelectorAll<HTMLElement>("[data-bim-action]")];
  const mobileWorkspaceQuery = root.defaultView?.matchMedia?.("(max-width: 768px)") || null;

  function setWorkspaceInteractivity(isInteractive: boolean) {
    (workspace as HTMLElement & { inert?: boolean }).inert = !isInteractive;
    workspaceSurfaceEl?.setAttribute("aria-hidden", isInteractive ? "false" : "true");
  }

  function releaseWorkspaceFocus() {
    const activeElement = root.activeElement;
    if (!(activeElement instanceof HTMLElement) || !workspace.contains(activeElement)) return;
    if (launchButton && !launchButton.disabled && launchButton.isConnected) {
      launchButton.focus();
      return;
    }
    activeElement.blur();
  }

  let engine = null;
  let engineSignature = "";
  let workspaceOpen = false;
  let currentViewMode = "3d";
  let currentViewId = "";
  let currentIsolatedId = "";
  let lastAppliedMode = "";
  let lastAppliedViewId = "";
  let lastSyncedEngine = null;
  let currentBackgroundTheme = "dark";
  let renderNonce = 0;
  let activeRenderPromise = null;
  let queuedRender = false;
  let lastIfcAvailabilitySignature = "";
  let lastIfcAvailabilityState = false;
  let normalizationRequested = true;

  setWorkspaceInteractivity(false);

  function syncWorkspaceActionLabels() {
    const compact = Boolean(mobileWorkspaceQuery?.matches);
    workspace.dataset.viewport = compact ? "mobile" : "desktop";

    workspaceModeButtons.forEach((button) => {
      const mode = button.dataset.bimViewMode === "2d" ? "2d" : "3d";
      button.textContent = compact ? mode.toUpperCase() : mode === "2d" ? "2D план" : "3D модель";
      button.setAttribute("title", mode === "2d" ? "2D план" : "3D модель");
    });

    workspaceActionButtons.forEach((button) => {
      const action = String(button.dataset.bimAction || "").trim();
      const label = button.querySelector(".lg-btn__label");
      if (!label) return;

      if (action === "toggle-background") {
        label.textContent = compact ? "Фон" : currentBackgroundTheme === "dark" ? "Фон: тёмный" : "Фон: светлый";
        button.setAttribute("title", currentBackgroundTheme === "dark" ? "Фон: тёмный" : "Фон: светлый");
        return;
      }

      const labels = {
        "fit-all": compact ? "Fit" : "Fit ко всему",
        "fit-selected": compact ? "Фокус" : "Фокус на выбранном",
        isolate: compact ? "Изол." : "Изолировать",
        "show-all": compact ? "Все" : "Показать всё"
      } as Record<string, string>;

      const fullLabels = {
        "fit-all": "Fit ко всему",
        "fit-selected": "Фокус на выбранном",
        isolate: "Изолировать",
        "show-all": "Показать всё"
      } as Record<string, string>;

      label.textContent = labels[action] || label.textContent || "";
      button.setAttribute("title", fullLabels[action] || label.textContent || "");
    });
  }

  function syncBackgroundThemeUi() {
    workspaceStageEl?.setAttribute("data-bim-bg-theme", currentBackgroundTheme);
    const backgroundButton = workspace.querySelector('[data-bim-action="toggle-background"]');
    if (!backgroundButton) return;
    backgroundButton.setAttribute("aria-pressed", currentBackgroundTheme === "dark" ? "true" : "false");
    syncWorkspaceActionLabels();
  }

  syncBackgroundThemeUi();
  syncWorkspaceActionLabels();

  function isHostVisible() {
    if (!host?.isConnected) return false;
    const section = host.closest(".section");
    if (section && !section.classList.contains("active")) return false;
    return host.getClientRects().length > 0;
  }

  function setWorkspaceOpen(isOpen) {
    workspaceOpen = Boolean(isOpen);
    if (!workspaceOpen) {
      releaseWorkspaceFocus();
    }
    workspace.dataset.open = workspaceOpen ? "true" : "false";
    workspace.hidden = !workspaceOpen;
    setWorkspaceInteractivity(workspaceOpen);
    launchButton?.setAttribute("aria-expanded", workspaceOpen ? "true" : "false");
    root.body?.classList?.toggle?.("bim-workspace-open", workspaceOpen);
    if (workspaceOpen) {
      currentIsolatedId = "";
      lastAppliedMode = "";
      lastAppliedViewId = "";
      lastSyncedEngine = null;
      void engine?.showAll?.();
      void api.render();
    } else {
      renderNonce += 1;
      currentIsolatedId = "";
      void engine?.showAll?.();
    }
  }

  function updateModeButtons() {
    workspace.dataset.viewMode = currentViewMode;
    workspaceModeButtons.forEach((button) => {
      const isActive = button.dataset.bimViewMode === currentViewMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    syncWorkspaceActionLabels();
  }

  function setViewportMessage(message = "") {
    const text = String(message || "").trim();
    workspaceEmptyEl.textContent = text;
    workspaceEmptyEl.hidden = !text;
  }

  function syncViewerDiagnosticsUi(engineInstance = engine) {
    const summary = engineInstance?.diagnosticSummary || null;
    const normalization = engineInstance?.viewerNormalization || null;
    const canNormalize = Boolean(normalization?.decision?.shouldNormalize);
    const shouldWarn = shouldShowIfcCoordinateWarning(summary) || canNormalize;
    const normalized = Boolean(normalization?.normalized);
    const hasElementDisplayRepair = Number(normalization?.displayRepair?.correctedCount || 0) > 0;
    const normalizedStatus = hasElementDisplayRepair ? "Применена коррекция отображения элементов" : "";
    const showNormalizeButton = Boolean(shouldWarn && !normalized);

    if (workspaceDiagnosticsEl) {
      workspaceDiagnosticsEl.hidden = !shouldWarn && !normalized;
    }
    if (workspaceDiagnosticWarningEl) {
      workspaceDiagnosticWarningEl.textContent = normalizedStatus || (shouldWarn ? IFC_NANOCAD_WARNING_MESSAGE : "");
      workspaceDiagnosticWarningEl.hidden = !shouldWarn && !normalizedStatus;
    }
    if (workspaceNormalizeButton) {
      workspaceNormalizeButton.hidden = !showNormalizeButton;
      workspaceNormalizeButton.disabled = !showNormalizeButton;
      workspaceNormalizeButton.setAttribute("aria-pressed", normalized ? "true" : "false");
      const label = workspaceNormalizeButton.querySelector(".lg-btn__label");
      if (label) {
        label.textContent = "Исправить отображение модели";
      }
    }
    if (workspaceNormalizedBadgeEl) {
      workspaceNormalizedBadgeEl.hidden = !normalized;
    }
  }

  function updateInspector(element, floorLabel = "") {
    if (element) {
      workspaceInspectorTitleEl.textContent = getElementLabel(element, labelBuilder);
      const metaParts = [];
      if (element.floor) metaParts.push(`Этаж: ${element.floor}`);
      if (element.resolvedAxes || element.axes) metaParts.push(`Оси: ${element.resolvedAxes || element.axes}`);
      if (element.ifcGuid) metaParts.push(`GUID: ${element.ifcGuid}`);
      workspaceInspectorMetaEl.textContent =
        metaParts.join(" • ") ||
        "Свойства BIM-элемента синхронизированы с текущей формой контроля.";
      workspacePropertiesEl.innerHTML = buildPropertiesHtml(element, labelBuilder);
      if (mobileWorkspaceQuery?.matches && workspaceSurfaceEl) {
        window.requestAnimationFrame(() => {
          const inspectorEl = workspacePropertiesEl.closest(".bim-workspace__inspector");
          if (!(inspectorEl instanceof HTMLElement)) return;
          const inspectorRect = inspectorEl.getBoundingClientRect();
          const surfaceRect = workspaceSurfaceEl.getBoundingClientRect();
          if (inspectorRect.bottom > surfaceRect.bottom - 24) {
            inspectorEl.scrollIntoView({
              block: "end",
              behavior: "smooth"
            });
          }
        });
      }
      return;
    }

    if (currentViewMode === "2d" && floorLabel) {
      workspaceInspectorTitleEl.textContent = `План уровня ${floorLabel}`;
      workspaceInspectorMetaEl.textContent = "Кликните по элементу на плане, чтобы выбрать BIM и подтянуть данные в форму.";
    } else {
      workspaceInspectorTitleEl.textContent = "BIM-элемент не выбран";
      workspaceInspectorMetaEl.textContent = "Кликните по модели, чтобы выбрать IFC-элемент и синхронизировать его с формой.";
    }
    workspacePropertiesEl.innerHTML = buildPropertiesHtml(null, labelBuilder);
  }

  async function destroyEngine() {
    if (!engine) return;
    try {
      engine.dispose();
    } catch (error) {
      console.warn("[BIM viewer] engine dispose failed", error);
    }
    engine = null;
    engineSignature = "";
    currentViewId = "";
    lastAppliedMode = "";
    lastAppliedViewId = "";
    lastSyncedEngine = null;
    syncViewerDiagnosticsUi(null);
  }

  async function ensureEngine(projectId, sourceModelIds, allElements, nonce) {
    const nextSignature = `${projectId || ""}::${sourceModelIds.join(",")}`;
    if (engine && engineSignature === nextSignature) {
      return engine;
    }

    await destroyEngine();
    setViewportMessage("Подготавливаю IFC/BIM viewer...");

    const nextEngine = await createIfcLiteEngine({
      container: workspaceCanvasEl,
      projectId,
      sourceModelIds,
      getCurrentIfcFile,
      allElements,
      onUserSelection(modelIdMap) {
        const allElements = typeof getAllElements === "function" ? getAllElements() : getFilteredElements();
        const found = findElementByModelIdMap(modelIdMap, buildElementIndex(allElements));
        if (found) {
          const nextSelectedId = getElementKey(found);
          onSelect(nextSelectedId);
          window.setTimeout(() => {
            if (typeof getSelectedId === "function" && String(getSelectedId() || "").trim() === nextSelectedId) {
              void api.render();
            }
          }, 0);
        }
      }
    });

    if (nonce !== renderNonce) {
      nextEngine.dispose();
      return null;
    }

    engine = nextEngine;
    engineSignature = nextSignature;
    engine.setBackgroundTheme(currentBackgroundTheme);
    engine.setViewerNormalization?.(normalizationRequested);
    syncViewerDiagnosticsUi(engine);
    return engine;
  }

  async function syncCurrentMode(engineInstance, floorEntries, selectedElement, allElements, allMap, selectedMap) {
    const nextViewId = pickViewId({
      currentViewId,
      selectedElement,
      floorEntries
    });
    const engineChanged = lastSyncedEngine !== engineInstance;
    const modeChanged = lastAppliedMode !== currentViewMode;
    const floorChanged = currentViewMode === "2d" && lastAppliedViewId !== nextViewId;

    currentViewId = nextViewId;
    updateModeButtons();

    if (currentViewMode === "2d") {
      workspaceHintEl.textContent = "2D режим показывает выбранный этаж в ортопроекции и скрывает остальные элементы модели.";
      if (!floorEntries.length) {
        setViewportMessage("В текущем IFC не найдены BIM-элементы с корректной привязкой к этажам.");
        return;
      }

      const activeFloorEntry = getFloorEntryById(floorEntries, nextViewId);
      const floorMap = filterModelIdMap(
        buildFloorModelIdMap(nextViewId, allElements),
        engineInstance.loadedModelIds
      );
      const shouldOpenFloorView = engineChanged || modeChanged || floorChanged || engineInstance.currentViewId !== nextViewId;
      if (shouldOpenFloorView) {
        const opened = await engineInstance.openView(nextViewId, { modelIdMap: floorMap });
        if (!opened) {
          setViewportMessage("Не удалось построить план выбранного этажа по BIM-элементам модели.");
          return;
        }
      }

      workspaceLevelEl.textContent = activeFloorEntry?.label || "План";
      setViewportMessage("");
      if (selectedMap && hasModelIdMapEntries(selectedMap)) {
        await engineInstance.setSelected(selectedMap, { zoom: false });
      }
      lastAppliedMode = currentViewMode;
      lastAppliedViewId = nextViewId;
      lastSyncedEngine = engineInstance;
      return;
    }

    engineInstance.closeViews();
    engineInstance.setViewerNormalization?.(normalizationRequested);
    syncViewerDiagnosticsUi(engineInstance);
    workspaceHintEl.textContent = "3D режим показывает BIM-модель проекта, собранную из IFC-элементов. Доступны orbit, pan, zoom, isolate и fit.";
    workspaceLevelEl.textContent = "3D модель";
    setViewportMessage("");
    await engineInstance.world.camera.projection.set("Perspective");
    engineInstance.world.camera.set("Orbit");
    if (engineChanged || modeChanged) {
      if (currentIsolatedId) {
        await engineInstance.isolate(selectedMap);
      } else {
        await engineInstance.showAll();
        const fitted = await engineInstance.fitAll(allMap);
        if (!fitted) {
          await engineInstance.fitWorld();
        }
      }
    }
    lastAppliedMode = currentViewMode;
    lastAppliedViewId = "";
    lastSyncedEngine = engineInstance;
  }

  async function renderInternal() {
    const nonce = ++renderNonce;
    const projectId = typeof getCurrentProjectId === "function" ? String(getCurrentProjectId() || "").trim() : "";
    const allElements = typeof getAllElements === "function" ? getAllElements() : getFilteredElements();
    const filteredElements = getFilteredElements();
    const selectedElement = typeof getSelectedElement === "function" ? getSelectedElement() : null;
    const selectedId = typeof getSelectedId === "function" ? String(getSelectedId() || "").trim() : "";
    const sourceModelIds = getUniqueSourceModelIds(allElements);
    const visible = isHostVisible();

    panel.hidden = !visible;
    if (!visible && workspaceOpen) {
      setWorkspaceOpen(false);
      return;
    }

    const hasProject = Boolean(projectId);
    const hasElements = Array.isArray(allElements) && allElements.length > 0;
    let hasIfcSource = false;

    if (hasProject && hasElements) {
      const availabilitySignature = `${projectId}::${sourceModelIds.join(",")}`;
      if (availabilitySignature === lastIfcAvailabilitySignature) {
        hasIfcSource = lastIfcAvailabilityState;
      } else {
        hasIfcSource = await hasAvailableIfcSource({
          projectId,
          sourceModelIds,
          getCurrentIfcFile
        });
        if (nonce !== renderNonce) return;
        lastIfcAvailabilitySignature = availabilitySignature;
        lastIfcAvailabilityState = hasIfcSource;
      }
    } else {
      lastIfcAvailabilitySignature = "";
      lastIfcAvailabilityState = false;
    }

    launchButton.disabled = !hasProject || !hasElements || !hasIfcSource;
    if (!hasProject) {
      setViewportMessage("Сначала выберите объект проекта, чтобы открыть BIM-viewer.");
      updateInspector(null, "");
      workspaceFloorsEl.innerHTML = "";
      workspaceLevelEl.textContent = "Уровень";
      await destroyEngine();
      return;
    }

    if (!hasElements) {
      setViewportMessage("Импортируйте IFC, чтобы открыть полноценный 2D/3D BIM-viewer.");
      updateInspector(null, "");
      workspaceFloorsEl.innerHTML = "";
      workspaceLevelEl.textContent = "Уровень";
      await destroyEngine();
      return;
    }

    if (!hasIfcSource) {
      setViewportMessage("IFC-файл не загружен и не найден в кэше проекта. BIM-viewer пока нечего открывать.");
      updateInspector(selectedElement, "");
      workspaceFloorsEl.innerHTML = "";
      workspaceLevelEl.textContent = "Уровень";
      await destroyEngine();
      return;
    }

    if (!workspaceOpen) {
      setViewportMessage("");
      updateInspector(selectedElement, "");
      workspaceFloorsEl.innerHTML = "";
      workspaceLevelEl.textContent = "Уровень";
      return;
    }

    const engineInstance = await ensureEngine(projectId, sourceModelIds, allElements, nonce);
    if (!engineInstance || nonce !== renderNonce) {
      return;
    }
    syncViewerDiagnosticsUi(engineInstance);

    const loadedModelIds = engineInstance.loadedModelIds;
    const selectableMap = filterModelIdMap(buildModelIdMapForElements(allElements), loadedModelIds);
    const allMap = filterModelIdMap(buildModelIdMapForElements(allElements), loadedModelIds);
    const selectedMap = filterModelIdMap(
      buildModelIdMapForElement(selectedElement) || createModelIdMap(),
      loadedModelIds
    );
    const floorEntries = buildFloorEntries(allElements);

    await engineInstance.setSelectable(selectableMap);
    workspaceFloorsEl.innerHTML = buildFloorChipsHtml(floorEntries, currentViewId);

    if (engineInstance.loadedModelIds.size === 0) {
      const missingText = engineInstance.missingSources.length
        ? `Для viewer не найден IFC-файл модели: ${engineInstance.missingSources.join(", ")}. Выберите исходный IFC снова и переимпортируйте его.`
        : "Не удалось загрузить IFC-файл для viewer.";
      setViewportMessage(missingText);
      updateInspector(selectedElement, "");
      return;
    }

    if (engineInstance.missingSources.length > 0) {
      setViewportMessage(`Часть моделей не найдена локально: ${engineInstance.missingSources.join(", ")}. Загружены доступные IFC.`);
    } else {
      setViewportMessage("");
    }

    await syncCurrentMode(engineInstance, floorEntries, selectedElement, allElements, allMap, selectedMap);
    if (selectedId && hasModelIdMapEntries(selectedMap)) {
      await engineInstance.setSelected(selectedMap, { zoom: false });
    } else {
      await engineInstance.setSelected(createModelIdMap(), { zoom: false });
    }

    const activeFloor = floorEntries.find((entry) => entry.id === currentViewId)?.label || "";
    updateInspector(selectedElement, activeFloor);
  }

  workspaceFloorsEl?.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("[data-bim-floor-key]")
      : null;
    if (!target) return;
    currentViewId = String(target.getAttribute("data-bim-floor-key") || "").trim();
    currentViewMode = "2d";
    currentIsolatedId = "";
    void api.render();
  });

  workspaceModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentViewMode = button.dataset.bimViewMode === "3d" ? "3d" : "2d";
      currentIsolatedId = "";
      void api.render();
    });
  });

  workspaceNormalizeButton?.addEventListener("click", async () => {
    try {
      if (!engine) {
        await api.render();
      }
      if (!engine) return;
      if (engine.viewerNormalization?.normalized) {
        syncViewerDiagnosticsUi(engine);
        return;
      }

      normalizationRequested = true;
      const normalized = engine.setViewerNormalization?.(normalizationRequested);
      normalizationRequested = Boolean(normalized);
      syncViewerDiagnosticsUi(engine);

      if (currentViewMode === "3d") {
        await engine.showAll();
        const allElements = typeof getAllElements === "function" ? getAllElements() : getFilteredElements();
        const allMap = filterModelIdMap(buildModelIdMapForElements(allElements), engine.loadedModelIds);
        const fitted = await engine.fitAll(allMap);
        if (!fitted) {
          await engine.fitWorld();
        }
      }
    } catch (error) {
      console.error("[BIM viewer] display normalization failed", error);
      setViewportMessage("Не удалось применить нормализацию отображения. Проверьте консоль браузера.");
    }
  });

  workspaceActionButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        if (!engine) {
          await api.render();
        }
        if (!engine) return;

        const allElements = typeof getAllElements === "function" ? getAllElements() : getFilteredElements();
        const selectedElement = typeof getSelectedElement === "function" ? getSelectedElement() : null;
        const floorEntries = buildFloorEntries(allElements);
        const currentFloorEntry = getFloorEntryById(floorEntries, currentViewId);
        const currentFloorMap = filterModelIdMap(
          buildFloorModelIdMap(currentViewId, allElements),
          engine.loadedModelIds
        );
        const selectableMap = filterModelIdMap(buildModelIdMapForElements(allElements), engine.loadedModelIds);
        const allMap = filterModelIdMap(buildModelIdMapForElements(allElements), engine.loadedModelIds);
        const selectedMap = filterModelIdMap(
          buildModelIdMapForElement(selectedElement) || createModelIdMap(),
          engine.loadedModelIds
        );
        const action = button.dataset.bimAction;

        if (action === "toggle-background") {
          currentBackgroundTheme = currentBackgroundTheme === "dark" ? "light" : "dark";
          syncBackgroundThemeUi();
          engine.setBackgroundTheme(currentBackgroundTheme);
          return;
        }

        if (action === "fit-all") {
          currentIsolatedId = "";
          await engine.showAll();
          if (currentViewMode === "2d" && currentViewId && hasModelIdMapEntries(currentFloorMap)) {
            await engine.openView(currentViewId, { modelIdMap: currentFloorMap });
            workspaceLevelEl.textContent = currentFloorEntry?.label || "План";
          } else {
            const fitted = await engine.fitAll(hasModelIdMapEntries(selectableMap) ? selectableMap : allMap);
            if (!fitted) {
              await engine.fitWorld();
            }
          }
          return;
        }

        if (action === "fit-selected") {
          if (!hasModelIdMapEntries(selectedMap)) return;
          currentIsolatedId = "";
          await engine.zoomTo(selectedMap);
          return;
        }

        if (action === "isolate") {
          if (!hasModelIdMapEntries(selectedMap)) return;
          currentIsolatedId = getElementKey(selectedElement);
          await engine.isolate(selectedMap);
          if (currentViewMode === "3d") {
            await engine.zoomTo(selectedMap);
          }
          return;
        }

        if (action === "show-all") {
          currentIsolatedId = "";
          await engine.showAll();
          if (currentViewMode === "2d" && currentViewId && hasModelIdMapEntries(currentFloorMap)) {
            await engine.openView(currentViewId, { modelIdMap: currentFloorMap });
            workspaceLevelEl.textContent = currentFloorEntry?.label || "План";
          } else {
            const fitted = await engine.fitAll(hasModelIdMapEntries(selectableMap) ? selectableMap : allMap);
            if (!fitted) {
              await engine.fitWorld();
            }
          }
        }
      } catch (error) {
        console.error(`[BIM viewer] action ${button.dataset.bimAction || "unknown"} failed`, error);
        setViewportMessage("Команда viewer завершилась с ошибкой. Проверьте консоль браузера.");
      }
    });
  });

  workspace.querySelectorAll("[data-bim-workspace-close]").forEach((button) => {
    button.addEventListener("click", () => {
      setWorkspaceOpen(false);
    });
  });

  launchButton?.addEventListener("click", () => {
    setWorkspaceOpen(!workspaceOpen);
  });

  mobileWorkspaceQuery?.addEventListener?.("change", () => {
    syncWorkspaceActionLabels();
    void api.render();
  });

  root.defaultView?.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && workspaceOpen) {
      setWorkspaceOpen(false);
    }
  });

  const api = {
    open() {
      setWorkspaceOpen(true);
    },
    close() {
      setWorkspaceOpen(false);
    },
    toggle() {
      setWorkspaceOpen(!workspaceOpen);
    },
    async render() {
      queuedRender = true;
      if (activeRenderPromise) {
        return activeRenderPromise;
      }

      activeRenderPromise = (async () => {
        while (queuedRender) {
          queuedRender = false;
          try {
            await renderInternal();
          } catch (error) {
            console.error("[BIM viewer] render failed", error);
            setViewportMessage("BIM-viewer временно недоступен. Проверьте IFC-файл и консоль браузера.");
          }
        }
      })();

      try {
        await activeRenderPromise;
      } finally {
        activeRenderPromise = null;
      }
    },
    async debug() {
      if (!engine) {
        await this.render();
      }
      return engine?.getDebugSnapshot?.() || null;
    },
    async destroy() {
      await destroyEngine();
      workspace.remove();
      panel.remove();
    }
  };

  panel.__thatopenBimApi = api;
  void api.render();
  return api;
}
