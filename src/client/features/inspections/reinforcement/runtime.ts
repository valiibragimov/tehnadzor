import { TOLERANCES } from "../../../config.js";
import {
  getConstructionEntityLabels,
  getConstructionLabel
} from "../../../app/construction.js";
import { getInspectionToleranceValue } from "../../../app/inspection-registry.js";
import {
  buildNodeDeleteIconButton,
  setupNodeCardInteractions
} from "../../../app/ui/node-card-interactions.js";
import {
  renderRegulatoryBasisHtml
} from "../../../app/services/regulatory-basis.js";
import {
  checkStrictMatch,
  checkTolerance,
  escapeHtml,
  formatCheckResult,
  parseDecimal,
  sanitizeHtml,
  validateRequiredField
} from "../../../utils.js";
import {
  buildReinforcementJournalPayload,
  evaluateReinforcementCheck
} from "./evaluation.js";
import {
  createReinforcementForm,
  isSameReinforcementLocation,
  type ReinforcementBimFormApi,
  type ReinforcementForm
} from "./form.js";
import {
  createReinforcementRowsRuntime,
  type ReinforcementRowsRuntime
} from "./rows-runtime.js";
import type { ReinforcementDomBindings } from "./dom.js";
import type { ReinforcementService } from "./service.js";
import type {
  ReinforcementCheckRecord,
  ReinforcementMeasurements,
  ReinforcementState
} from "./types.js";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ReinforcementBimRuntimeApi
  extends ReinforcementBimFormApi {
  initBindings(): void;
  loadElements(projectId?: string | null): Promise<void>;
  renderVisualPanel(): void;
  getMark(): string | null;
  setFieldAutofilled(
    field: HTMLInputElement | null,
    isAutofilled: boolean
  ): void;
}

export interface ReinforcementRuntimeDependencies {
  state: ReinforcementState;
  service: ReinforcementService;
  dom: ReinforcementDomBindings;
  bim: ReinforcementBimRuntimeApi;
  inspectionState: Record<string, boolean>;
  inspectionChecked: Record<string, boolean>;
  storage: StorageLike;
  storageKey: string;
  getCurrentProjectId(): string | null;
  validateProject(projectId: string | null): boolean;
  setConstruction(
    construction: string,
    subtype?: string,
    pileElement?: string
  ): unknown;
  notify(message: string, tone?: string): void;
  confirm(message: string): boolean | Promise<boolean>;
  updateSummary(): unknown;
  addJournalEntry(payload: Record<string, unknown>): unknown;
  upsertJournalEntry(payload: Record<string, unknown>): unknown;
  notifyFirestoreSyncStatus(docRef: unknown): unknown;
}

function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function safe(value: unknown) {
  return escapeHtml(value == null ? "" : String(value));
}

function getRowsForCheck(check: ReinforcementCheckRecord) {
  return check.columns || check.beams || check.walls || null;
}

interface ReinforcementMeasurementResult {
  name: string;
  ok: boolean;
  html: string;
  regulatoryDoc: string;
}

function metricResult(
  name: string,
  project: unknown,
  actual: unknown,
  tolerance: number | null,
  regulatoryDoc: string
): ReinforcementMeasurementResult | null {
  const projectValue = parseDecimal(project);
  const actualValue = parseDecimal(actual);
  if (projectValue == null || actualValue == null) return null;
  const comparison = tolerance == null
    ? checkStrictMatch(actualValue, projectValue)
    : checkTolerance(actualValue, projectValue, tolerance);
  return {
    name,
    ok: comparison.ok,
    regulatoryDoc,
    html: formatCheckResult({
      parameterName: name,
      actual: actualValue,
      project: projectValue,
      tolerance,
      unit: "мм",
      regulatoryDoc,
      isStrict: tolerance == null
    })
  };
}

