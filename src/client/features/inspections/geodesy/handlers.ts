import { t } from "../../../shared/i18n/index.js";
import {
  getConstructionModuleBehavior
} from "../../../app/construction.js";
import { readAcceptanceCriteria, restoreAcceptanceCriteria } from "../../../app/ui/acceptance-criteria.js";
import { getConfirmedGeoTolerance } from "./evaluation.js";
import { renderRegulatoryBasisHtml } from "../../../app/services/regulatory-basis.js";
import { APP_CONFIG, TOLERANCES } from "../../../config.js";
import {
  formatCheckResult,
  normalizeMarking,
  parseDecimal,
  showConfirm,
  showNotification,
  toDocIdPart,
  validateProject,
  validateRequiredField
} from "../../../utils.js";
import {
  buildColumnJournalPayload,
  buildLinearJournalPayload,
  evaluateGeoBeamNode,
  evaluateGeoColumnNode,
  evaluateGeoNode,
  evaluateGeoWallNode
} from "./evaluation.js";
import {
  type GeodesyFormRuntime,
  type GeodesyConstructionFlags
} from "./form.js";
import type { createGeodesyDomBindings } from "./dom.js";
import type { createGeodesyNodeActions } from "./node-actions.js";
import {
  resetGeodesyFormState,
  type GeodesyState
} from "./state.js";
import type {
  GeodesyBimApi,
  GeodesyJournalPayload,
  GeodesyNodeRecord
} from "./types.js";

type GeodesyDomBindings = ReturnType<typeof createGeodesyDomBindings>;
type GeodesyNodeActions = ReturnType<typeof createGeodesyNodeActions>;

interface GeodesyHandlersDependencies {
  state: GeodesyState;
  bim: Pick<GeodesyBimApi, "clear" | "collectNodeData">;
  form: GeodesyFormRuntime;
  dom: GeodesyDomBindings;
  nodeActions: GeodesyNodeActions;
  construction: HTMLElement;
  inspectionState: Record<string, boolean>;
  inspectionChecked: Record<string, boolean>;
  getCurrentProjectId(): string | null;
  getCurrentConstructionKey(): string;
  getCurrentConstructionSubtype(): string;
  getGeoConstructionFlags(value?: string): GeodesyConstructionFlags;
  buildCurrentConstructionPayload(): Record<string, unknown>;
  renderNodes(): void;
  saveNodes(): void;
  saveMeta(): void;
  cancelProjectDesignAutosave(): void;
  saveProjectDesign(): Promise<unknown>;
  updateSummaryTab(): void;
  upsertJournalEntry(payload: GeodesyJournalPayload): Promise<unknown>;
  safeValue(value: unknown): string;
}

