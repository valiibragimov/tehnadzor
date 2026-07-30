import { getConstructionLabel } from "../../../app/construction.js";
import {
  buildStrengthJournalPayload,
  buildStrengthResultSeries,
  evaluateStrengthCheck,
  parseConcreteStrengthValue
} from "./evaluation.js";
import { setCurrentStrengthCheckId } from "./state.js";
import type { StrengthChartController } from "./chart.js";
import type { StrengthDomBindings } from "./dom.js";
import type { StrengthForm } from "./form.js";
import type {
  StrengthCheckRecord,
  StrengthState
} from "./types.js";
import type { StrengthService } from "./service.js";

interface StrengthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StrengthActions {
  bind(): void;
  loadChecks(): Promise<void>;
  saveLocalChecks(): void;
  renderChecks(): void;
  runCheck(options?: { autoSave?: boolean }): Promise<void>;
  saveCheck(options?: { skipJournalOnce?: boolean }): Promise<string | null>;
  loadCheck(checkId: string): Promise<void>;
  deleteCheck(
    checkId: string,
    options?: { askConfirmation?: boolean }
  ): Promise<boolean>;
  clearForm(): void;
  clearChecks(options?: { askConfirmation?: boolean }): Promise<boolean>;
}

interface StrengthActionDependencies {
  state: StrengthState;
  service: StrengthService;
  form: StrengthForm;
  chart: StrengthChartController;
  dom: StrengthDomBindings;
  inspectionState: Record<string, boolean>;
  inspectionChecked: Record<string, boolean>;
  storage: StrengthStorage;
  storageKey: string;
  getCurrentProjectId(): string | null;
  validateProject(projectId: string | null): boolean;
  loadBimElements(projectId?: string | null): Promise<void>;
  ensureChartJsLoaded(): Promise<boolean>;
  renderRegulatoryBasis(options: {
    moduleKey: string;
    checkKind: string;
    subtype: string;
    helpTargetId: string;
  }): string;
  notify(message: string, tone?: string): void;
  confirm(message: string): boolean | Promise<boolean>;
  updateSummary(): unknown;
  addJournalEntry(payload: Record<string, unknown>): unknown;
  upsertJournalEntry(payload: Record<string, unknown>): unknown;
  notifyFirestoreSyncStatus(docRef: unknown): unknown;
  schedule?(callback: () => void): void;
  now?: () => number;
}

function formatDate(timestamp: unknown) {
  const date = new Date(Number(timestamp) || Date.now());
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: unknown) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNodeValue(value: unknown, unit = "") {
  if (value === null || value === undefined || value === "") return "—";
  const numericValue =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(numericValue)) return "—";
  const rounded = Math.round(numericValue * 10) / 10;
  const formatted =
    rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);
  return formatted + (unit ? ` ${unit}` : "");
}

function buildDeleteButton(title: string) {
  const safeTitle = escapeHtml(title);
  return `
    <button type="button" class="node-delete-icon" data-act="del" title="${safeTitle}" aria-label="${safeTitle}">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    </button>
  `;
}

