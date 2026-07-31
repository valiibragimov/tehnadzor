import { APP_CONFIG } from "../../../config.js";
import {
  getConstructionEntityLabels,
  isConstructionProfile
} from "../../../app/construction.js";
import {
  defaultNumbers,
  defaultRusLetters,
  escapeHtml,
  normalizeMarking
} from "../../../utils.js";
import {
  addReinforcementBeam,
  addReinforcementColumn,
  addReinforcementWall,
  hasDuplicateBeamMarking,
  hasDuplicateColumnMarking,
  hasDuplicateWallAxes,
  removeReinforcementBeam,
  removeReinforcementColumn,
  removeReinforcementWall
} from "./state.js";
import type { ReinforcementDomBindings } from "./dom.js";
import type {
  ReinforcementBeam,
  ReinforcementColumn,
  ReinforcementState,
  ReinforcementWall
} from "./types.js";
import type {
  ReinforcementConstructionFlags,
  ReinforcementRowsFormApi
} from "./form.js";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ReinforcementRowsRuntimeDependencies {
  state: ReinforcementState;
  dom: ReinforcementDomBindings;
  storage: StorageLike;
  getCurrentProjectId(): string | null;
  getConstructionKey(): string;
  getConstructionSubtype(): string;
  getConstructionFlags(): ReinforcementConstructionFlags;
  getBimMark(): string | null;
  setBimFieldAutofilled(
    field: HTMLInputElement | null,
    isAutofilled: boolean
  ): void;
  notify(message: string, tone?: string): void;
}

type LinearRow = ReinforcementColumn | ReinforcementBeam;
type LinearField =
  | "marking"
  | "projDia"
  | "factDia"
  | "projStep"
  | "factStep"
  | "projCover"
  | "factCover"
  | "projHoopsStep"
  | "factHoopsStep";

function matchesMark(left: unknown, right: unknown) {
  return normalizeMarking(left) === normalizeMarking(right);
}

function inputValue(value: unknown) {
  return escapeHtml(value == null ? "" : String(value));
}