export function bindGeodesyHandlers({
  state: geodesyNodeState,
  bim,
  form,
  dom,
  nodeActions: geodesyNodeActions,
  construction,
  inspectionState: state,
  inspectionChecked: checked,
  getCurrentProjectId,
  getCurrentConstructionKey,
  getCurrentConstructionSubtype,
  getGeoConstructionFlags,
  buildCurrentConstructionPayload,
  renderNodes,
  saveNodes,
  saveMeta,
  cancelProjectDesignAutosave,
  saveProjectDesign,
  updateSummaryTab,
  upsertJournalEntry,
  safeValue
}: GeodesyHandlersDependencies) {
  const { nodes, columns, walls, beams, plateOpeningPoints } = geodesyNodeState;
  const {
    btnClearNodes,
    btnGeo,
    btnSaveNode,
    btnUpdateNode,
    btnClearForm,
    columnMarkEl,
    columnsList,
    floorEl,
    axisLetterEl,
    axisNumberEl,
    geoStairNameEl,
    geoPlateFlatnessCheckedEl,
    geoPlateFlatnessActualEl,
    geoPlateFlatnessBaseEl,
    geoPlateFlatnessClassEl,
    geoPlateFlatnessToleranceEl,
    geoResult,
    projX,
    factX,
    projY,
    factY,
    projH,
    factH
  } = dom;
  const getInspectionToleranceValue = (_construction: unknown, _module: string, key: string, _fallback: number, _subtype: string) =>
    getConfirmedGeoTolerance(readAcceptanceCriteria(document.getElementById("geo")), key);
  const {
    buildGeoNodeKey,
    collectGeoPlateFlatnessData,
    getGeoAxisState,
    getGeoWallEntityAddText,
    getGeoWallEntityLabel,
    getGeoWallEntityPlural,
    getGeoWallEntityPluralGenitive,
    getGeoWallEntityRequiredText,
    renderBeams,
    renderColumns,
    renderGeoPlateOpeningPoints,
    renderWalls,
    resetGeoPlateAxisFields,
    setGeoUnsupportedState,
    setUpdateNodeVisibility,
    updateGeoPlateFlatnessCalculatedFields,
    updateNodeId,
    validateGeoPlateAxisRange
  } = form;

  const saveProjectNode = (
    nodeId: string,
    data: GeodesyNodeRecord
  ) => geodesyNodeActions.saveProjectNode(
    getCurrentProjectId(),
    nodeId,
    data
  );

  btnGeo?.addEventListener("click", () => btnSaveNode?.click());

  function presentSavedNode(data: GeodesyNodeRecord) {
    data.createdAt ??= Date.now();
    state.geo = data.status === "ok";
    checked.geo = data.status === "ok" || data.status === "bad";
    geoResult.className = data.status === "ok" ? "result ok" : data.status === "bad" ? "result not-ok" : "result";
    geoResult.textContent = t(data.status === "ok" ? "engineering_conforms" : data.status === "bad" ? "engineering_nonconforms" : "engineering_requires_review");
    const rows = data.columns || data.walls || data.beams || [data];
    for (const [index, row] of rows.entries()) {
      const suffixes = row.bindingType === "number_letters" ? ["_num_let1", "_num_let2"] : row.bindingType === "letter_numbers" ? ["_let_num1", "_let_num2"] : [""];
      for (const suffix of suffixes) for (const axis of ["X", "Y", "H"]) {
        const p = row["proj" + axis + suffix], f = row["fact" + axis + suffix];
        if (p == null || f == null || p === "" || f === "") continue;
        const line = document.createElement("div");
        line.textContent = `${index + 1} ${axis}${suffix ? " " + suffix.slice(-1) : ""}: ${p} / ${f} m; Δ=${((Number(f) - Number(p)) * 1000).toFixed(1)} mm`;
        geoResult.append(line);
      }
    }
    data.lastMsg = geoResult.innerHTML;
  }

  btnSaveNode?.addEventListener("click", async () => {
    if (!validateProject(getCurrentProjectId())) return;
    if (geoResult.dataset.legacyUnits === "1") {
      showNotification("Единицы старой записи не определены. Исходная запись сохранена; создайте новую проверку после очистки формы.", "warning");
      return;
    }
    const geoFlags = getGeoConstructionFlags();
    const geoBehavior = getConstructionModuleBehavior(
      getCurrentConstructionKey(),
      "geo",
      getCurrentConstructionSubtype()
    );

    if (geoFlags.isUnsupported) {
      setGeoUnsupportedState({ notify: true });
      return;
    }

    if (geoBehavior.floorRequired !== false && !validateRequiredField(floorEl, "Этаж")) return;

    // Специальная обработка для колонн
    if (geoFlags.isColumn) {
      if (columns.length === 0) {
        showNotification("Ошибка: необходимо добавить хотя бы одну колонну.", "error");
        return;
      }

      // Можно сохранять колонны с любыми данными - проверка будет выполнена позже при заполнении всех полей

      const columnMark = normalizeMarking(columnMarkEl.value);
      const floor = floorEl.value.trim();

      // Используем существующий ключ для обновления или создаем новый
      let key = geodesyNodeState.currentNodeKeys.column;
      if (!key || !nodes.has(key)) {
        // Создаем новый ключ на основе маркировки и этажа
        const markPart = columnMark ? toDocIdPart(columnMark.replace(/\s+/g, "_")) : "no_mark";
        const floorPart = floor ? toDocIdPart(floor.replace(/\s+/g, "_")) : "no_floor";
        key = `columns_${markPart}_${floorPart}_${Date.now()}`;
      }

      // Вычисляем статус узла колонны с помощью чистой функции
      const columnToleranceXY = getInspectionToleranceValue(
        getCurrentConstructionKey(),
        "geo",
        "geoPlan",
        TOLERANCES.PLAN_XY,
        getCurrentConstructionSubtype()
      );
      const evaluation = evaluateGeoColumnNode(columns, columnToleranceXY);

      // Определяем dataStatus на основе заполненности
      const dataStatus = evaluation.hasAllData ? "checked" :
                         (evaluation.hasProjXY ? "project_only" :
                         (evaluation.hasFactXY ? "fact_only" : "empty"));

      const data: GeodesyNodeRecord = {
        acceptanceCriteria: readAcceptanceCriteria(document.getElementById("geo")),
        evaluationSchemaVersion: 2,
        coordinateUnit: "m", deviationUnit: "mm", measurementSchemaVersion: 2,
        type: "columns",
        ...buildCurrentConstructionPayload(),
        columnMark: columnMark || null,
        floor: floor || null,
        ...bim.collectNodeData(),
        columns: columns.map(col => {
          const pX = parseDecimal(col.projX);
          const pY = parseDecimal(col.projY);
          const fX = parseDecimal(col.factX);
          const fY = parseDecimal(col.factY);
          return {
            mark: col.mark || null,
            projX: pX,
            factX: fX,
            projY: pY,
            factY: fY
          };
        }),
        // Статус вычисляется на основе данных узла колонны
        dataStatus: dataStatus,
        status: evaluation.status === "empty" ? "pending" : evaluation.status,
        lastMsg: geoResult.innerHTML || ""
      };

      if (nodes.has(key) && nodes.get(key)?.coordinateUnit !== "m") key = `${key}_${Date.now()}`;
    data.createdAt = nodes.get(key)?.createdAt || Date.now();
    geoResult.dataset.loadedKey = key;
    presentSavedNode(data);
    nodes.set(key, data);
      geodesyNodeState.currentNodeKeys.column = key; // Сохраняем ключ для возможного следующего обновления
      renderNodes();
      saveNodes();

      const skipJournal = geodesyNodeState.skipJournalOnce;
      if (geodesyNodeState.skipJournalOnce) {
        geodesyNodeState.skipJournalOnce = false;
      }
      // Добавляем запись в журнал, если узел был проверен (не pending)
      if (!skipJournal && evaluation.status !== "empty" && evaluation.hasAllData) {
        await upsertJournalEntry(buildColumnJournalPayload({
          key,
          construction: getCurrentConstructionKey(),
          columnMark,
          floor,
          columns,
          status: evaluation.status
        }));
      }

      // Обновляем вкладку "Итог"
      updateSummaryTab();

      try {
        await saveProjectNode(key, data);
        console.log("Колонны сохранены в Firebase:", key);
        const projCount = columns.filter(col => {
          const pX = parseFloat(col.projX);
          const pY = parseFloat(col.projY);
          return !isNaN(pX) && !isNaN(pY);
        }).length;
        const factCount = columns.filter(col => {
          const fX = parseFloat(col.factX);
          const fY = parseFloat(col.factY);
          return !isNaN(fX) && !isNaN(fY);
        }).length;

        if (projCount === 0 && factCount === 0) {
          showNotification("Колонны сохранены. Заполните данные для проверки.", "info");
        } else if (projCount === 0) {
          showNotification("Колонны сохранены с фактическими данными. Заполните проектные данные для проверки.", "info");
        } else if (factCount === 0) {
          showNotification("Колонны сохранены с проектными данными. На объекте заполните фактические данные для проверки.", "info");
        } else if (factCount < columns.length) {
          showNotification(`Колонны сохранены. Заполнены фактические данные для ${factCount} из ${columns.length} колонн.`, "info");
        } else {
          showNotification("Колонны успешно сохранены!", "success");
        }
      } catch (err) {
        console.error("Ошибка Firebase:", err);
        showNotification("Ошибка сохранения в Firebase.", "error");
      }

      return;
    }

    // Специальная обработка для стен
    if (geoFlags.isWall) {
      const wallEntityLabel = getGeoWallEntityLabel();
      const wallEntityPlural = getGeoWallEntityPlural();
      const wallEntityPluralGenitive = getGeoWallEntityPluralGenitive();
      const wallEntityAddText = getGeoWallEntityAddText();
      if (walls.length === 0) {
        showNotification(`Ошибка: необходимо добавить хотя бы ${getGeoWallEntityRequiredText()}.`, "error");
        return;
      }

      const floor = floorEl.value.trim();
      const wallAxisState = getGeoAxisState(getCurrentConstructionKey());
      if (wallAxisState.isPlate && !validateGeoPlateAxisRange({ showWarning: true })) {
        return;
      }

      // Используем существующий ключ для обновления или создаем новый
      let key = geodesyNodeState.currentNodeKeys.wall;
      if (!key || !nodes.has(key)) {
        const floorPart = floor ? toDocIdPart(floor.replace(/\s+/g, "_")) : "no_floor";
        key = `walls_${floorPart}_${Date.now()}`;
      }

      // Вычисляем статус узла стены с помощью чистой функции
      const wallToleranceXY = getInspectionToleranceValue(
        getCurrentConstructionKey(),
        "geo",
        "geoPlan",
        TOLERANCES.PLAN_XY,
        getCurrentConstructionSubtype()
      );
      const evaluation = evaluateGeoWallNode(walls, wallToleranceXY);

      // Определяем dataStatus на основе заполненности
      const dataStatus = evaluation.hasAllData ? "checked" :
                         (evaluation.hasProjXY ? "project_only" :
                         (evaluation.hasFactXY ? "fact_only" : "empty"));

      const data: GeodesyNodeRecord = {
        acceptanceCriteria: readAcceptanceCriteria(document.getElementById("geo")),
        evaluationSchemaVersion: 2,
        coordinateUnit: "m", deviationUnit: "mm", measurementSchemaVersion: 2,
        type: "walls",
        ...buildCurrentConstructionPayload(),
        floor: floor || null,
        location: wallAxisState.isPlate ? (wallAxisState.location || null) : null,
        axisLetterFrom: wallAxisState.isPlate ? (wallAxisState.letterFrom || null) : null,
        axisLetterTo: wallAxisState.isPlate ? (wallAxisState.letterTo || null) : null,
        axisNumberFrom: wallAxisState.isPlate ? (wallAxisState.numberFrom || null) : null,
        axisNumberTo: wallAxisState.isPlate ? (wallAxisState.numberTo || null) : null,
        openingPoints: geoBehavior.showOpeningPoints
          ? plateOpeningPoints
              .map((point) => ({
                projX: point.projX === "" ? null : +point.projX,
                projY: point.projY === "" ? null : +point.projY,
                factX: point.factX === "" ? null : +point.factX,
                factY: point.factY === "" ? null : +point.factY
              }))
              .filter((point) => point.projX != null || point.projY != null || point.factX != null || point.factY != null)
          : null,
        ...bim.collectNodeData(),
        walls: walls.map(wall => {
          if (wall.bindingType === "number_letters") {
            const pX1 = parseFloat(wall.projX_num_let1);
            const pY1 = parseFloat(wall.projY_num_let1);
            const fX1 = parseFloat(wall.factX_num_let1);
            const fY1 = parseFloat(wall.factY_num_let1);
            const pX2 = parseFloat(wall.projX_num_let2);
            const pY2 = parseFloat(wall.projY_num_let2);
            const fX2 = parseFloat(wall.factX_num_let2);
            const fY2 = parseFloat(wall.factY_num_let2);
            return {
              bindingType: wall.bindingType,
              numberAxis: wall.numberAxis || null,
              letterAxis1: wall.letterAxis1 || null,
              letterAxis2: wall.letterAxis2 || null,
              projX_num_let1: !isNaN(pX1) ? +wall.projX_num_let1 : null,
              factX_num_let1: !isNaN(fX1) ? +wall.factX_num_let1 : null,
              projY_num_let1: !isNaN(pY1) ? +wall.projY_num_let1 : null,
              factY_num_let1: !isNaN(fY1) ? +wall.factY_num_let1 : null,
              projX_num_let2: !isNaN(pX2) ? +wall.projX_num_let2 : null,
              factX_num_let2: !isNaN(fX2) ? +wall.factX_num_let2 : null,
              projY_num_let2: !isNaN(pY2) ? +wall.projY_num_let2 : null,
              factY_num_let2: !isNaN(fY2) ? +wall.factY_num_let2 : null
            };
          } else {
            const pX1 = parseFloat(wall.projX_let_num1);
            const pY1 = parseFloat(wall.projY_let_num1);
            const fX1 = parseFloat(wall.factX_let_num1);
            const fY1 = parseFloat(wall.factY_let_num1);
            const pX2 = parseFloat(wall.projX_let_num2);
            const pY2 = parseFloat(wall.projY_let_num2);
            const fX2 = parseFloat(wall.factX_let_num2);
            const fY2 = parseFloat(wall.factY_let_num2);
            return {
              bindingType: wall.bindingType,
              letterAxis: wall.letterAxis || null,
              numberAxis1: wall.numberAxis1 || null,
              numberAxis2: wall.numberAxis2 || null,
              projX_let_num1: !isNaN(pX1) ? +wall.projX_let_num1 : null,
              factX_let_num1: !isNaN(fX1) ? +wall.factX_let_num1 : null,
              projY_let_num1: !isNaN(pY1) ? +wall.projY_let_num1 : null,
              factY_let_num1: !isNaN(fY1) ? +wall.factY_let_num1 : null,
              projX_let_num2: !isNaN(pX2) ? +wall.projX_let_num2 : null,
              factX_let_num2: !isNaN(fX2) ? +wall.factX_let_num2 : null,
              projY_let_num2: !isNaN(pY2) ? +wall.projY_let_num2 : null,
              factY_let_num2: !isNaN(fY2) ? +wall.factY_let_num2 : null
            };
          }
        }),
        // Статус вычисляется на основе данных узла стены
        dataStatus: dataStatus,
        status: evaluation.status === "empty" ? "pending" : evaluation.status,
        lastMsg: geoResult.innerHTML || ""
      };

      if (nodes.has(key) && nodes.get(key)?.coordinateUnit !== "m") key = `${key}_${Date.now()}`;
    data.createdAt = nodes.get(key)?.createdAt || Date.now();
    geoResult.dataset.loadedKey = key;
    presentSavedNode(data);
    nodes.set(key, data);
      geodesyNodeState.currentNodeKeys.wall = key;
      renderNodes();
      saveNodes();

      const skipJournal = geodesyNodeState.skipJournalOnce;
      if (geodesyNodeState.skipJournalOnce) {
        geodesyNodeState.skipJournalOnce = false;
      }
      // Добавляем запись в журнал, если узел был проверен
      if (!skipJournal && evaluation.status !== "empty" && evaluation.hasAllData) {
        await upsertJournalEntry(buildLinearJournalPayload({
          key,
          construction: getCurrentConstructionKey(),
          floor,
          rows: walls,
          status: evaluation.status,
          entityLabel: wallEntityLabel,
          entityPlural: wallEntityPlural,
          emptyDetails: `Проверка ${wallEntityPluralGenitive}`
        }));
      }

      // Обновляем вкладку "Итог"
      updateSummaryTab();

      try {
        await saveProjectNode(key, data);
        console.log(`${wallEntityPlural} сохранены в Firebase:`, key);
        const projCount = walls.filter(wall => {
          if (wall.bindingType === "number_letters") {
            const pX1 = parseFloat(wall.projX_num_let1);
            const pY1 = parseFloat(wall.projY_num_let1);
            const pX2 = parseFloat(wall.projX_num_let2);
            const pY2 = parseFloat(wall.projY_num_let2);
            return !isNaN(pX1) && !isNaN(pY1) && !isNaN(pX2) && !isNaN(pY2);
          } else {
            const pX1 = parseFloat(wall.projX_let_num1);
            const pY1 = parseFloat(wall.projY_let_num1);
            const pX2 = parseFloat(wall.projX_let_num2);
            const pY2 = parseFloat(wall.projY_let_num2);
            return !isNaN(pX1) && !isNaN(pY1) && !isNaN(pX2) && !isNaN(pY2);
          }
        }).length;
        const factCount = walls.filter(wall => {
          if (wall.bindingType === "number_letters") {
            const fX1 = parseFloat(wall.factX_num_let1);
            const fY1 = parseFloat(wall.factY_num_let1);
            const fX2 = parseFloat(wall.factX_num_let2);
            const fY2 = parseFloat(wall.factY_num_let2);
            return !isNaN(fX1) && !isNaN(fY1) && !isNaN(fX2) && !isNaN(fY2);
          } else {
            const fX1 = parseFloat(wall.factX_let_num1);
            const fY1 = parseFloat(wall.factY_let_num1);
            const fX2 = parseFloat(wall.factX_let_num2);
            const fY2 = parseFloat(wall.factY_let_num2);
            return !isNaN(fX1) && !isNaN(fY1) && !isNaN(fX2) && !isNaN(fY2);
          }
        }).length;

        if (projCount === 0 && factCount === 0) {
          showNotification(`${wallEntityPlural} сохранены. Заполните данные для проверки.`, "info");
        } else if (projCount === 0) {
          showNotification(`${wallEntityPlural} сохранены с фактическими данными. Заполните проектные данные для проверки.`, "info");
        } else if (factCount === 0) {
          showNotification(`${wallEntityPlural} сохранены с проектными данными. На объекте заполните фактические данные для проверки.`, "info");
        } else if (factCount < walls.length) {
          showNotification(`${wallEntityPlural} сохранены. Заполнены фактические данные для ${factCount} из ${walls.length} ${wallEntityPluralGenitive}.`, "info");
        } else {
          showNotification(`${wallEntityPlural} успешно сохранены!`, "success");
        }
      } catch (err) {
        console.error("Ошибка Firebase:", err);
        showNotification("Ошибка сохранения в Firebase.", "error");
      }

      return;
    }

    // Специальная обработка для балок
    if (geoFlags.isBeam) {
      if (beams.length === 0) {
        showNotification("Ошибка: необходимо добавить хотя бы одну балку.", "error");
        return;
      }

      const floor = floorEl.value.trim();

      // Используем существующий ключ для обновления или создаем новый
      let key = geodesyNodeState.currentNodeKeys.beam;
      if (!key || !nodes.has(key)) {
        const floorPart = floor ? toDocIdPart(floor.replace(/\s+/g, "_")) : "no_floor";
        key = `beams_${floorPart}_${Date.now()}`;
      }

      const beamToleranceXY = getInspectionToleranceValue(
        getCurrentConstructionKey(),
        "geo",
        "geoPlan",
        TOLERANCES.PLAN_XY,
        getCurrentConstructionSubtype()
      );
      // Вычисляем статус узла балки с помощью чистой функции
      const evaluation = evaluateGeoBeamNode(beams, beamToleranceXY);

      // Определяем dataStatus на основе заполненности
      const dataStatus = evaluation.hasAllData ? "checked" :
                         (evaluation.hasProjXY ? "project_only" :
                         (evaluation.hasFactXY ? "fact_only" : "empty"));

      const data: GeodesyNodeRecord = {
        acceptanceCriteria: readAcceptanceCriteria(document.getElementById("geo")),
        evaluationSchemaVersion: 2,
        coordinateUnit: "m", deviationUnit: "mm", measurementSchemaVersion: 2,
        type: "beams",
        ...buildCurrentConstructionPayload(),
        floor: floor || null,
        ...bim.collectNodeData(),
        beams: beams.map(beam => {
          if (beam.bindingType === "number_letters") {
            const pX1 = parseFloat(beam.projX_num_let1);
            const pY1 = parseFloat(beam.projY_num_let1);
            const fX1 = parseFloat(beam.factX_num_let1);
            const fY1 = parseFloat(beam.factY_num_let1);
            const pX2 = parseFloat(beam.projX_num_let2);
            const pY2 = parseFloat(beam.projY_num_let2);
            const fX2 = parseFloat(beam.factX_num_let2);
            const fY2 = parseFloat(beam.factY_num_let2);
            return {
              bindingType: beam.bindingType,
              numberAxis: beam.numberAxis || null,
              letterAxis1: beam.letterAxis1 || null,
              letterAxis2: beam.letterAxis2 || null,
              projX_num_let1: !isNaN(pX1) ? +beam.projX_num_let1 : null,
              factX_num_let1: !isNaN(fX1) ? +beam.factX_num_let1 : null,
              projY_num_let1: !isNaN(pY1) ? +beam.projY_num_let1 : null,
              factY_num_let1: !isNaN(fY1) ? +beam.factY_num_let1 : null,
              projX_num_let2: !isNaN(pX2) ? +beam.projX_num_let2 : null,
              factX_num_let2: !isNaN(fX2) ? +beam.factX_num_let2 : null,
              projY_num_let2: !isNaN(pY2) ? +beam.projY_num_let2 : null,
              factY_num_let2: !isNaN(fY2) ? +beam.factY_num_let2 : null
            };
          } else {
            const pX1 = parseFloat(beam.projX_let_num1);
            const pY1 = parseFloat(beam.projY_let_num1);
            const fX1 = parseFloat(beam.factX_let_num1);
            const fY1 = parseFloat(beam.factY_let_num1);
            const pX2 = parseFloat(beam.projX_let_num2);
            const pY2 = parseFloat(beam.projY_let_num2);
            const fX2 = parseFloat(beam.factX_let_num2);
            const fY2 = parseFloat(beam.factY_let_num2);
            return {
              bindingType: beam.bindingType,
              letterAxis: beam.letterAxis || null,
              numberAxis1: beam.numberAxis1 || null,
              numberAxis2: beam.numberAxis2 || null,
              projX_let_num1: !isNaN(pX1) ? +beam.projX_let_num1 : null,
              factX_let_num1: !isNaN(fX1) ? +beam.factX_let_num1 : null,
              projY_let_num1: !isNaN(pY1) ? +beam.projY_let_num1 : null,
              factY_let_num1: !isNaN(fY1) ? +beam.factY_let_num1 : null,
              projX_let_num2: !isNaN(pX2) ? +beam.projX_let_num2 : null,
              factX_let_num2: !isNaN(fX2) ? +beam.factX_let_num2 : null,
              projY_let_num2: !isNaN(pY2) ? +beam.projY_let_num2 : null,
              factY_let_num2: !isNaN(fY2) ? +beam.factY_let_num2 : null
            };
          }
        }),
        // Статус вычисляется на основе данных узла балки
        dataStatus: dataStatus,
        status: evaluation.status === "empty" ? "pending" : evaluation.status,
        lastMsg: geoResult.innerHTML || ""
      };

      if (nodes.has(key) && nodes.get(key)?.coordinateUnit !== "m") key = `${key}_${Date.now()}`;
    data.createdAt = nodes.get(key)?.createdAt || Date.now();
    geoResult.dataset.loadedKey = key;
    presentSavedNode(data);
    nodes.set(key, data);
      geodesyNodeState.currentNodeKeys.beam = key;
      renderNodes();
      saveNodes();

      const skipJournal = geodesyNodeState.skipJournalOnce;
      if (geodesyNodeState.skipJournalOnce) {
        geodesyNodeState.skipJournalOnce = false;
      }
      // Добавляем запись в журнал, если узел был проверен
      if (!skipJournal && evaluation.status !== "empty" && evaluation.hasAllData) {
        await upsertJournalEntry(buildLinearJournalPayload({
          key,
          construction: getCurrentConstructionKey(),
          floor,
          rows: beams,
          status: evaluation.status,
          entityLabel: "Балка",
          entityPlural: "Балки",
          emptyDetails: "Проверка балок"
        }));
      }

      // Обновляем вкладку "Итог"
      updateSummaryTab();

      try {
        await saveProjectNode(key, data);
        console.log("Балки сохранены в Firebase:", key);
        const projCount = beams.filter(beam => {
          if (beam.bindingType === "number_letters") {
            const pX1 = parseFloat(beam.projX_num_let1);
            const pY1 = parseFloat(beam.projY_num_let1);
            const pX2 = parseFloat(beam.projX_num_let2);
            const pY2 = parseFloat(beam.projY_num_let2);
            return !isNaN(pX1) && !isNaN(pY1) && !isNaN(pX2) && !isNaN(pY2);
          } else {
            const pX1 = parseFloat(beam.projX_let_num1);
            const pY1 = parseFloat(beam.projY_let_num1);
            const pX2 = parseFloat(beam.projX_let_num2);
            const pY2 = parseFloat(beam.projY_let_num2);
            return !isNaN(pX1) && !isNaN(pY1) && !isNaN(pX2) && !isNaN(pY2);
          }
        }).length;
        const factCount = beams.filter(beam => {
          if (beam.bindingType === "number_letters") {
            const fX1 = parseFloat(beam.factX_num_let1);
            const fY1 = parseFloat(beam.factY_num_let1);
            const fX2 = parseFloat(beam.factX_num_let2);
            const fY2 = parseFloat(beam.factY_num_let2);
            return !isNaN(fX1) && !isNaN(fY1) && !isNaN(fX2) && !isNaN(fY2);
          } else {
            const fX1 = parseFloat(beam.factX_let_num1);
            const fY1 = parseFloat(beam.factY_let_num1);
            const fX2 = parseFloat(beam.factX_let_num2);
            const fY2 = parseFloat(beam.factY_let_num2);
            return !isNaN(fX1) && !isNaN(fY1) && !isNaN(fX2) && !isNaN(fY2);
          }
        }).length;

        if (projCount === 0 && factCount === 0) {
          showNotification("Балки сохранены. Заполните данные для проверки.", "info");
        } else if (projCount === 0) {
          showNotification("Балки сохранены с фактическими данными. Заполните проектные данные для проверки.", "info");
        } else if (factCount === 0) {
          showNotification("Балки сохранены с проектными данными. На объекте заполните фактические данные для проверки.", "info");
        } else if (factCount < beams.length) {
          showNotification(`Балки сохранены. Заполнены фактические данные для ${factCount} из ${beams.length} балок.`, "info");
        } else {
          showNotification("Балки успешно сохранены!", "success");
        }
      } catch (err) {
        console.error("Ошибка Firebase:", err);
        showNotification("Ошибка сохранения в Firebase.", "error");
      }

      return;
    }

    // Обычное сохранение для остальных конструкций
    // Можно сохранять с любыми данными - проверка будет выполнена позже при заполнении всех полей
    const pX = parseFloat(projX.value);
    const fX = parseFloat(factX.value);
    const pY = parseFloat(projY.value);
    const fY = parseFloat(factY.value);
    const pH = parseFloat(projH.value);
    const fH = parseFloat(factH.value);

    const floor = geoBehavior.floorVisible === false ? "" : floorEl.value.trim();
    const axisState = getGeoAxisState(construction.value || "Плита");
    if (axisState.isPlate && !validateGeoPlateAxisRange({ showWarning: true })) {
      return;
    }
    let key = geoResult.dataset.loadedKey || buildGeoNodeKey({
      constructionValue: getCurrentConstructionKey(),
      floorValue: floor,
      letterValue: axisState.isPlate ? "" : axisState.letter,
      numberValue: axisState.isPlate ? "" : axisState.number,
      letterFrom: axisState.isPlate ? axisState.letterFrom : "",
      letterTo: axisState.isPlate ? axisState.letterTo : "",
      numberFrom: axisState.isPlate ? axisState.numberFrom : "",
      numberTo: axisState.isPlate ? axisState.numberTo : ""
    });

    // Подготавливаем данные узла для вычисления статуса
    const nodeDataForEval = {
      projX: !isNaN(pX) ? +projX.value : null,
      factX: !isNaN(fX) ? +factX.value : null,
      projY: !isNaN(pY) ? +projY.value : null,
      factY: !isNaN(fY) ? +factY.value : null,
      projH: !isNaN(pH) ? +projH.value : null,
      factH: !isNaN(fH) ? +factH.value : null
    };

    // Вычисляем статус узла с помощью чистой функции
    const geoToleranceXY = getInspectionToleranceValue(
      getCurrentConstructionKey(),
      "geo",
      "geoPlan",
      TOLERANCES.PLAN_XY,
      getCurrentConstructionSubtype()
    );
    const geoToleranceH = getInspectionToleranceValue(
      getCurrentConstructionKey(),
      "geo",
      "geoHeight",
      TOLERANCES.HEIGHT,
      getCurrentConstructionSubtype()
    );
    const evaluation = evaluateGeoNode(nodeDataForEval, geoToleranceXY, geoToleranceH);
    if ([projX, projY, projH].some(input => input.dataset.unitUnconfirmed === "1")) evaluation.status = "empty";

    const stairNameValue = geoBehavior.showStairName ? (geoStairNameEl?.value?.trim() || "") : "";
    const plateFlatnessData = geoBehavior.showGeoFlatnessCheck ? collectGeoPlateFlatnessData() : null;
    const plateFlatnessComplete = Boolean(
      plateFlatnessData &&
      plateFlatnessData.actual != null &&
      plateFlatnessData.tolerance != null
    );
    const plateFlatnessBlocksOkStatus = Boolean(
      plateFlatnessData &&
      plateFlatnessComplete &&
      plateFlatnessData.result === "exceeded"
    );
    const openingEvaluation = geoBehavior.showOpeningPoints && plateOpeningPoints.length
      ? evaluateGeoColumnNode(plateOpeningPoints.map(point => ({ ...point, id: Number(point.id), mark: "" })), geoToleranceXY) : null;
    const finalEvaluationStatus = plateFlatnessBlocksOkStatus || evaluation.status === "bad" || openingEvaluation?.status === "bad"
      ? "bad" : evaluation.status === "empty" || (plateFlatnessData && !plateFlatnessComplete) || openingEvaluation?.status === "empty" ? "empty" : evaluation.status;

    // Определяем dataStatus на основе заполненности
    const dataStatus = evaluation.hasAllData && (!plateFlatnessData || plateFlatnessComplete) ? "checked" :
                       (evaluation.hasProjXY ? "project_only" :
                       (evaluation.hasFactXY ? "fact_only" : "empty"));
    const data: GeodesyNodeRecord = {
        acceptanceCriteria: readAcceptanceCriteria(document.getElementById("geo")),
        evaluationSchemaVersion: 2,
        coordinateUnit: "m", deviationUnit: "mm", measurementSchemaVersion: 2,
      ...buildCurrentConstructionPayload(),
      ...bim.collectNodeData(),
      floor: geoBehavior.floorVisible === false ? null : (floor || null),
      location: axisState.isPlate ? (axisState.location || null) : null,
      stairName: stairNameValue || null,
      plateFlatnessChecked: plateFlatnessData ? plateFlatnessData.checked : null,
      plateFlatnessActual: plateFlatnessData ? plateFlatnessData.actual : null,
      plateFlatnessBase: plateFlatnessData ? plateFlatnessData.base : null,
      plateFlatnessClass: plateFlatnessData ? plateFlatnessData.surfaceClass : null,
      plateFlatnessTolerance: plateFlatnessData ? plateFlatnessData.tolerance : null,
      plateFlatnessResult: plateFlatnessData ? (plateFlatnessData.result || null) : null,
      openingPoints: geoBehavior.showOpeningPoints
        ? plateOpeningPoints
            .map((point) => ({
              projX: point.projX === "" ? null : +point.projX,
              projY: point.projY === "" ? null : +point.projY,
              factX: point.factX === "" ? null : +point.factX,
              factY: point.factY === "" ? null : +point.factY
            }))
            .filter((point) => point.projX != null || point.projY != null || point.factX != null || point.factY != null)
        : null,
      letter: axisState.isPlate ? null : axisState.letter,
      number: axisState.isPlate ? null : axisState.number,
      axisMode: axisState.isPlate ? (axisState.axisMode || null) : null,
      axisLetterFrom: axisState.isPlate ? (axisState.letterFrom || null) : null,
      axisLetterTo: axisState.isPlate ? (axisState.letterTo || null) : null,
      axisNumberFrom: axisState.isPlate ? (axisState.numberFrom || null) : null,
      axisNumberTo: axisState.isPlate ? (axisState.numberTo || null) : null,

      projX: nodeDataForEval.projX,
      factX: nodeDataForEval.factX,
      projY: nodeDataForEval.projY,
      factY: nodeDataForEval.factY,
      projH: nodeDataForEval.projH,
      factH: nodeDataForEval.factH,

      // Статус вычисляется на основе данных узла
      dataStatus: dataStatus,
      status: finalEvaluationStatus === "empty" ? "pending" : finalEvaluationStatus,
      lastMsg: geoResult.innerHTML || ""
    };

    if (nodes.has(key) && nodes.get(key)?.coordinateUnit !== "m") key = `${key}_${Date.now()}`;
    data.createdAt = nodes.get(key)?.createdAt || Date.now();
    geoResult.dataset.loadedKey = key;
    presentSavedNode(data);
    nodes.set(key, data);
    renderNodes();
    saveNodes();

    const skipJournal = geodesyNodeState.skipJournalOnce;
    if (geodesyNodeState.skipJournalOnce) {
      geodesyNodeState.skipJournalOnce = false;
    }
    // Добавляем запись в журнал, если узел был проверен (не pending)
    if (!skipJournal && finalEvaluationStatus !== "empty" && evaluation.hasAllData && (!plateFlatnessData || plateFlatnessComplete)) {
      const allOk = finalEvaluationStatus === "ok";
      const contextLabel = axisState.location || axisState.nodeLabel || "узел";
      const context = floor ? `${floor}-${contextLabel}` : contextLabel;
      const detailsParts = [];
      if (!isNaN(pX) && !isNaN(fX)) detailsParts.push(`ΔX=${(Math.abs(fX - pX) * 1000).toFixed(1)} мм`);
      if (!isNaN(pY) && !isNaN(fY)) detailsParts.push(`ΔY=${(Math.abs(fY - pY) * 1000).toFixed(1)} мм`);
      if (!isNaN(pH) && !isNaN(fH)) detailsParts.push(`ΔH=${(Math.abs(fH - pH) * 1000).toFixed(1)} мм`);
      if (plateFlatnessData && plateFlatnessComplete) {
        detailsParts.push(`Плоскостность=${plateFlatnessData.actual.toFixed(1)} мм при допуске ${plateFlatnessData.tolerance.toFixed(1)} мм`);
      }

      await upsertJournalEntry({
        evaluationSchemaVersion: 2,
        module: "Геодезия",
        status: allOk ? "ok" : "exceeded",
        context: context,
        details: detailsParts.join("; ") || "Проверка узла",
        sourceId: key,
        construction: data.construction || getCurrentConstructionKey()
      });
    }

    // Обновляем вкладку "Итог"
    updateSummaryTab();

    try {
      await saveProjectNode(key, data);
      console.log("Узел сохранён в Firebase:", key);
        const hasProj = !isNaN(pX) && !isNaN(pY);
        const hasFact = !isNaN(fX) && !isNaN(fY);
        if (!hasProj && !hasFact) {
          showNotification("Узел сохранён. Заполните данные для проверки.", "info");
        } else if (!hasProj) {
          showNotification("Узел сохранён с фактическими данными. Заполните проектные данные для проверки.", "info");
        } else if (!hasFact) {
          showNotification("Узел сохранён с проектными данными. На объекте заполните фактические данные для проверки.", "info");
        } else {
          showNotification("Узел успешно сохранён!", "success");
        }
    } catch (err) {
      console.error("Ошибка Firebase:", err);
      showNotification("Ошибка сохранения в Firebase.", "error");
    }
  });

  btnUpdateNode?.addEventListener("click", () => {
    const geoFlags = getGeoConstructionFlags();
    if (geoFlags.isUnsupported) {
      setGeoUnsupportedState({ notify: true });
      return;
    }

    // Специальная обработка для колонн
    if (geoFlags.isColumn) {
      if (
        !geodesyNodeState.currentNodeKeys.column ||
        !nodes.has(geodesyNodeState.currentNodeKeys.column)
      ) {
        showNotification("Сначала сохраните узел колонн.", "warning");
        return;
      }
      btnSaveNode?.click();
      return;
    }

    // Обычная обработка для остальных конструкций
    const floor = geoFlags.behavior.floorVisible === false ? "" : floorEl.value.trim();
    const axisState = getGeoAxisState(getCurrentConstructionKey() || construction.value || "floor_slab");
    if (axisState.isPlate && !validateGeoPlateAxisRange({ showWarning: true })) {
      return;
    }
    let key = geoResult.dataset.loadedKey || buildGeoNodeKey({
      constructionValue: getCurrentConstructionKey(),
      floorValue: floor,
      letterValue: axisState.isPlate ? "" : axisState.letter,
      numberValue: axisState.isPlate ? "" : axisState.number,
      letterFrom: axisState.isPlate ? axisState.letterFrom : "",
      letterTo: axisState.isPlate ? axisState.letterTo : "",
      numberFrom: axisState.isPlate ? axisState.numberFrom : "",
      numberTo: axisState.isPlate ? axisState.numberTo : ""
    });
    if (!nodes.has(key)) {
      showNotification("Сначала сохраните узел.", "warning");
      return;
    }
    btnSaveNode?.click();
  });

  btnClearForm?.addEventListener("click", async () => {
    delete geoResult.dataset.legacyUnits;
    delete geoResult.dataset.loadedKey;
    restoreAcceptanceCriteria(document.getElementById("geo"));
    const geoFlags = getGeoConstructionFlags();
    floorEl.value = "";
    columnMarkEl.value = "";
    if (geoStairNameEl) {
      geoStairNameEl.value = "";
    }
    if (geoPlateFlatnessCheckedEl) {
      geoPlateFlatnessCheckedEl.checked = false;
    }
    if (geoPlateFlatnessActualEl) geoPlateFlatnessActualEl.value = "";
    if (geoPlateFlatnessBaseEl) geoPlateFlatnessBaseEl.value = "2";
    if (geoPlateFlatnessClassEl) geoPlateFlatnessClassEl.value = "project";
    if (geoPlateFlatnessToleranceEl) geoPlateFlatnessToleranceEl.value = "";
    updateGeoPlateFlatnessCalculatedFields();
    resetGeodesyFormState(
      geodesyNodeState,
      geoFlags.isColumn
        ? "column"
        : geoFlags.isWall
          ? "wall"
          : geoFlags.isBeam
            ? "beam"
            : "node"
    );
    bim.clear({ keepManualFields: false });
    axisLetterEl.value = APP_CONFIG.DEFAULT_LETTER_AXIS;
    axisNumberEl.value = APP_CONFIG.DEFAULT_NUMBER_AXIS;
    resetGeoPlateAxisFields();
    [projX, factX, projY, factY, projH, factH].forEach(el => (el.value = ""));
    renderGeoPlateOpeningPoints();
    if (geoFlags.isColumn) {
      renderColumns();
    } else if (geoFlags.isWall) {
      renderWalls();
    } else if (geoFlags.isBeam) {
      renderBeams();
    }
    geoResult.className = "result";
    geoResult.innerHTML = "";
    state.geo = false;
    checked.geo = false;
    updateNodeId();
    setUpdateNodeVisibility(false);
    saveMeta();
    cancelProjectDesignAutosave();
    try {
      await saveProjectDesign();
    } catch (error) {
      console.error("Не удалось сохранить очищенное состояние формы геодезии:", error);
    }
  });

  async function clearGeoNodesForCurrentProject() {
    const result = await geodesyNodeActions.clearProjectNodes(getCurrentProjectId());

    updateSummaryTab();
    return result;
  }

  btnClearNodes?.addEventListener("click", async () => {
    if (!(await showConfirm("Удалить все сохранённые проверки геодезии для текущего проекта?", { anchor: btnClearNodes }))) return;

    if (!getCurrentProjectId()) {
      showNotification("Сначала создайте объект или выберите существующий.", "warning");
      return;
    }

    console.log("[btnClearNodes] Очистка узлов геодезии");
    console.log("[btnClearNodes] projectId:", getCurrentProjectId());
    console.log("[btnClearNodes] Путь Firestore: projects/" + getCurrentProjectId() + "/geoNodes");

    try {
      const { deletedCount, deletedDualWriteCount } = await clearGeoNodesForCurrentProject();
      console.log("[btnClearNodes] Найдено документов в Firestore:", deletedCount);
      console.log("[btnClearNodes] Удалено документов из Firestore:", deletedCount);
      console.log("[btnClearNodes] Удалено документов dual-write из inspections:", deletedDualWriteCount);
      showNotification("Все проверки геодезии удалены для текущего проекта.", "success");
    } catch (e) {
      console.error("[btnClearNodes] Ошибка удаления из Firestore:", e);
      showNotification("Ошибка при удалении узлов из базы данных: " + e.message, "error");
    }
  });

  // Очистка сохранённых проверок армирования
}