export function createStrengthActions({
  state,
  service,
  form,
  chart,
  dom,
  inspectionState,
  inspectionChecked,
  storage,
  storageKey,
  getCurrentProjectId,
  validateProject,
  loadBimElements,
  ensureChartJsLoaded,
  renderRegulatoryBasis,
  notify,
  confirm,
  updateSummary,
  addJournalEntry,
  upsertJournalEntry,
  notifyFirestoreSyncStatus,
  schedule = (callback) => {
    setTimeout(callback, 0);
  },
  now = Date.now
}: StrengthActionDependencies): StrengthActions {
  let handlersBound = false;
  let chartWarningShown = false;

  const scopedStorageKey = () =>
    `${storageKey}_${getCurrentProjectId() || "no_project"}`;

  function resetInspectionStatus() {
    inspectionState.strength = false;
    inspectionChecked.strength = false;
  }

  function saveLocalChecks() {
    storage.setItem(
      scopedStorageKey(),
      JSON.stringify(Array.from(state.checks.entries()))
    );
  }

  async function loadChecks() {
    state.checks.clear();
    const projectId = getCurrentProjectId();
    await loadBimElements(projectId);
    if (!projectId) return;

    try {
      const loaded = await service.loadChecks(projectId);
      loaded.forEach((check, id) => state.checks.set(id, check));
      saveLocalChecks();
    } catch (error) {
      console.error("[loadStrengthChecks] Ошибка загрузки из Firestore:", error);
      const raw = storage.getItem(scopedStorageKey());
      if (!raw) return;
      try {
        const entries = JSON.parse(raw) as Array<
          [string, StrengthCheckRecord]
        >;
        entries.forEach(([id, check]) => state.checks.set(id, check));
      } catch (parseError) {
        console.warn(
          "[loadStrengthChecks] Ошибка парсинга localStorage:",
          parseError
        );
      }
    }
  }

  function renderChecks() {
    const list = dom.checksList;
    if (!list) return;
    list.innerHTML = "";

    if (!state.checks.size) {
      list.innerHTML =
        '<div class="caption" style="padding:10px">' +
        "Пока нет сохранённых проверок прочности.</div>";
      return;
    }

    const entries = Array.from(state.checks.entries()).sort((left, right) => {
      const leftConstruction = String(left[1].construction || "");
      const rightConstruction = String(right[1].construction || "");
      const byConstruction = leftConstruction.localeCompare(
        rightConstruction,
        "ru",
        { sensitivity: "base" }
      );
      if (byConstruction !== 0) return byConstruction;
      return Number(right[1].createdAt || 0) - Number(left[1].createdAt || 0);
    });
    const fragment = dom.document.createDocumentFragment();
    let currentGroup = "";

    entries.forEach(([id, check]) => {
      const groupLabel = String(
        check.constructionLabel ||
          getConstructionLabel(
            check.construction,
            String(check.construction || "Без конструкции")
          )
      );
      if (groupLabel !== currentGroup) {
        currentGroup = groupLabel;
        const header = dom.document.createElement("div");
        header.className = "caption strength-group-title";
        header.textContent = `Конструкция: ${groupLabel}`;
        fragment.appendChild(header);
      }

      const evaluation =
        check.status === "ok" || check.status === "exceeded"
          ? {
              status: check.status,
              summaryText: check.summaryText || ""
            }
          : evaluateStrengthCheck(check);
      const statusTag =
        evaluation.status === "exceeded"
          ? '<span class="tag bad">превышено</span>'
          : evaluation.status === "ok"
            ? '<span class="tag ok">в норме</span>'
            : '<span class="tag" style="background: #9ca3af; color: #1f2937; font-weight: 600;">не заполнено</span>';
      const row = dom.document.createElement("div");
      row.className = "node node-enhanced node-card-compact";
      row.dataset.id = id;
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      row.innerHTML = `
        <div class="node-content">
          <div class="node-header">
            <div class="node-title">
              <span class="node-icon">💪</span>
              Проверка от ${formatDate(check.createdAt)}
            </div>
            <div class="node-header-controls">
              ${statusTag}
              ${buildDeleteButton("Удалить проверку")}
            </div>
          </div>
          <div class="node-data">
            <div class="node-data-row">
              <span class="node-label">Класс/Марка:</span>
              <span class="node-values"><strong>${check.mark ? escapeHtml(check.mark) : "—"}</strong></span>
            </div>
            <div class="node-data-row">
              <span class="node-label">Дней:</span>
              <span class="node-values">${escapeHtml(check.days ?? "—")}</span>
            </div>
            <div class="node-data-row">
              <span class="node-label">Факт. прочность:</span>
              <span class="node-values"><strong>${formatNodeValue(check.actual, "МПа")}</strong></span>
            </div>
            ${
              check.floor
                ? `<div class="node-data-row"><span class="node-label">Этаж:</span><span class="node-values">${escapeHtml(check.floor)}</span></div>`
                : ""
            }
          </div>
        </div>
      `;
      row.addEventListener("click", (event) => {
        const target = event.target as Element | null;
        if (target?.closest('[data-act="del"]')) {
          void deleteCheck(id);
          return;
        }
        void loadCheck(id);
      });
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        void loadCheck(id);
      });
      fragment.appendChild(row);
    });
    list.appendChild(fragment);
  }

  async function renderChart(
    check: StrengthCheckRecord,
    hasActual: boolean
  ) {
    const series = buildStrengthResultSeries(
      check.markValue,
      check.days,
      check.actual
    );
    if (chart.render(series, hasActual)) return;
    const loaded = await ensureChartJsLoaded();
    if (loaded && chart.render(series, hasActual)) return;
    if (!chartWarningShown) {
      chartWarningShown = true;
      notify(
        "Chart.js не загружен. График недоступен, но проверка прочности выполнена. Проверьте подключение к интернету для отображения графика.",
        "warning"
      );
    }
  }

  async function runCheck({ autoSave = true } = {}) {
    const projectId = getCurrentProjectId();
    if (!validateProject(projectId)) return;
    const flags = form.getConstructionFlags();
    if (flags.isUnsupported) {
      form.setUnsupportedState({ notify: true });
      return;
    }
    if (!dom.floor?.value.trim()) {
      notify("Поле 'Этаж' обязательно для заполнения.", "error");
      dom.floor?.focus();
      return;
    }
    if (!form.validateMarking()) return;

    const draft = form.readCheck(
      state.currentCheckId
        ? state.checks.get(state.currentCheckId) || null
        : null
    );
    const markValue = parseConcreteStrengthValue(draft.mark);
    const evaluation = evaluateStrengthCheck(draft);
    if (dom.result) dom.result.style.display = "block";
    if (!draft.mark || markValue == null) {
      if (dom.result) {
        dom.result.className = "result not-ok";
        dom.result.textContent = "Выберите класс бетона из списка.";
      }
      dom.mark?.focus();
      resetInspectionStatus();
      return;
    }
    if (!evaluation.hasRequiredData || evaluation.normativeStrength == null) {
      if (dom.result) {
        dom.result.className = "result not-ok";
        dom.result.textContent =
          "Заполните проектную прочность и количество дней после бетонирования.";
      }
      resetInspectionStatus();
      return;
    }

    await renderChart(draft, evaluation.hasActual);
    const selectedClass = String(draft.mark || "");
    const classMatch = selectedClass.match(
      /^([Bb]\d+\.?\d*)\(([Мм]\d+)\)$/u
    );
    const classInfo = classMatch
      ? `${classMatch[1]}(${classMatch[2]})`
      : selectedClass;
    const classText = classInfo
      ? escapeHtml(classInfo)
      : `${markValue.toFixed(1)} МПа`;
    const days = evaluation.days as number;
    const normative = evaluation.normativeStrength;
    const regulatory = renderRegulatoryBasis({
      moduleKey: "strength",
      checkKind: form.getSelectedConstructionKey() || "default",
      subtype: form.getSelectedConstructionSubtype(),
      helpTargetId: "strengthHelpContent"
    });

    if (!evaluation.hasActual || evaluation.actual == null) {
      if (dom.result) {
        dom.result.className = "result";
        dom.result.innerHTML = `
          <b>Проектный класс бетона:</b> ${classText} (R28 = ${markValue.toFixed(1)} МПа)<br/>
          Нормативная прочность на ${escapeHtml(days)}-й день: <b>${normative.toFixed(1)} МПа</b> (${((normative / markValue) * 100).toFixed(1)}% от проектной)<br/>
          Фактическая прочность ещё не введена. Проверка соответствия будет выполнена после ввода фактического значения.<br/>
          <small style="color: #94a3b8; margin-top: 8px; display: block;">
            Расчет по формуле ГОСТ 18105-2018: R(t) = R28 × lg(t) / lg(28)<br/>
            где R28 = ${markValue.toFixed(1)} МПа (проектная прочность класса ${classText})
          </small>
          ${regulatory}
        `;
      }
      resetInspectionStatus();
      if (autoSave) {
        schedule(() => {
          void saveCheck();
        });
      }
      return;
    }

    const actual = evaluation.actual;
    const compliant = evaluation.isCompliant === true;
    if (dom.result) {
      dom.result.className = `result ${compliant ? "ok" : "not-ok"}`;
      dom.result.innerHTML = `
        <b>Проектный класс бетона:</b> ${classText} (R28 = ${markValue.toFixed(1)} МПа)<br/>
        Нормативная прочность на ${escapeHtml(days)}-й день: <b>${normative.toFixed(1)} МПа</b> (${((normative / markValue) * 100).toFixed(1)}% от проектной)<br/>
        Фактическая прочность: <b>${actual.toFixed(1)} МПа</b> (${((actual / markValue) * 100).toFixed(1)}% от проектной)<br/>
        <b>${compliant ? "✅ Соответствует нормативу." : "❌ Недобор прочности."}</b><br/>
        <small style="color: #94a3b8; margin-top: 8px; display: block;">
          Расчет по формуле ГОСТ 18105-2018: R(t) = R28 × lg(t) / lg(28)<br/>
          где R28 = ${markValue.toFixed(1)} МПа (проектная прочность класса ${classText}), t = ${escapeHtml(days)} дней
        </small>
        ${regulatory}
      `;
    }
    inspectionState.strength = compliant;
    inspectionChecked.strength = true;
    const journalPayload = buildStrengthJournalPayload(draft, {
      runtimeStatus: true
    });
    if (journalPayload) addJournalEntry(journalPayload);
    if (autoSave) {
      schedule(() => {
        void saveCheck({ skipJournalOnce: true });
      });
    }
  }

  async function saveCheck({ skipJournalOnce: skipJournal = false } = {}) {
    const projectId = getCurrentProjectId();
    if (!validateProject(projectId) || !projectId) return null;
    const existingId = state.currentCheckId;
    const existing = existingId
      ? state.checks.get(existingId) || null
      : null;
    const flags = form.getConstructionFlags();
    if (flags.isUnsupported) {
      form.setUnsupportedState({ notify: true });
      return null;
    }
    if (
      flags.behavior.floorRequired !== false &&
      !dom.floor?.value.trim()
    ) {
      notify("Поле 'Этаж' обязательно для заполнения.", "error");
      return null;
    }

    const provisionalId = existingId || `chk_${now()}`;
    const data = form.readCheck(existing);
    const evaluation = evaluateStrengthCheck(data);
    data.status = evaluation.status;
    data.summaryText = evaluation.summaryText;
    data.lastMsg = dom.result?.innerHTML || "";
    data.projectId = projectId;
    data.module = "strength";
    data.createdAt = existing?.createdAt || now();
    state.checks.set(provisionalId, data);
    saveLocalChecks();
    renderChecks();

    try {
      const result = existing
        ? await service.updateCheck(projectId, provisionalId, data)
        : await service.createCheck(projectId, data);
      notifyFirestoreSyncStatus(result.ref);
      const finalId = result.id;
      if (finalId !== provisionalId) {
        state.checks.delete(provisionalId);
        state.checks.set(finalId, { ...data, id: finalId });
        saveLocalChecks();
        renderChecks();
      }
      setCurrentStrengthCheckId(state, finalId);

      if (!skipJournal && data.status !== "empty") {
        const journalPayload = buildStrengthJournalPayload(data, {
          sourceId: finalId
        });
        if (journalPayload) await upsertJournalEntry(journalPayload);
      }
      updateSummary();
      return finalId;
    } catch (error) {
      console.error("[Strength] Ошибка сохранения в Firestore:", error);
      notify("Ошибка сохранения в Firestore.", "error");
      updateSummary();
      return null;
    }
  }

  async function loadCheck(checkId: string) {
    const check = state.checks.get(checkId);
    if (!check) return;
    form.restoreCheck(check);
    setCurrentStrengthCheckId(state, checkId);
    await runCheck({ autoSave: false });
  }

  async function deleteCheck(
    checkId: string,
    { askConfirmation = true } = {}
  ) {
    if (
      askConfirmation &&
      !(await confirm("Удалить эту проверку?"))
    ) {
      return false;
    }
    const projectId = getCurrentProjectId();
    state.checks.delete(checkId);
    if (state.currentCheckId === checkId) {
      setCurrentStrengthCheckId(state, null);
    }
    saveLocalChecks();
    renderChecks();
    updateSummary();
    try {
      if (projectId) await service.deleteCheck(projectId, checkId);
      return true;
    } catch (error) {
      console.error("[Strength] Ошибка удаления проверки:", error);
      return false;
    }
  }

  function clearForm() {
    setCurrentStrengthCheckId(state, null);
    form.clear();
    resetInspectionStatus();
  }

  async function clearChecks({ askConfirmation = true } = {}) {
    if (
      askConfirmation &&
      !(await confirm(
        "Удалить все сохранённые проверки прочности бетона для текущего проекта?"
      ))
    ) {
      return false;
    }
    const projectId = getCurrentProjectId();
    if (!projectId) {
      notify(
        "Сначала создайте объект или выберите существующий.",
        "warning"
      );
      return false;
    }
    try {
      await service.clearChecks(projectId);
      state.checks.clear();
      setCurrentStrengthCheckId(state, null);
      resetInspectionStatus();
      saveLocalChecks();
      renderChecks();
      updateSummary();
      notify(
        "Сохранённые проверки прочности бетона удалены.",
        "success"
      );
      return true;
    } catch (error) {
      console.error("[Strength] Ошибка удаления проверок:", error);
      notify(
        `Ошибка удаления проверок: ${getErrorMessage(error)}`,
        "error"
      );
      return false;
    }
  }

  function bind() {
    if (handlersBound) return;
    handlersBound = true;
    dom.checkButton?.addEventListener("click", () => {
      void runCheck();
    });
    dom.saveButton?.addEventListener("click", () => {
      void saveCheck();
    });
    dom.clearFormButton?.addEventListener("click", clearForm);
    dom.clearChecksButton?.addEventListener("click", () => {
      void clearChecks();
    });
  }

  return {
    bind,
    loadChecks,
    saveLocalChecks,
    renderChecks,
    runCheck,
    saveCheck,
    loadCheck,
    deleteCheck,
    clearForm,
    clearChecks
  };
}