export function createReinforcementRowsRuntime(
  dependencies: ReinforcementRowsRuntimeDependencies
) {
  const {
    state,
    dom,
    storage,
    getCurrentProjectId,
    getConstructionKey,
    getConstructionSubtype,
    getConstructionFlags,
    getBimMark,
    setBimFieldAutofilled,
    notify
  } = dependencies;
  let buttonsBound = false;

  function labels() {
    return getConstructionEntityLabels(
      getConstructionKey(),
      "reinforcement",
      getConstructionSubtype()
    );
  }

  function wallLimit(flags = getConstructionFlags()) {
    return flags.behavior.maxWalls ?? APP_CONFIG.MAX_ELEMENTS;
  }

  function updateWallLimit(
    flags: ReinforcementConstructionFlags = getConstructionFlags()
  ) {
    const maxWalls = wallLimit(flags);
    const entity = labels();
    if (dom.reinfWallsLimitLabel) {
      dom.reinfWallsLimitLabel.textContent =
        `${entity.plural} (до ${maxWalls})`;
    }
    if (dom.btnAddReinfWall) {
      const label = dom.btnAddReinfWall.querySelector(".lg-btn__label");
      if (label) label.textContent = `+ Добавить ${entity.addText}`;
      const atLimit = state.walls.length >= maxWalls;
      dom.btnAddReinfWall.disabled = atLimit;
      dom.btnAddReinfWall.title = atLimit
        ? `Достигнут лимит ${maxWalls}: ${entity.pluralGenitive}`
        : "";
    }
  }

  function updateLinearRow(
    type: "column" | "beam",
    id: number,
    patch: Partial<LinearRow>
  ) {
    const rows = type === "column" ? state.columns : state.beams;
    const row = rows.find((item) => item.id === id);
    if (!row) return false;
    Object.assign(row, patch);
    return true;
  }

  function updateWall(id: number, patch: Partial<ReinforcementWall>) {
    const wall = state.walls.find((item) => item.id === id);
    if (!wall) return false;
    Object.assign(wall, patch);
    saveWallsDraft();
    return true;
  }

  function addColumn(id = Date.now()) {
    const result = addReinforcementColumn(
      state,
      APP_CONFIG.MAX_ELEMENTS,
      id
    );
    if (!result.added) {
      notify(
        `Максимальное количество колонн - ${APP_CONFIG.MAX_ELEMENTS}`,
        "warning"
      );
      return false;
    }
    renderColumns();
    setTimeout(() => {
      dom.reinfColumnsList
        ?.querySelector(".card:last-child")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
    return true;
  }

  function removeColumn(id: number) {
    removeReinforcementColumn(state, id);
    renderColumns();
  }

  function addBeam(id = Date.now()) {
    const result = addReinforcementBeam(
      state,
      APP_CONFIG.MAX_ELEMENTS,
      id
    );
    if (!result.added) {
      notify(
        `Максимальное количество балок - ${APP_CONFIG.MAX_ELEMENTS}`,
        "warning"
      );
      return false;
    }
    renderBeams();
    setTimeout(() => {
      dom.reinfBeamsList
        ?.querySelector(".card:last-child")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
    return true;
  }

  function removeBeam(id: number) {
    removeReinforcementBeam(state, id);
    renderBeams();
  }

  function addWall(id = Date.now()) {
    const entity = labels();
    if (
      !isConstructionProfile(
        getConstructionKey(),
        "reinforcement",
        "wall"
      )
    ) {
      notify(
        `Добавление ${entity.addText} доступно только для стеновых конструкций`,
        "warning"
      );
      return false;
    }
    if (!dom.reinfWallsList) {
      notify(
        `Ошибка: контейнер для ${entity.pluralGenitive} не найден`,
        "error"
      );
      return false;
    }
    const maxWalls = wallLimit();
    const result = addReinforcementWall(state, maxWalls, id);
    if (!result.added) {
      notify(
        `Максимальное количество ${entity.pluralGenitive} - ${maxWalls}`,
        "warning"
      );
      return false;
    }
    renderWalls();
    saveWallsDraft();
    setTimeout(() => {
      dom.reinfWallsList
        ?.querySelector(".card:last-child")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
    return true;
  }

  function removeWall(id: number) {
    removeReinforcementWall(state, id);
    renderWalls();
    saveWallsDraft();
  }

  function draftKey() {
    const projectId = getCurrentProjectId();
    return projectId ? `draft_reinf_walls_${projectId}` : null;
  }

  function saveWallsDraft() {
    const key = draftKey();
    if (
      !key ||
      !isConstructionProfile(
        getConstructionKey(),
        "reinforcement",
        "wall"
      )
    ) return;
    if (state.walls.length) {
      storage.setItem(key, JSON.stringify(state.walls));
    } else {
      storage.removeItem(key);
    }
  }

  function loadWallsDraft() {
    const key = draftKey();
    if (
      !key ||
      !isConstructionProfile(
        getConstructionKey(),
        "reinforcement",
        "wall"
      )
    ) return;
    const draft = storage.getItem(key);
    if (!draft) return;
    try {
      const parsed = JSON.parse(draft);
      if (Array.isArray(parsed) && parsed.length) {
        state.walls = parsed;
        renderWalls();
      }
    } catch (error) {
      console.error("Ошибка загрузки черновика стен:", error);
      storage.removeItem(key);
    }
  }

  function linearTemplate(
    row: LinearRow,
    index: number,
    type: "column" | "beam"
  ) {
    const isColumn = type === "column";
    const prefix = isColumn ? "reinf-col" : "reinf-beam";
    const title = isColumn ? "Колонна" : "Балка";
    const markPlaceholder = isColumn ? "Напр.: К 1.12" : "Напр.: БМ 1";
    const markAutofilled = Boolean(row.bimAutofilledMark);
    const fields = [
      ["projDia", "Проектный диаметр арматуры"],
      ["factDia", "Фактический диаметр арматуры"],
      ["projStep", "Проектный шаг арматуры"],
      ["factStep", "Фактический шаг арматуры"],
      ["projCover", "Проектный защитный слой"],
      ["factCover", "Фактический защитный слой"],
      ...(isColumn
        ? [
          ["projHoopsStep", "Проектный шаг хомутов"],
          ["factHoopsStep", "Фактический шаг хомутов"]
        ]
        : [])
    ] as Array<[LinearField, string]>;
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <b>${title} ${index + 1}</b>
        <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact" data-remove="${row.id}">
          <span class="lg-btn__label">Удалить</span>
          <span class="lg-btn__glow" aria-hidden="true"></span>
        </button>
      </div>
      <div class="${markAutofilled ? "geo-bim-field--autofilled" : ""}">
        <label>Маркировка ${title.toLocaleLowerCase("ru")} </label>
        <input type="text" class="${prefix}-marking ${markAutofilled ? "geo-bim-input--autofilled" : ""}" data-field="marking" data-id="${row.id}" placeholder="${markPlaceholder}" value="${inputValue(row.marking)}" required />
      </div>
      <div class="grid-2 mt8">
        ${fields.map(([field, label]) => `
          <div>
            <label>${label}</label>
            <input type="number" inputmode="decimal" class="${prefix}-${field}" data-field="${field}" data-id="${row.id}" placeholder="мм" value="${inputValue(row[field])}" />
          </div>
        `).join("")}
      </div>
    `;
  }

  function bindLinearInputs(
    card: HTMLElement,
    row: LinearRow,
    index: number,
    type: "column" | "beam"
  ) {
    card.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
      input.addEventListener("input", () => {
        const field = input.dataset.field as LinearField;
        updateLinearRow(type, row.id, { [field]: input.value });
        if (field === "marking") {
          const autofilled =
            index === 0 && matchesMark(input.value, getBimMark());
          row.bimAutofilledMark = autofilled;
          setBimFieldAutofilled(input, autofilled);
        }
      });
    });
    const marking = card.querySelector<HTMLInputElement>(
      '[data-field="marking"]'
    );
    marking?.addEventListener("blur", () => {
      const normalized = normalizeMarking(marking.value);
      const duplicate = type === "column"
        ? hasDuplicateColumnMarking(state, normalized, row.id)
        : hasDuplicateBeamMarking(state, normalized, row.id);
      if (normalized && duplicate) {
        notify(
          `${type === "column" ? "Колонна" : "Балка"} с такой маркировкой уже существует. Введите другую маркировку.`,
          "warning"
        );
        marking.value = row.marking || "";
        marking.focus();
        return;
      }
      row.marking = normalized;
      row.bimAutofilledMark =
        index === 0 && matchesMark(normalized, getBimMark());
      setBimFieldAutofilled(marking, Boolean(row.bimAutofilledMark));
    });
    card
      .querySelector<HTMLButtonElement>(`[data-remove="${row.id}"]`)
      ?.addEventListener("click", () => {
        if (type === "column") removeColumn(row.id);
        else removeBeam(row.id);
      });
  }

  function renderLinearRows(
    type: "column" | "beam",
    rows: LinearRow[],
    container: HTMLElement | null
  ) {
    if (!container) return;
    container.innerHTML = "";
    if (!rows.length) {
      const label = type === "column" ? "колонн" : "балок";
      const action = type === "column" ? "колонну" : "балку";
      container.innerHTML =
        `<div class="caption" style="padding: 8px;">Нет добавленных ${label}. Нажмите "Добавить ${action}" для начала.</div>`;
      return;
    }
    rows.forEach((row, index) => {
      const card = dom.document.createElement("div");
      card.className = "card";
      card.style.marginBottom = "8px";
      card.style.padding = "12px";
      card.innerHTML = linearTemplate(row, index, type);
      bindLinearInputs(card, row, index, type);
      container.appendChild(card);
    });
  }

  function renderColumns() {
    renderLinearRows("column", state.columns, dom.reinfColumnsList);
  }

  function renderBeams() {
    renderLinearRows("beam", state.beams, dom.reinfBeamsList);
  }

  function wallAxesTemplate(wall: ReinforcementWall) {
    if (wall.bindingType === "number_letters") {
      return `
        <div class="grid-3" style="margin-bottom: 8px;">
          ${wallSelect("numberAxis", "Цифровая ось", defaultNumbers, wall.numberAxis)}
          ${wallSelect("letterAxis1", "Буквенная ось 1", defaultRusLetters, wall.letterAxis1)}
          ${wallSelect("letterAxis2", "Буквенная ось 2", defaultRusLetters, wall.letterAxis2)}
        </div>`;
    }
    return `
      <div class="grid-3" style="margin-bottom: 8px;">
        ${wallSelect("letterAxis", "Буквенная ось", defaultRusLetters, wall.letterAxis)}
        ${wallSelect("numberAxis1", "Цифровая ось 1", defaultNumbers, wall.numberAxis1)}
        ${wallSelect("numberAxis2", "Цифровая ось 2", defaultNumbers, wall.numberAxis2)}
      </div>`;
  }

  function wallSelect(
    field: string,
    label: string,
    options: string[],
    value: string
  ) {
    return `<div>
      <label>${label} </label>
      <select class="reinf-wall-${field} ui-select" data-field="${field}" style="width: 100%;">
        <option value="">-- Выберите --</option>
        ${options.map((option) =>
    `<option value="${option}" ${value === option ? "selected" : ""}>${option}</option>`
  ).join("")}
      </select>
    </div>`;
  }

  function wallTemplate(wall: ReinforcementWall, index: number) {
    const entity = labels();
    const fields = [
      ["projDia", "Проектный диаметр арматуры"],
      ["factDia", "Фактический диаметр арматуры"],
      ["projStep", "Проектный шаг арматуры"],
      ["factStep", "Фактический шаг арматуры"],
      ["projCover", "Проектный защитный слой"],
      ["factCover", "Фактический защитный слой"]
    ];
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <b>${entity.singular} ${index + 1}</b>
        <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact" data-remove="${wall.id}">
          <span class="lg-btn__label">Удалить</span>
          <span class="lg-btn__glow" aria-hidden="true"></span>
        </button>
      </div>
      <div style="margin-bottom: 8px;">
        <label><b>Тип привязки:</b></label>
        <select class="reinf-wall-binding-type ui-select" data-field="bindingType" style="width: 100%; margin-top: 4px;">
          <option value="number_letters" ${wall.bindingType === "number_letters" ? "selected" : ""}>Одна цифровая + две буквенные (например, 1, В-Г)</option>
          <option value="letter_numbers" ${wall.bindingType === "letter_numbers" ? "selected" : ""}>Одна буквенная + две цифровые (например, Г, 8-9)</option>
        </select>
      </div>
      ${wallAxesTemplate(wall)}
      <div class="grid-2 mt8">
        ${fields.map(([field, label]) => `<div>
          <label>${label}</label>
          <input type="number" inputmode="decimal" class="reinf-wall-${field}" data-field="${field}" placeholder="мм" value="${inputValue(wall[field])}" />
        </div>`).join("")}
      </div>`;
  }

  function wallAxes(wall: ReinforcementWall) {
    return {
      bindingType: wall.bindingType,
      numberAxis: wall.numberAxis,
      letterAxis1: wall.letterAxis1,
      letterAxis2: wall.letterAxis2,
      letterAxis: wall.letterAxis,
      numberAxis1: wall.numberAxis1,
      numberAxis2: wall.numberAxis2
    };
  }

  function validateWall(
    wall: ReinforcementWall,
    previous: ReinforcementWall
  ) {
    const repeatedLetters =
      wall.bindingType === "number_letters" &&
      wall.letterAxis1 &&
      wall.letterAxis1 === wall.letterAxis2;
    const repeatedNumbers =
      wall.bindingType === "letter_numbers" &&
      wall.numberAxis1 &&
      wall.numberAxis1 === wall.numberAxis2;
    if (repeatedLetters || repeatedNumbers) {
      Object.assign(wall, previous);
      notify(
        repeatedLetters
          ? "Буквенные оси не должны повторяться. Выберите разные буквенные оси."
          : "Цифровые оси не должны повторяться. Выберите разные цифровые оси.",
        "warning"
      );
      return false;
    }
    if (hasDuplicateWallAxes(state, wallAxes(wall), wall.id)) {
      Object.assign(wall, previous);
      notify(
        `${labels().singular} с такими же осями уже существует. Выберите другие оси.`,
        "warning"
      );
      return false;
    }
    return true;
  }

  function bindWallInputs(card: HTMLElement, wall: ReinforcementWall) {
    card.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
      select.addEventListener("change", () => {
        const previous = { ...wall };
        const field = select.dataset.field as keyof ReinforcementWall;
        if (field === "bindingType") {
          wall.bindingType =
            select.value === "letter_numbers"
              ? "letter_numbers"
              : "number_letters";
        } else {
          Object.assign(wall, { [field]: select.value });
        }
        validateWall(wall, previous);
        renderWalls();
        saveWallsDraft();
      });
    });
    card.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
      input.addEventListener("input", () => {
        updateWall(wall.id, { [input.dataset.field!]: input.value });
      });
    });
    card
      .querySelector<HTMLButtonElement>(`[data-remove="${wall.id}"]`)
      ?.addEventListener("click", () => removeWall(wall.id));
  }

  function renderWalls() {
    if (!dom.reinfWallsList) return;
    updateWallLimit();
    dom.reinfWallsList.innerHTML = "";
    if (!state.walls.length) {
      const entity = labels();
      dom.reinfWallsList.innerHTML =
        `<div class="caption" style="padding: 8px;">Нет добавленных ${entity.pluralGenitive}. Нажмите "Добавить ${entity.addText}" для начала.</div>`;
      return;
    }
    state.walls.forEach((wall, index) => {
      const card = dom.document.createElement("div");
      card.className = "card";
      card.style.marginBottom = "8px";
      card.style.padding = "12px";
      card.innerHTML = wallTemplate(wall, index);
      bindWallInputs(card, wall);
      dom.reinfWallsList!.appendChild(card);
    });
  }

  function bindWallButton() {
    // Event delegation is bound once in bind().
  }

  function bind() {
    if (buttonsBound) return;
    buttonsBound = true;
    dom.btnAddReinfColumn?.addEventListener("click", () => addColumn());
    dom.btnAddReinfBeam?.addEventListener("click", () => addBeam());
    dom.btnAddReinfWall?.addEventListener("click", () => addWall());
  }

  const api: ReinforcementRowsFormApi & {
    bind(): void;
    addColumn(id?: number): boolean;
    addBeam(id?: number): boolean;
    addWall(id?: number): boolean;
    removeColumn(id: number): void;
    removeBeam(id: number): void;
    removeWall(id: number): void;
    updateColumn(id: number, patch: Partial<ReinforcementColumn>): boolean;
    updateBeam(id: number, patch: Partial<ReinforcementBeam>): boolean;
    updateWall(id: number, patch: Partial<ReinforcementWall>): boolean;
    checkColumnDuplicate(marking: string, excludeId?: number | null): boolean;
    checkBeamDuplicate(marking: string, excludeId?: number | null): boolean;
    checkWallDuplicate(
      axes: Parameters<typeof hasDuplicateWallAxes>[1],
      excludeId?: number | null
    ): boolean;
  } = {
    bind,
    addColumn,
    addBeam,
    addWall,
    removeColumn,
    removeBeam,
    removeWall,
    updateColumn: (id, patch) => updateLinearRow("column", id, patch),
    updateBeam: (id, patch) => updateLinearRow("beam", id, patch),
    updateWall,
    checkColumnDuplicate: (marking, excludeId = null) =>
      hasDuplicateColumnMarking(state, marking, excludeId),
    checkBeamDuplicate: (marking, excludeId = null) =>
      hasDuplicateBeamMarking(state, marking, excludeId),
    checkWallDuplicate: (axes, excludeId = null) =>
      hasDuplicateWallAxes(state, axes, excludeId),
    renderColumns,
    renderBeams,
    renderWalls,
    loadWallsDraft,
    saveWallsDraft,
    bindWallButton,
    updateWallLimit
  };
  return api;
}

export type ReinforcementRowsRuntime =
  ReturnType<typeof createReinforcementRowsRuntime>;
