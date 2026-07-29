import {
  getConstructionModuleBehavior
} from "../../../app/construction.js";
import { getInspectionToleranceValue } from "../../../app/inspection-registry.js";
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
  const TOL_PLAN = 8;
  const TOL_H = 10;
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

  btnGeo?.addEventListener("click", () => {
    if (!validateProject(getCurrentProjectId())) return;

    let shouldAutoSave = true;
    const scheduleAutoSave = () => {
      if (!shouldAutoSave) return;
      btnSaveNode?.click();
    };
    setTimeout(scheduleAutoSave, 0);

    const geoBehavior = getConstructionModuleBehavior(
      getCurrentConstructionKey(),
      "geo",
      getCurrentConstructionSubtype()
    );

    if (geoBehavior.floorRequired !== false && !validateRequiredField(floorEl, "Этаж")) {
      shouldAutoSave = false;
      return;
    }
    const floorValue = geoBehavior.floorVisible === false ? "" : floorEl.value.trim();

    const res = geoResult;
    const geoFlags = getGeoConstructionFlags();

    if (geoFlags.isUnsupported) {
      shouldAutoSave = false;
      setGeoUnsupportedState({ notify: true });
      return;
    }

    // Специальная обработка для колонн
    if (geoFlags.isColumn) {
      if (columns.length === 0) {
        res.className = "result not-ok";
        res.textContent = "Ошибка: необходимо добавить хотя бы одну колонну.";
        state.geo = false;
        checked.geo = false;
        shouldAutoSave = false;
        return;
      }

      let allOk = true;
      let msg = `<div><b>Проверка колонн (${columns.length} шт.)</b></div>`;
      const columnMark = normalizeMarking(columnMarkEl.value);
      const floor = floorValue; // Используем уже проверенное значение этажа
      const geoPlanTolerance = getInspectionToleranceValue(
        getCurrentConstructionKey(),
        "geo",
        "geoPlan",
        TOLERANCES.PLAN_XY,
        getCurrentConstructionSubtype()
      );

      // Сохраняем статус каждой колонны для выделения
      const columnStatuses = [];

      columns.forEach((col, index) => {
        const pX = parseFloat(col.projX);
        const fX = parseFloat(col.factX);
        const pY = parseFloat(col.projY);
        const fY = parseFloat(col.factY);
        const safeColMark = col.mark ? safeValue(col.mark) : "";

        // Проверяем наличие проектных данных
        if (isNaN(pX) || isNaN(pY)) {
          msg += `<div style="color: #ef4444;">Колонна ${index + 1}${safeColMark ? ` (${safeColMark})` : ""}: не заполнены проектные координаты</div>`;
          allOk = false;
          columnStatuses[index] = false;
          return;
        }

        // Если нет фактических данных, пропускаем проверку
        if (isNaN(fX) || isNaN(fY)) {
          msg += `<div style="color: #fbbf24;">Колонна ${index + 1}${safeColMark ? ` (${safeColMark})` : ""}: заполнены только проектные данные, фактические отсутствуют</div>`;
          columnStatuses[index] = null; // null означает "не проверено"
          return;
        }

        const dX = Math.abs(fX - pX);
        const dY = Math.abs(fY - pY);
        const okX = dX <= geoPlanTolerance;
        const okY = dY <= geoPlanTolerance;
        const colOk = okX && okY;

        columnStatuses[index] = colOk;
        if (!colOk) allOk = false;

        const colStyle = colOk ? "" : "color: #ef4444; font-weight: bold;";
        msg += `<div style="margin-top: 6px; ${colStyle}"><b>Колонна ${index + 1}${safeColMark ? ` (${safeColMark})` : ""}:</b>`;
        msg += `<div style="margin-left: 12px;">X: отклонение ${dX.toFixed(1)} мм (допуск ±${geoPlanTolerance} мм) — ${okX ? "в норме" : "превышено"}</div>`;
        msg += `<div style="margin-left: 12px;">Y: отклонение ${dY.toFixed(1)} мм (допуск ±${geoPlanTolerance} мм) — ${okY ? "в норме" : "превышено"}</div>`;
        msg += `</div>`;
      });

      msg += `<div style="margin-top:8px;"><b>Заключение:</b> ${
        allOk
          ? "Все колонны соответствуют допускам."
          : "Есть превышения допусков по СП."
      }</div>`;
      msg += renderRegulatoryBasisHtml({
        moduleKey: "geo",
        checkKind: getCurrentConstructionKey() || construction.value || "Колонна",
        subtype: getCurrentConstructionSubtype(),
        helpTargetId: "geoHelpContent"
      });

      res.className = "result " + (allOk ? "ok" : "not-ok");
      res.innerHTML = msg;
      state.geo = allOk;
      checked.geo = true;

      // Выделяем несоответствующие колонны в интерфейсе красным цветом
      setTimeout(() => {
        columns.forEach((col, index) => {
          const colCard = columnsList.children[index];
          if (!colCard) return;

          if (columnStatuses[index] === false) {
            // Выделяем карточку колонны красной рамкой + glow + бейдж (не соответствует норме)
            colCard.style.borderColor = "#ef4444";
            colCard.style.borderWidth = "2px";
            colCard.style.borderStyle = "solid";
            colCard.style.boxShadow = "0 0 0 2px rgba(239, 68, 68, 0.2), 0 0 8px rgba(239, 68, 68, 0.3)";
            colCard.style.backgroundColor = ""; // Не меняем фон карточки

            // Добавляем бейдж "превышено" в заголовок карточки
            const header = colCard.querySelector('b');
            if (header && !header.querySelector('.error-badge')) {
              const badge = document.createElement('span');
              badge.className = 'error-badge';
              badge.textContent = 'превышено';
              badge.style.cssText = 'margin-left: 8px; padding: 2px 8px; background: #ef4444; color: #fff; border-radius: 4px; font-size: 11px; font-weight: 600;';
              header.appendChild(badge);
            }

            // Выделяем поля ввода только красной рамкой и лёгким фоном
            const colInputs = colCard.querySelectorAll(`[data-col-index="${index}"]`);
            colInputs.forEach(input => {
              input.style.borderColor = "#ef4444";
              input.style.borderWidth = "2px";
              input.style.backgroundColor = "rgba(239, 68, 68, 0.06)"; // Очень слабый красный фон
            });
          } else if (columnStatuses[index] === null) {
            // Выделяем желтым (только проектные данные) - рамка без изменения фона
            colCard.style.borderColor = "#fbbf24";
            colCard.style.borderWidth = "2px";
            colCard.style.borderStyle = "solid";
            colCard.style.boxShadow = "0 0 0 2px rgba(251, 191, 36, 0.2)";
            colCard.style.backgroundColor = "";
          } else {
            // Сбрасываем выделение (в норме)
            colCard.style.borderColor = "";
            colCard.style.borderWidth = "";
            colCard.style.borderStyle = "";
            colCard.style.boxShadow = "";
            colCard.style.backgroundColor = "";

            // Удаляем бейдж "превышено" если есть
            const header = colCard.querySelector('b');
            if (header) {
              const badge = header.querySelector('.error-badge');
              if (badge) badge.remove();
            }

            const colInputs = colCard.querySelectorAll(`[data-col-index="${index}"]`);
            colInputs.forEach(input => {
              input.style.borderColor = "";
              input.style.borderWidth = "";
              input.style.backgroundColor = "";
            });
          }
        });
      }, 100);

      // НЕ обновляем статус узла при проверке - это side effect!
      // Статус должен вычисляться только при сохранении/обновлении узла

      return;
    }

    // Специальная обработка для стен
    if (geoFlags.isWall) {
      const wallEntityLabel = getGeoWallEntityLabel();
      const wallEntityPlural = getGeoWallEntityPlural();
      const wallEntityPluralGenitive = getGeoWallEntityPluralGenitive();
      const wallEntityAddText = getGeoWallEntityAddText();
      const geoPlanTolerance = getInspectionToleranceValue(
        getCurrentConstructionKey(),
        "geo",
        "geoPlan",
        TOLERANCES.PLAN_XY,
        getCurrentConstructionSubtype()
      );
      if (walls.length === 0) {
        res.className = "result not-ok";
        res.textContent = `Ошибка: необходимо добавить хотя бы ${getGeoWallEntityRequiredText()}.`;
        state.geo = false;
        checked.geo = false;
        shouldAutoSave = false;
        return;
      }

      let allOk = true;
      let msg = `<div><b>Проверка ${wallEntityPluralGenitive} (${walls.length} шт.)</b></div>`;
      const floor = floorValue; // Используем уже проверенное значение этажа

      walls.forEach((wall, index) => {
        let wallOk = true;
        let wallMsg = `<div style="margin-top: 6px;"><b>${wallEntityLabel} ${index + 1}:</b>`;
        const safeWallNumberAxis = safeValue(wall.numberAxis || "?");
        const safeWallLetterAxis1 = safeValue(wall.letterAxis1 || "?");
        const safeWallLetterAxis2 = safeValue(wall.letterAxis2 || "?");
        const safeWallLetterAxis = safeValue(wall.letterAxis || "?");
        const safeWallNumberAxis1 = safeValue(wall.numberAxis1 || "?");
        const safeWallNumberAxis2 = safeValue(wall.numberAxis2 || "?");

        if (wall.bindingType === "number_letters") {
          // Проверка для типа "одна цифровая + две буквенные"
          const pX1 = parseFloat(wall.projX_num_let1);
          const fX1 = parseFloat(wall.factX_num_let1);
          const pY1 = parseFloat(wall.projY_num_let1);
          const fY1 = parseFloat(wall.factY_num_let1);
          const pX2 = parseFloat(wall.projX_num_let2);
          const fX2 = parseFloat(wall.factX_num_let2);
          const pY2 = parseFloat(wall.projY_num_let2);
          const fY2 = parseFloat(wall.factY_num_let2);

          const hasProj1 = !isNaN(pX1) && !isNaN(pY1);
          const hasFact1 = !isNaN(fX1) && !isNaN(fY1);
          const hasProj2 = !isNaN(pX2) && !isNaN(pY2);
          const hasFact2 = !isNaN(fX2) && !isNaN(fY2);

          if (!hasProj1 || !hasFact1 || !hasProj2 || !hasFact2) {
            wallMsg += `<div style="color: #fbbf24;">Не заполнены все координаты для ${safeWallNumberAxis}, ${safeWallLetterAxis1}-${safeWallLetterAxis2}</div>`;
            wallOk = false;
          } else {
            const dX1 = Math.abs(fX1 - pX1);
            const dY1 = Math.abs(fY1 - pY1);
            const dX2 = Math.abs(fX2 - pX2);
            const dY2 = Math.abs(fY2 - pY2);
            const ok1 = dX1 <= geoPlanTolerance && dY1 <= geoPlanTolerance;
            const ok2 = dX2 <= geoPlanTolerance && dY2 <= geoPlanTolerance;
            wallOk = ok1 && ok2;

            const style1 = ok1 ? "" : "color: #ef4444; font-weight: bold;";
            const style2 = ok2 ? "" : "color: #ef4444; font-weight: bold;";
            wallMsg += `<div style="margin-left: 12px; ${style1}">${safeWallNumberAxis}, ${safeWallLetterAxis1}: X: ${dX1.toFixed(1)} мм, Y: ${dY1.toFixed(1)} мм — ${ok1 ? "в норме" : "превышено"}</div>`;
            wallMsg += `<div style="margin-left: 12px; ${style2}">${safeWallNumberAxis}, ${safeWallLetterAxis2}: X: ${dX2.toFixed(1)} мм, Y: ${dY2.toFixed(1)} мм — ${ok2 ? "в норме" : "превышено"}</div>`;
          }
        } else {
          // Проверка для типа "одна буквенная + две цифровые"
          const pX1 = parseFloat(wall.projX_let_num1);
          const fX1 = parseFloat(wall.factX_let_num1);
          const pY1 = parseFloat(wall.projY_let_num1);
          const fY1 = parseFloat(wall.factY_let_num1);
          const pX2 = parseFloat(wall.projX_let_num2);
          const fX2 = parseFloat(wall.factX_let_num2);
          const pY2 = parseFloat(wall.projY_let_num2);
          const fY2 = parseFloat(wall.factY_let_num2);

          const hasProj1 = !isNaN(pX1) && !isNaN(pY1);
          const hasFact1 = !isNaN(fX1) && !isNaN(fY1);
          const hasProj2 = !isNaN(pX2) && !isNaN(pY2);
          const hasFact2 = !isNaN(fX2) && !isNaN(fY2);

          if (!hasProj1 || !hasFact1 || !hasProj2 || !hasFact2) {
            wallMsg += `<div style="color: #fbbf24;">Не заполнены все координаты для ${safeWallLetterAxis}, ${safeWallNumberAxis1}-${safeWallNumberAxis2}</div>`;
            wallOk = false;
          } else {
            const dX1 = Math.abs(fX1 - pX1);
            const dY1 = Math.abs(fY1 - pY1);
            const dX2 = Math.abs(fX2 - pX2);
            const dY2 = Math.abs(fY2 - pY2);
            const ok1 = dX1 <= geoPlanTolerance && dY1 <= geoPlanTolerance;
            const ok2 = dX2 <= geoPlanTolerance && dY2 <= geoPlanTolerance;
            wallOk = ok1 && ok2;

            const style1 = ok1 ? "" : "color: #ef4444; font-weight: bold;";
            const style2 = ok2 ? "" : "color: #ef4444; font-weight: bold;";
            wallMsg += `<div style="margin-left: 12px; ${style1}">${safeWallLetterAxis}, ${safeWallNumberAxis1}: X: ${dX1.toFixed(1)} мм, Y: ${dY1.toFixed(1)} мм — ${ok1 ? "в норме" : "превышено"}</div>`;
            wallMsg += `<div style="margin-left: 12px; ${style2}">${safeWallLetterAxis}, ${safeWallNumberAxis2}: X: ${dX2.toFixed(1)} мм, Y: ${dY2.toFixed(1)} мм — ${ok2 ? "в норме" : "превышено"}</div>`;
          }
        }

        wallMsg += `</div>`;
        msg += wallMsg;
        if (!wallOk) allOk = false;
      });

      msg += `<div style="margin-top:8px;"><b>Заключение:</b> ${
        allOk
          ? `Все ${wallEntityPlural.toLocaleLowerCase("ru")} соответствуют допускам.`
          : "Есть превышения допусков по СП."
      }</div>`;
      msg += renderRegulatoryBasisHtml({
        moduleKey: "geo",
        checkKind: getCurrentConstructionKey() || construction.value || "Стена",
        subtype: getCurrentConstructionSubtype(),
        helpTargetId: "geoHelpContent"
      });

      res.className = "result " + (allOk ? "ok" : "not-ok");
      res.innerHTML = msg;
      state.geo = allOk;
      checked.geo = true;

      // НЕ обновляем статус узла при проверке - это side effect!
      // Статус должен вычисляться только при сохранении/обновлении узла

      // Сохранение в журнал
      const details = walls.map((wall, i) => {
        if (wall.bindingType === "number_letters") {
          const pX1 = parseFloat(wall.projX_num_let1);
          const fX1 = parseFloat(wall.factX_num_let1);
          const pY1 = parseFloat(wall.projY_num_let1);
          const fY1 = parseFloat(wall.factY_num_let1);
          const pX2 = parseFloat(wall.projX_num_let2);
          const fX2 = parseFloat(wall.factX_num_let2);
          const pY2 = parseFloat(wall.projY_num_let2);
          const fY2 = parseFloat(wall.factY_num_let2);
          if (isNaN(pX1) || isNaN(fX1) || isNaN(pY1) || isNaN(fY1) || isNaN(pX2) || isNaN(fX2) || isNaN(pY2) || isNaN(fY2)) {
            return `С${i+1}: не заполнено`;
          }
          const dX1 = Math.abs(fX1 - pX1);
          const dY1 = Math.abs(fY1 - pY1);
          const dX2 = Math.abs(fX2 - pX2);
          const dY2 = Math.abs(fY2 - pY2);
          return `С${i+1}: ΔX1=${dX1.toFixed(1)}, ΔY1=${dY1.toFixed(1)}, ΔX2=${dX2.toFixed(1)}, ΔY2=${dY2.toFixed(1)}`;
        } else {
          const pX1 = parseFloat(wall.projX_let_num1);
          const fX1 = parseFloat(wall.factX_let_num1);
          const pY1 = parseFloat(wall.projY_let_num1);
          const fY1 = parseFloat(wall.factY_let_num1);
          const pX2 = parseFloat(wall.projX_let_num2);
          const fX2 = parseFloat(wall.factX_let_num2);
          const pY2 = parseFloat(wall.projY_let_num2);
          const fY2 = parseFloat(wall.factY_let_num2);
          if (isNaN(pX1) || isNaN(fX1) || isNaN(pY1) || isNaN(fY1) || isNaN(pX2) || isNaN(fX2) || isNaN(pY2) || isNaN(fY2)) {
            return `С${i+1}: не заполнено`;
          }
          const dX1 = Math.abs(fX1 - pX1);
          const dY1 = Math.abs(fY1 - pY1);
          const dX2 = Math.abs(fX2 - pX2);
          const dY2 = Math.abs(fY2 - pY2);
          return `С${i+1}: ΔX1=${dX1.toFixed(1)}, ΔY1=${dY1.toFixed(1)}, ΔX2=${dX2.toFixed(1)}, ΔY2=${dY2.toFixed(1)}`;
        }
      }).join("; ");

      return;
    }

    // Специальная обработка для балок (аналогично стенам)
    if (geoFlags.isBeam) {
      if (beams.length === 0) {
        res.className = "result not-ok";
        res.textContent = "Ошибка: необходимо добавить хотя бы одну балку.";
        state.geo = false;
        checked.geo = false;
        shouldAutoSave = false;
        return;
      }

      let allOk = true;
      let msg = `<div><b>Проверка балок (${beams.length} шт.)</b></div>`;
      const floor = floorValue; // Используем уже проверенное значение этажа
      const beamToleranceXY = getInspectionToleranceValue(
        getCurrentConstructionKey(),
        "geo",
        "geoPlan",
        TOLERANCES.PLAN_XY,
        getCurrentConstructionSubtype()
      );

      beams.forEach((beam, index) => {
        let beamOk = true;
        let beamMsg = `<div style="margin-top: 6px;"><b>Балка ${index + 1}:</b>`;
        const safeBeamNumberAxis = safeValue(beam.numberAxis || "?");
        const safeBeamLetterAxis1 = safeValue(beam.letterAxis1 || "?");
        const safeBeamLetterAxis2 = safeValue(beam.letterAxis2 || "?");
        const safeBeamLetterAxis = safeValue(beam.letterAxis || "?");
        const safeBeamNumberAxis1 = safeValue(beam.numberAxis1 || "?");
        const safeBeamNumberAxis2 = safeValue(beam.numberAxis2 || "?");

        if (beam.bindingType === "number_letters") {
          const pX1 = parseFloat(beam.projX_num_let1);
          const fX1 = parseFloat(beam.factX_num_let1);
          const pY1 = parseFloat(beam.projY_num_let1);
          const fY1 = parseFloat(beam.factY_num_let1);
          const pX2 = parseFloat(beam.projX_num_let2);
          const fX2 = parseFloat(beam.factX_num_let2);
          const pY2 = parseFloat(beam.projY_num_let2);
          const fY2 = parseFloat(beam.factY_num_let2);

          const hasProj1 = !isNaN(pX1) && !isNaN(pY1);
          const hasFact1 = !isNaN(fX1) && !isNaN(fY1);
          const hasProj2 = !isNaN(pX2) && !isNaN(pY2);
          const hasFact2 = !isNaN(fX2) && !isNaN(fY2);

          if (!hasProj1 || !hasFact1 || !hasProj2 || !hasFact2) {
            beamMsg += `<div style="color: #fbbf24;">Не заполнены все координаты для ${safeBeamNumberAxis}, ${safeBeamLetterAxis1}-${safeBeamLetterAxis2}</div>`;
            beamOk = false;
          } else {
            const dX1 = Math.abs(fX1 - pX1);
            const dY1 = Math.abs(fY1 - pY1);
            const dX2 = Math.abs(fX2 - pX2);
            const dY2 = Math.abs(fY2 - pY2);
            const ok1 = dX1 <= beamToleranceXY && dY1 <= beamToleranceXY;
            const ok2 = dX2 <= beamToleranceXY && dY2 <= beamToleranceXY;
            beamOk = ok1 && ok2;

            const style1 = ok1 ? "" : "color: #ef4444; font-weight: bold;";
            const style2 = ok2 ? "" : "color: #ef4444; font-weight: bold;";
            beamMsg += `<div style="margin-left: 12px; ${style1}">${safeBeamNumberAxis}, ${safeBeamLetterAxis1}: X: ${dX1.toFixed(1)} мм, Y: ${dY1.toFixed(1)} мм — ${ok1 ? "в норме" : "превышено"}</div>`;
            beamMsg += `<div style="margin-left: 12px; ${style2}">${safeBeamNumberAxis}, ${safeBeamLetterAxis2}: X: ${dX2.toFixed(1)} мм, Y: ${dY2.toFixed(1)} мм — ${ok2 ? "в норме" : "превышено"}</div>`;
          }
        } else {
          const pX1 = parseFloat(beam.projX_let_num1);
          const fX1 = parseFloat(beam.factX_let_num1);
          const pY1 = parseFloat(beam.projY_let_num1);
          const fY1 = parseFloat(beam.factY_let_num1);
          const pX2 = parseFloat(beam.projX_let_num2);
          const fX2 = parseFloat(beam.factX_let_num2);
          const pY2 = parseFloat(beam.projY_let_num2);
          const fY2 = parseFloat(beam.factY_let_num2);

          const hasProj1 = !isNaN(pX1) && !isNaN(pY1);
          const hasFact1 = !isNaN(fX1) && !isNaN(fY1);
          const hasProj2 = !isNaN(pX2) && !isNaN(pY2);
          const hasFact2 = !isNaN(fX2) && !isNaN(fY2);

          if (!hasProj1 || !hasFact1 || !hasProj2 || !hasFact2) {
            beamMsg += `<div style="color: #fbbf24;">Не заполнены все координаты для ${safeBeamLetterAxis}, ${safeBeamNumberAxis1}-${safeBeamNumberAxis2}</div>`;
            beamOk = false;
          } else {
            const dX1 = Math.abs(fX1 - pX1);
            const dY1 = Math.abs(fY1 - pY1);
            const dX2 = Math.abs(fX2 - pX2);
            const dY2 = Math.abs(fY2 - pY2);
            const ok1 = dX1 <= beamToleranceXY && dY1 <= beamToleranceXY;
            const ok2 = dX2 <= beamToleranceXY && dY2 <= beamToleranceXY;
            beamOk = ok1 && ok2;

            const style1 = ok1 ? "" : "color: #ef4444; font-weight: bold;";
            const style2 = ok2 ? "" : "color: #ef4444; font-weight: bold;";
            beamMsg += `<div style="margin-left: 12px; ${style1}">${safeBeamLetterAxis}, ${safeBeamNumberAxis1}: X: ${dX1.toFixed(1)} мм, Y: ${dY1.toFixed(1)} мм — ${ok1 ? "в норме" : "превышено"}</div>`;
            beamMsg += `<div style="margin-left: 12px; ${style2}">${safeBeamLetterAxis}, ${safeBeamNumberAxis2}: X: ${dX2.toFixed(1)} мм, Y: ${dY2.toFixed(1)} мм — ${ok2 ? "в норме" : "превышено"}</div>`;
          }
        }

        beamMsg += `</div>`;
        msg += beamMsg;
        if (!beamOk) allOk = false;
      });

      msg += `<div style="margin-top:8px;"><b>Заключение:</b> ${
        allOk
          ? "Все балки соответствуют допускам."
          : "Есть превышения допусков по СП."
      }</div>`;
      msg += renderRegulatoryBasisHtml({
        moduleKey: "geo",
        checkKind: getCurrentConstructionKey() || construction.value || "beam",
        subtype: getCurrentConstructionSubtype(),
        helpTargetId: "geoHelpContent"
      });

      res.className = "result " + (allOk ? "ok" : "not-ok");
      res.innerHTML = msg;
      state.geo = allOk;
      checked.geo = true;

      // НЕ обновляем статус узла при проверке - это side effect!
      // Статус должен вычисляться только при сохранении/обновлении узла

      // Сохранение в журнал
      const details = beams.map((beam, i) => {
        if (beam.bindingType === "number_letters") {
          const pX1 = parseFloat(beam.projX_num_let1);
          const fX1 = parseFloat(beam.factX_num_let1);
          const pY1 = parseFloat(beam.projY_num_let1);
          const fY1 = parseFloat(beam.factY_num_let1);
          const pX2 = parseFloat(beam.projX_num_let2);
          const fX2 = parseFloat(beam.factX_num_let2);
          const pY2 = parseFloat(beam.projY_num_let2);
          const fY2 = parseFloat(beam.factY_num_let2);
          if (isNaN(pX1) || isNaN(fX1) || isNaN(pY1) || isNaN(fY1) || isNaN(pX2) || isNaN(fX2) || isNaN(pY2) || isNaN(fY2)) {
            return `Б${i+1}: не заполнено`;
          }
          const dX1 = Math.abs(fX1 - pX1);
          const dY1 = Math.abs(fY1 - pY1);
          const dX2 = Math.abs(fX2 - pX2);
          const dY2 = Math.abs(fY2 - pY2);
          return `Б${i+1}: ΔX1=${dX1.toFixed(1)}, ΔY1=${dY1.toFixed(1)}, ΔX2=${dX2.toFixed(1)}, ΔY2=${dY2.toFixed(1)}`;
        } else {
          const pX1 = parseFloat(beam.projX_let_num1);
          const fX1 = parseFloat(beam.factX_let_num1);
          const pY1 = parseFloat(beam.projY_let_num1);
          const fY1 = parseFloat(beam.factY_let_num1);
          const pX2 = parseFloat(beam.projX_let_num2);
          const fX2 = parseFloat(beam.factX_let_num2);
          const pY2 = parseFloat(beam.projY_let_num2);
          const fY2 = parseFloat(beam.factY_let_num2);
          if (isNaN(pX1) || isNaN(fX1) || isNaN(pY1) || isNaN(fY1) || isNaN(pX2) || isNaN(fX2) || isNaN(pY2) || isNaN(fY2)) {
            return `Б${i+1}: не заполнено`;
          }
          const dX1 = Math.abs(fX1 - pX1);
          const dY1 = Math.abs(fY1 - pY1);
          const dX2 = Math.abs(fX2 - pX2);
          const dY2 = Math.abs(fY2 - pY2);
          return `Б${i+1}: ΔX1=${dX1.toFixed(1)}, ΔY1=${dY1.toFixed(1)}, ΔX2=${dX2.toFixed(1)}, ΔY2=${dY2.toFixed(1)}`;
        }
      }).join("; ");

      return;
    }

    // Обычная проверка для остальных конструкций
    const pX = parseFloat(projX.value);
    const fX = parseFloat(factX.value);
    const pY = parseFloat(projY.value);
    const fY = parseFloat(factY.value);
    const pH = parseFloat(projH.value);
    const fH = parseFloat(factH.value);

    // Проверка выполняется только если заполнены все необходимые поля
    const hasProjXY = !isNaN(pX) && !isNaN(pY);
    const hasFactXY = !isNaN(fX) && !isNaN(fY);

    if (!hasProjXY || !hasFactXY) {
      res.className = "result";
      if (!hasProjXY && !hasFactXY) {
        res.textContent = "Недостаточно данных для проверки. Заполните проектные и фактические значения координат X и Y.";
      } else if (!hasProjXY) {
        res.textContent = "Недостаточно данных для проверки. Заполните проектные значения координат X и Y.";
      } else {
        res.textContent = "Недостаточно данных для проверки. Заполните фактические значения координат X и Y.";
      }
      state.geo = false;
      checked.geo = false;
      return;
    }

    const checks = [];

    // X и Y обязательны
    const dX = Math.abs(fX - pX);
    const okX = dX <= TOL_PLAN;
    checks.push({ axis: "X", dev: dX, ok: okX, tol: TOL_PLAN });

    const dY = Math.abs(fY - pY);
    const okY = dY <= TOL_PLAN;
    checks.push({ axis: "Y", dev: dY, ok: okY, tol: TOL_PLAN });

    // H необязательна - проверяем только если заполнена
    if (!isNaN(pH) && !isNaN(fH)) {
      const dH = Math.abs(fH - pH);
      const okH = dH <= TOL_H;
      checks.push({ axis: "H", dev: dH, ok: okH, tol: TOL_H });
    }

    const flatnessData = geoBehavior.showGeoFlatnessCheck ? collectGeoPlateFlatnessData() : null;
    const flatnessComplete = Boolean(flatnessData && flatnessData.actual != null && flatnessData.tolerance != null);
    const flatnessOk = !flatnessData || (flatnessComplete && flatnessData.result === "ok");
    const allOk = checks.every(c => c.ok) && flatnessOk;
    checked.geo = true;

    const floor = floorValue; // Используем уже проверенное значение этажа
    const floorDisplay = floor ? `Этаж ${safeValue(floor)}, ` : "";
    const axisState = getGeoAxisState(getCurrentConstructionKey() || construction.value || "floor_slab");
    const safeNodeLabel = safeValue(axisState.nodeLabel || "без осей");
    let msg = `<div><b>Узел:</b> ${floorDisplay}${safeNodeLabel}</div>`;
    checks.forEach(c => {
      const axisName = c.axis === "X" ? "Координата X" : c.axis === "Y" ? "Координата Y" : "Высота H";
      const actual = c.axis === "X" ? fX : c.axis === "Y" ? fY : fH;
      const project = c.axis === "X" ? pX : c.axis === "Y" ? pY : pH;
      msg += `<div>${formatCheckResult({
        parameterName: axisName,
        actual: actual,
        project: project,
        tolerance: c.tol,
        unit: "мм",
        regulatoryDoc: "SP_70_13330_2012",
        isStrict: false
      })}</div>`;
    });
    if (flatnessData) {
      if (flatnessComplete) {
        const flatnessClassLabel = flatnessData.surfaceClass === "project" ? "по проекту" : flatnessData.surfaceClass;
        const flatnessResultText = flatnessData.result === "ok" ? "в норме" : "превышено";
        const flatnessStyle = flatnessData.result === "ok" ? "" : "color: #ef4444; font-weight: bold;";
        msg += `<div style="${flatnessStyle}">Плоскостность: фактическое отклонение ${flatnessData.actual.toFixed(1)} мм, предельное ${flatnessData.tolerance.toFixed(1)} мм, база ${safeValue(flatnessData.base)} м, ${safeValue(flatnessClassLabel)} — ${flatnessResultText}</div>`;
      } else {
        msg += `<div style="color: #fbbf24;">Плоскостность: заполните фактическое отклонение и предельное отклонение для проверки.</div>`;
      }
    }
    msg += `<div style="margin-top:6px;"><b>Заключение:</b> ${
      allOk
        ? "Привязка соответствует допускам."
        : "Есть превышения допусков по СП."
    }</div>`;
    msg += renderRegulatoryBasisHtml({
      moduleKey: "geo",
      checkKind: getCurrentConstructionKey() || construction.value || "default",
      subtype: getCurrentConstructionSubtype(),
      helpTargetId: "geoHelpContent"
    });

    res.className = "result " + (allOk ? "ok" : "not-ok");
    res.innerHTML = msg;
    state.geo = allOk;
    checked.geo = true;

    // ВАЖНО: Кнопка "Проверить" НЕ должна изменять состояние узла
    // Она только показывает расчёт в нижнем блоке без side effects

  });

  btnSaveNode?.addEventListener("click", async () => {
    if (!validateProject(getCurrentProjectId())) return;
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
    const key = buildGeoNodeKey({
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
    const finalEvaluationStatus = plateFlatnessBlocksOkStatus
      ? "not-ok"
      : evaluation.status;

    // Определяем dataStatus на основе заполненности
    const dataStatus = evaluation.hasAllData && (!plateFlatnessData || plateFlatnessComplete) ? "checked" :
                       (evaluation.hasProjXY ? "project_only" :
                       (evaluation.hasFactXY ? "fact_only" : "empty"));
    const data: GeodesyNodeRecord = {
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
      if (!isNaN(pX) && !isNaN(fX)) detailsParts.push(`ΔX=${Math.abs(fX - pX).toFixed(1)} мм`);
      if (!isNaN(pY) && !isNaN(fY)) detailsParts.push(`ΔY=${Math.abs(fY - pY).toFixed(1)} мм`);
      if (!isNaN(pH) && !isNaN(fH)) detailsParts.push(`ΔH=${Math.abs(fH - pH).toFixed(1)} мм`);
      if (plateFlatnessData && plateFlatnessComplete) {
        detailsParts.push(`Плоскостность=${plateFlatnessData.actual.toFixed(1)} мм при допуске ${plateFlatnessData.tolerance.toFixed(1)} мм`);
      }

      await upsertJournalEntry({
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
    const key = buildGeoNodeKey({
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