export function buildReinforcementMeasurementResults(
  measurements: ReinforcementMeasurements,
  includeHoops: boolean,
  construction: string,
  subtype: string
) {
  const stepTolerance = getInspectionToleranceValue(
    construction,
    "reinforcement",
    "rebarStep",
    TOLERANCES.STEP,
    subtype
  );
  const coverTolerance = getInspectionToleranceValue(
    construction,
    "reinforcement",
    "rebarCover",
    TOLERANCES.COVER,
    subtype
  );
  const hoopsTolerance = getInspectionToleranceValue(
    construction,
    "reinforcement",
    "hoopsStep",
    TOLERANCES.HOOPS_STEP,
    subtype
  );
  const results = [
    metricResult(
      "Диаметр арматуры",
      measurements.projDia,
      measurements.factDia,
      null,
      "GOST_R_57997_2017"
    ),
    metricResult(
      "Шаг арматуры",
      measurements.projStep,
      measurements.factStep,
      stepTolerance,
      "GOST_R_57997_2017"
    ),
    metricResult(
      "Защитный слой",
      measurements.projCover,
      measurements.factCover,
      coverTolerance,
      "SP_70_13330_2012"
    )
  ];
  if (includeHoops) {
    results.push(metricResult(
      "Шаг хомутов",
      measurements.projHoopsStep,
      measurements.factHoopsStep,
      hoopsTolerance,
      "GOST_R_57997_2017"
    ));
  }
  return results.filter(
    (result): result is ReinforcementMeasurementResult =>
      Boolean(result)
  );
}

