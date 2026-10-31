import { compareMeasurement, comparePhysicalMeasurement, measurementNumber, summarizeMeasurements } from "../acceptance.js";
import { getConstructionProfile, getConstructionModuleBehavior, normalizeConstructionKey } from "../../../app/construction.js";
import { getInspectionStatus } from "../../../app/inspection-registry.js";
import type { GeometryCheckRecord } from "../../../types/module-records.js";
import { commonDimensionKeys, elementDimensionKeys, type PhysicalDimensions } from "./dimensions.js";

export function evaluateGeometryCheck(check: GeometryCheckRecord) {
  const construction = normalizeConstructionKey(check.construction || check.constructionType, "");
  const applicable = getInspectionStatus(construction, "geometry", check.constructionSubtype || "", check.constructionPileElement || "");
  if (applicable !== "object") return summarizeMeasurements([]);
  const criteria = check.acceptanceCriteria;
  const results: Array<ReturnType<typeof compareMeasurement>> = [];
  const pair = (row: Record<string, unknown>, project: string, actual: string, key: string, optional = false) => {
    if (optional && row[project] == null && row[actual] == null) return;
    const p = measurementNumber(row[project]);
    const a = measurementNumber(row[actual]);
    results.push(comparePhysicalMeasurement(p, a, key, criteria));
  };
  const dimensions = (row: Record<string, unknown>, keys: string[]) => {
    const values = row.physicalDimensions as PhysicalDimensions | undefined;
    for (const key of keys) {
      const value = values?.[key];
      if (construction === "excavation" && (!value || (measurementNumber(value.project) === null && measurementNumber(value.actual) === null))) continue;
      pair(value || {}, "project", "actual", "dimensions");
    }
  };
  dimensions(check, commonDimensionKeys(construction, String(check.constructionPileElement || "")));
  if (construction === "excavation") return summarizeMeasurements(results);
  const profile = getConstructionProfile(construction, "geometry");
  const rows = profile === "column" ? check.columns : profile === "wall" ? check.walls : profile === "beam" ? check.beams : profile === "stair" ? check.stairs : null;
  const kind = profile === "column" ? "columns" : profile === "wall" ? "walls" : profile === "beam" ? "beams" : "stairs";
  if (["column", "wall", "beam", "stair"].includes(profile)) {
    if (!rows?.length) results.push("incomplete");
    for (const row of rows || []) {
      dimensions(row, elementDimensionKeys(kind));
      if (profile === "column") {
        pair(row, "projSize1", "factSize1", "section");
        pair(row, "projSize2", "factSize2", "section");
      } else if (profile === "wall") pair(row, "projThick", "factThick", "thickness");
      else if (profile === "beam") {
        pair(row, "projBeamWidth", "factBeamWidth", "section");
        pair(row, "projBeamHeight", "factBeamHeight", "section");
      } else {
        pair(row, "projFlightWidth", "factFlightWidth", "dimensions");
        if (!String(row.position || "").trim()) results.push("incomplete");
        if (row.elementType !== "landing") {
          pair(row, "projStepHeight", "factStepHeight", "step");
          pair(row, "projStepWidth", "factStepWidth", "step");
        }
      }
      if (profile === "wall" || profile === "column") results.push(compareMeasurement(0, row.vertDev, "vertical", criteria));
      if (profile === "wall") {
        results.push(compareMeasurement(0, row.factWallFlatness, "flatness", criteria));
        // Opening position elevations are historical fields, not geometry dimensions.
        openings(row);
      }
    }
  } else if (profile === "formwork") {
    pair(check, "formworkProjHeight", "formworkFactHeight", "dimensions");
    pair(check, "formworkProjWidth", "formworkFactWidth", "dimensions");
    pair(check, "formworkProjThickness", "formworkFactThickness", "thickness");
    results.push(compareMeasurement(0, check.formworkVerticalDeviation, "vertical", criteria));
  } else {
    pair(check, "projPlateHeight", "factPlateHeight", "thickness");
    if (getConstructionModuleBehavior(construction, "geometry", check.constructionSubtype || "", check.constructionPileElement || "").showPlateFlatness) results.push(compareMeasurement(0, check.factPlateFlatness, "flatness", criteria));
    openings(check);
  }
  function openings(row: Record<string, unknown>) {
    const p = String(row.projOpeningSizes ?? row.openingSizes ?? "").trim();
    const a = String(row.factOpeningSizes ?? "").trim();
    if (!p && !a) return;
    // Keep entered order: differently located openings must not be paired by sorted dimensions.
    const parse = (text: string) => text.split(/[,;\n]+/u).map(value => value.trim().split(/[xх×]/iu).map(measurementNumber));
    const project = parse(p), actual = parse(a);
    if (!p || !a || project.length !== actual.length) { results.push("incomplete"); return; }
    project.forEach((item, index) => {
      const measured = actual[index];
      if (item.length !== 2 || !measured || measured.length !== 2) { results.push("incomplete"); return; }
      for (let i = 0; i < 2; i++) results.push(comparePhysicalMeasurement(item[i], measured[i], "opening", criteria));
    });
  }
  return summarizeMeasurements(results);
}