export function createReinforcementRuntime(
  dependencies: ReinforcementRuntimeDependencies
) {
  const {
    state,
    service,
    dom,
    bim,
    inspectionState,
    inspectionChecked,
    storage,
    storageKey,
    getCurrentProjectId,
    validateProject,
    setConstruction,
    notify,
    confirm,
    updateSummary,
    addJournalEntry,
    upsertJournalEntry,
    notifyFirestoreSyncStatus
  } = dependencies;
  let initialized = false;
  let skipJournalOnce = false;
  let form: ReinforcementForm;
  let rows: ReinforcementRowsRuntime;

  rows = createReinforcementRowsRuntime({
    state,
    dom,
    storage,
    getCurrentProjectId,
    getConstructionKey: () => form?.getSelectedConstructionKey() || "",
    getConstructionSubtype: () =>
      form?.getSelectedConstructionSubtype() || "",
    getConstructionFlags: () => form.getConstructionFlags(),
    getBimMark: bim.getMark,
    setBimFieldAutofilled: bim.setFieldAutofilled,
    notify
  });
  form = createReinforcementForm({
    state,
    dom,
    bim,
    rows,
    inspectionState,
    inspectionChecked,
    notify,
    setConstruction
  });

  function projectStorageKey() {
    return `${storageKey}_${getCurrentProjectId() || "no_project"}`;
  }

  function saveLocalChecks() {
    storage.setItem(
      projectStorageKey(),
      JSON.stringify(Array.from(state.checks.entries()))
    );
  }

  async function loadChecks() {
    state.checks.clear();
    const projectId = getCurrentProjectId();
    await bim.loadElements(projectId);
    if (!projectId) return;
    try {
      const loaded = await service.loadChecks(projectId);
      loaded.forEach((check, id) => state.checks.set(id, check));
      saveLocalChecks();
    } catch (error) {
      console.error(
        "[loadReinfChecks] Ошибка загрузки из Firestore:",
        error
      );
      const raw = storage.getItem(projectStorageKey());
      if (!raw) return;
      try {
        const entries = JSON.parse(raw);
        entries.forEach(
          ([id, check]: [string, ReinforcementCheckRecord]) =>
            state.checks.set(id, check)
        );
      } catch (parseError) {
        console.warn(
          "[loadReinfChecks] Ошибка парсинга localStorage:",
          parseError
        );
      }
    }
  }

  function checkLocationInfo(check: ReinforcementCheckRecord) {
    if (check.columns) {
      const markings = check.columns
        .map((item) => safe(item.marking))
        .filter(Boolean)
        .join(", ");
      return `<div class="node-data-row"><span class="node-label">Колонн:</span><span class="node-values"><strong>${check.columns.length} шт.</strong>${markings ? ` (${markings})` : ""}</span></div>`;
    }
    if (check.beams) {
      const markings = check.beams
        .map((item) => safe(item.marking))
        .filter(Boolean)
        .join(", ");
      return `<div class="node-data-row"><span class="node-label">Балок:</span><span class="node-values"><strong>${check.beams.length} шт.</strong>${markings ? ` (${markings})` : ""}</span></div>`;
    }
    if (check.walls) {
      const labels = getConstructionEntityLabels(
        String(check.construction || check.constructionType || ""),
        "reinforcement",
        String(check.constructionSubtype || "")
      );
      const title =
        labels.pluralGenitive.charAt(0).toLocaleUpperCase("ru") +
        labels.pluralGenitive.slice(1);
      return `<div class="node-data-row"><span class="node-label">${safe(title)}:</span><span class="node-values"><strong>${check.walls.length} шт.</strong></span></div>`;
    }
    if (check.location) {
      const stair = check.stairName ? `${safe(check.stairName)}, ` : "";
      const floor = check.floor ? `Этаж ${safe(check.floor)}, ` : "";
      return `<div class="node-data-row"><span class="node-label">Местоположение:</span><span class="node-values">${stair}${floor}${safe(check.location)}</span></div>`;
    }
    return "";
  }

  function renderChecks() {
    const list = dom.reinfChecksList;
    if (!list) return;
    list.innerHTML = "";
    if (!state.checks.size) {
      list.innerHTML =
        '<div class="caption" style="padding:10px">Пока нет сохранённых проверок. Заполните форму и нажмите «Сохранить проверку».</div>';
      return;
    }
    const items = [...state.checks.entries()].sort(
      (left, right) =>
        Number(right[1].createdAt || 0) -
        Number(left[1].createdAt || 0)
    );
    items.forEach(([id, check]) => {
      const evaluation = check.status
        ? {
          status: check.status,
          summaryText: check.summaryText || ""
        }
        : evaluateReinforcementCheck(check);
      const status = evaluation.status || "empty";
      const statusLabel = status === "ok"
        ? "В норме"
        : status === "exceeded"
          ? "Есть отклонения"
          : "Не заполнено";
      const statusClass = status === "ok"
        ? "status-ok"
        : status === "exceeded"
          ? "status-bad"
          : "status-empty";
      const row = dom.document.createElement("div");
      row.className = "node node-enhanced";
      row.innerHTML = `
        <div class="node-main">
          <div class="node-header">
            <div class="node-title">
              <span class="node-icon">🔧</span>
              Проверка от ${formatDate(Number(check.createdAt || Date.now()))}
            </div>
            <div class="node-header-controls">
              <span class="status-tag ${statusClass}">${statusLabel}</span>
              ${buildNodeDeleteIconButton("Удалить проверку")}
            </div>
          </div>
          <div class="node-data">
            ${check.floor ? `<div class="node-data-row"><span class="node-label">Этаж:</span><span class="node-values">${safe(check.floor)}</span></div>` : ""}
            ${checkLocationInfo(check)}
          </div>
        </div>`;
      setupNodeCardInteractions(row, {
        onOpen: () => loadCheck(id),
        onDelete: async () => {
          if (!(await confirm("Удалить эту проверку?"))) return;
          const projectId = getCurrentProjectId();
          if (projectId) await service.deleteCheck(projectId, id);
          state.checks.delete(id);
          if (state.currentCheckId === id) state.currentCheckId = null;
          saveLocalChecks();
          renderChecks();
          updateSummary();
        }
      });
      list.appendChild(row);
    });
  }

  function loadCheck(id: string) {
    const check = state.checks.get(id);
    if (!check) return;
    form.restoreCheck({ ...check, id });
  }

  function renderRunResult(check: ReinforcementCheckRecord) {
    const construction = String(
      check.construction || check.constructionType || ""
    );
    const subtype = String(check.constructionSubtype || "");
    const rowsForCheck = getRowsForCheck(check);
    const includeHoops = Boolean(check.columns);
    const groups = rowsForCheck || [check];
    const rendered = groups.map((item, index) => {
      const results = buildReinforcementMeasurementResults(
        item,
        includeHoops,
        construction,
        subtype
      );
      if (!results.length) return "";
      const marking = String(item.marking || "").trim();
      const title = rowsForCheck
        ? `<div class="check-group-title">${safe(marking || `Элемент ${index + 1}`)}</div>`
        : "";
      return `${title}${results.map((result) => result.html).join("")}`;
    }).filter(Boolean);
    const evaluation = evaluateReinforcementCheck(check);
    const anyCheck = rendered.length > 0;
    const allOk = evaluation.status === "ok";
    if (dom.reinfResult) {
      dom.reinfResult.className = `result ${anyCheck ? (allOk ? "ok" : "not-ok") : ""}`;
      dom.reinfResult.innerHTML = sanitizeHtml(
        anyCheck
          ? `
            ${rendered.join("")}
            <b style="margin-top: 12px; display: block;">
              ${
                allOk
                  ? "Армирование соответствует проекту и нормативным требованиям."
                  : "Есть несоответствия, требуется корректировка."
              }
            </b>
            ${renderRegulatoryBasisHtml({
              moduleKey: "reinforcement",
              checkKind: construction || "default",
              subtype,
              helpTargetId: "reinfHelpContent"
            })}
          `
          : "Заполните проектные и фактические значения для проверки."
      );
    }
    inspectionState.reinforcement = anyCheck && allOk;
    inspectionChecked.reinforcement = anyCheck;
    return { evaluation, anyCheck, allOk };
  }

  async function runCheck() {
    const projectId = getCurrentProjectId();
    if (!validateProject(projectId)) return;
    const flags = form.getConstructionFlags();
    if (flags.isUnsupported) {
      form.setUnsupportedState({ notify: true });
      return;
    }
    if (flags.isColumn && !state.columns.length) {
      if (dom.reinfResult) {
        dom.reinfResult.className = "result";
        dom.reinfResult.textContent =
          "Добавьте хотя бы одну колонну для проверки.";
      }
      inspectionState.reinforcement = false;
      inspectionChecked.reinforcement = false;
      return;
    }
    if (flags.isBeam && !state.beams.length) {
      if (dom.reinfResult) {
        dom.reinfResult.className = "result";
        dom.reinfResult.textContent =
          "Добавьте хотя бы одну балку для проверки.";
      }
      inspectionState.reinforcement = false;
      inspectionChecked.reinforcement = false;
      return;
    }
    if (flags.isWall && !state.walls.length) {
      if (dom.reinfResult) {
        dom.reinfResult.className = "result";
        dom.reinfResult.textContent =
          "Добавьте хотя бы одну стену для проверки.";
      }
      inspectionState.reinforcement = false;
      inspectionChecked.reinforcement = false;
      return;
    }
    const check = form.readCheck(
      state.currentCheckId
        ? state.checks.get(state.currentCheckId) || null
        : null
    );
    const result = renderRunResult(check);
    if (result.anyCheck) {
      await addJournalEntry({
        ...buildReinforcementJournalPayload(check),
        status: result.allOk ? "ok" : "exceeded"
      });
      skipJournalOnce = true;
    }
    await saveCheck({ skipJournalOnce: result.anyCheck });
    updateSummary();
  }

  function requiresFloor(flags: ReturnType<typeof form.getConstructionFlags>) {
    if (flags.behavior.floorRequired === false) return null;
    if (flags.isPlate || flags.isStair) return dom.reinfFloorEl;
    if (flags.isColumn) return dom.reinfColumnFloorEl;
    if (flags.isBeam) return dom.reinfBeamFloorEl;
    if (flags.isWall) return dom.reinfWallFloorEl;
    return null;
  }

  async function saveCheck(
    { skipJournalOnce: skipJournalOption = false } = {}
  ) {
    const projectId = getCurrentProjectId();
    if (!validateProject(projectId) || !projectId) return;
    const flags = form.getConstructionFlags();
    if (flags.isUnsupported) {
      form.setUnsupportedState({ notify: true });
      return;
    }
    const floor = requiresFloor(flags);
    if (floor && !validateRequiredField(floor, "Этаж")) return;
    const currentId = state.currentCheckId;
    const current = currentId
      ? state.checks.get(currentId) || null
      : null;
    const candidate = form.readCheck(current);
    const usesLocation = flags.isPlate || flags.isStair;
    const existing =
      current &&
      (!usesLocation || isSameReinforcementLocation(current, candidate))
        ? current
        : null;
    const provisionalId = existing
      ? String(currentId)
      : `chk_${Date.now()}`;
    const evaluation = evaluateReinforcementCheck(candidate);
    candidate.status = evaluation.status;
    candidate.summaryText = evaluation.summaryText;
    candidate.lastMsg = dom.reinfResult?.innerHTML || "";
    candidate.projectId = projectId;
    candidate.module = "reinforcement";
    candidate.createdAt = existing?.createdAt || candidate.createdAt ||
      Date.now();

    state.checks.set(provisionalId, candidate);
    saveLocalChecks();
    renderChecks();
    const skipJournal =
      skipJournalOption || skipJournalOnce;
    skipJournalOnce = false;
    try {
      const result = existing
        ? await service.updateCheck(projectId, provisionalId, candidate)
        : await service.createCheck(projectId, candidate);
      const finalId = result.id;
      notifyFirestoreSyncStatus(result.ref);
      if (finalId !== provisionalId) {
        state.checks.delete(provisionalId);
        state.checks.set(finalId, { ...candidate, id: finalId });
        saveLocalChecks();
        renderChecks();
      }
      state.currentCheckId = finalId;
      if (!skipJournal && candidate.status !== "empty") {
        await upsertJournalEntry(
          buildReinforcementJournalPayload(candidate, finalId)
        );
      }
    } catch (error) {
      console.error(
        "[btnSaveReinfCheck] Ошибка сохранения в Firestore:",
        error
      );
      notify("Ошибка сохранения в Firestore.", "error");
    }
    updateSummary();
  }

  function clearForm() {
    form.clear();
    const projectId = getCurrentProjectId();
    if (
      projectId &&
      form.getConstructionFlags().isWall
    ) {
      storage.removeItem(`draft_reinf_walls_${projectId}`);
    }
  }

  async function clearChecks() {
    if (!(
      await confirm(
        "Удалить все сохранённые проверки армирования для текущего проекта?"
      )
    )) return;
    const projectId = getCurrentProjectId();
    if (!projectId) {
      notify(
        "Сначала создайте объект или выберите существующий.",
        "warning"
      );
      return;
    }
    try {
      await service.clearChecks(projectId);
      state.checks.clear();
      state.currentCheckId = null;
      saveLocalChecks();
      renderChecks();
      inspectionState.reinforcement = false;
      inspectionChecked.reinforcement = false;
      updateSummary();
      notify(
        "Сохранённые проверки армирования удалены.",
        "success"
      );
    } catch (error) {
      console.error(
        "[btnClearReinfChecks] Ошибка удаления из Firestore:",
        error
      );
      notify(
        `Ошибка удаления проверок: ${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
    }
  }

  function bind() {
    rows.bind();
    dom.construction?.addEventListener(
      "change",
      () => form.updateFieldsVisibility(true)
    );
    dom.btnReinf?.addEventListener("click", () => void runCheck());
    dom.btnSaveReinfCheck?.addEventListener(
      "click",
      () => void saveCheck()
    );
    dom.btnClearReinfForm?.addEventListener("click", clearForm);
    dom.btnClearReinfChecks?.addEventListener(
      "click",
      () => void clearChecks()
    );
  }

  function init() {
    if (initialized) return;
    initialized = true;
    form.init();
    bim.initBindings();
    bind();
    void bim.loadElements(getCurrentProjectId());
    if (dom.document.readyState === "loading") {
      dom.document.addEventListener(
        "DOMContentLoaded",
        () => form.updateFieldsVisibility(false),
        { once: true }
      );
    } else {
      form.updateFieldsVisibility(false);
    }
  }

  return {
    init,
    form,
    rows,
    runCheck,
    saveCheck,
    loadCheck,
    clearForm,
    clearChecks,
    loadChecks,
    saveChecks: saveLocalChecks,
    renderChecks,
    loadBimElements: bim.loadElements,
    renderBimVisualPanel: bim.renderVisualPanel
  };
}

export type ReinforcementRuntime =
  ReturnType<typeof createReinforcementRuntime>;
