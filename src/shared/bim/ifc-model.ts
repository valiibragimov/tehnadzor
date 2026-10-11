import * as WebIFC from "web-ifc";

export const IFC_ELEMENT_TYPES = Object.freeze({
  IFCSLAB: "slab", IFCPLATE: "slab", IFCFOOTING: "slab", IFCCOLUMN: "column",
  IFCWALL: "wall", IFCWALLSTANDARDCASE: "wall", IFCCURTAINWALL: "wall",
  IFCBEAM: "beam", IFCMEMBER: "beam", IFCSTAIR: "stair", IFCSTAIRFLIGHT: "stair",
  IFCROOF: "roof", IFCCOVERING: "roof", IFCWINDOW: "window", IFCDOOR: "door",
  IFCOPENINGELEMENT: "opening", IFCRAILING: "railing", IFCBUILDINGELEMENTPROXY: "other"
} as const);

import type { IfcModelOptions, IfcElementData, IfcModelData } from "./types";

export class InvalidIfcModelError extends Error {
  constructor(message: string) { super(message); this.name = "InvalidIfcModelError"; }
}

type Vector = [number, number, number];
interface Transform { origin: Vector; x: Vector; y: Vector; z: Vector }
const identity = (): Transform => ({ origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
const value = (field: any): any => field?.value ?? field ?? null;
const text = (field: any): string | null => {
  const result = value(field);
  return typeof result === "string" && result.trim() ? result.trim() : null;
};
const key = (field: any) => (text(field) || "").toLowerCase().replace(/[\s_.:/\\-]+/g, "");
const cross = (a: Vector, b: Vector): Vector => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = (v: Vector): Vector => { const length = Math.hypot(...v); if (!length) throw new InvalidIfcModelError("Invalid IFC placement direction"); return v.map(n => n / length) as Vector; };
const rotate = (t: Transform, v: Vector): Vector => [0, 1, 2].map(i => t.x[i]*v[0]+t.y[i]*v[1]+t.z[i]*v[2]) as Vector;
const round = (n: number) => Math.round(n * 1000) / 1000;

/** One WebIFC adapter for browser workers and Node workers. No STEP grammar is implemented here. */
export async function readIfcModel(bytes: Uint8Array, options: IfcModelOptions = {}): Promise<IfcModelData> {
  const maxElements = options.maxElements ?? 100_000;
  if (!Number.isSafeInteger(maxElements) || maxElements < 1 || maxElements > 100_000) throw new InvalidIfcModelError("Invalid IFC element limit");
  const api = new WebIFC.IfcAPI();
  if (options.wasmPath) api.SetWasmPath(options.wasmPath, true);
  let model: number | undefined;
  try {
    await api.Init(undefined, true);
    model = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false });
    if (model < 0 || !api.GetModelSchema(model)) throw new InvalidIfcModelError("Unsupported or invalid IFC model");
    const read = (ref: any): any => ref?.type === 5 ? api.GetLine(model!, ref.value) : ref;
    function* lines(type: number): Generator<any> {
      const ids = api.GetLineIDsWithType(model!, type);
      for (let i = 0; i < ids.size(); i++) yield api.GetLine(model!, ids.get(i));
    }
    // Project units, including conversion-based units (e.g. feet). Never assume millimetres.
    const prefixes: Record<string, number> = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 10, DECI: .1, CENTI: .01, MILLI: .001, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18 };
    const scaleUnit = (ref: any, visited = new Set<number>()): number => {
      const entry = read(ref);
      if (!entry || visited.has(entry.expressID)) throw new InvalidIfcModelError("Invalid IFC length unit");
      visited.add(entry.expressID);
      if (entry.type === WebIFC.IFCSIUNIT && value(entry.Name) === "METRE") {
        const prefix = value(entry.Prefix);
        if (prefix != null && !(prefix in prefixes)) throw new InvalidIfcModelError("Unsupported IFC unit prefix");
        return 1000 * (prefix == null ? 1 : prefixes[prefix]);
      }
      if (entry.type === WebIFC.IFCCONVERSIONBASEDUNIT) {
        const factor = read(entry.ConversionFactor);
        return Number(value(factor.ValueComponent)) * scaleUnit(factor.UnitComponent, visited);
      }
      throw new InvalidIfcModelError("Unsupported IFC length unit");
    };
    const project = (() => { for (const entry of lines(WebIFC.IFCPROJECT)) return entry; })();
    const assignment = read(project?.UnitsInContext);
    const lengthUnit = assignment?.Units?.find((ref: any) => value(read(ref)?.UnitType) === "LENGTHUNIT");
    if (!lengthUnit) throw new InvalidIfcModelError("IFC project length unit is missing");
    const mm = scaleUnit(lengthUnit);
    if (!Number.isFinite(mm) || mm <= 0) throw new InvalidIfcModelError("Invalid IFC length unit scale");
    const number = (field: any, scale = mm): number | null => {
      const raw = value(field);
      return typeof raw === "number" && Number.isFinite(raw) ? round(raw * scale) : null;
    };
    const vector = (ref: any, field: string, fallback: Vector): Vector => {
      const values = read(ref)?.[field]?.map((item: any) => Number(value(item)));
      if (!values) return fallback;
      if (values.length !== 2 && values.length !== 3) throw new InvalidIfcModelError("Invalid IFC coordinate tuple. Re-export the model using decimal points and valid IFC units.");
      const result: Vector = [values[0], values[1], values[2] ?? 0];
      if (!result.every(Number.isFinite)) throw new InvalidIfcModelError("Invalid IFC coordinate");
      return result;
    };
    const axisTransform = (parent: Transform, axis: any): Transform => {
      if (!axis) return parent;
      const z = unit(vector(axis.Axis, "DirectionRatios", [0, 0, 1]));
      const reference = unit(vector(axis.RefDirection, "DirectionRatios", [1, 0, 0]));
      const y = unit(cross(z, reference));
      const x = unit(cross(y, z));
      const offset = rotate(parent, vector(axis.Location, "Coordinates", [0, 0, 0]));
      return { origin: parent.origin.map((n, i) => n + offset[i]) as Vector, x: rotate(parent, x), y: rotate(parent, y), z: rotate(parent, z) };
    };
    const placements = new Map<number, Transform | null>();
    const placement = (ref: any, active = new Set<number>()): Transform | null => {
      if (!ref) return identity();
      const entry = read(ref);
      if (!entry) throw new InvalidIfcModelError("Missing IFC placement reference");
      if (placements.has(entry.expressID)) return placements.get(entry.expressID)!;
      if (active.size > 128 || active.has(entry.expressID)) throw new InvalidIfcModelError("Cyclic or excessive IFC placement depth");
      if (entry.type !== WebIFC.IFCLOCALPLACEMENT) return null;
      active.add(entry.expressID);
      const parent = placement(entry.PlacementRelTo, active);
      if (!parent) { placements.set(entry.expressID, null); active.delete(entry.expressID); return null; }
      const axis = read(entry.RelativePlacement);
      if (!axis) throw new InvalidIfcModelError("Missing IFC relative placement");
      const result = axisTransform(parent, axis);
      placements.set(entry.expressID, result);
      active.delete(entry.expressID);
      return result;
    };
    // Index relationships once, avoiding an O(elements × relationships) scan per property lookup.
    const propertySets = new Map<number, any[]>();
    const attach = (id: number, sets: any[]) => propertySets.set(id, [...(propertySets.get(id) || []), ...sets]);
    for (const rel of lines(WebIFC.IFCRELDEFINESBYTYPE)) {
      const type = read(rel.RelatingType);
      for (const object of rel.RelatedObjects || []) attach(object.value, type?.HasPropertySets || []);
    }
    for (const rel of lines(WebIFC.IFCRELDEFINESBYPROPERTIES)) {
      for (const object of rel.RelatedObjects || []) attach(object.value, [rel.RelatingPropertyDefinition]);
    }
    const floors = new Map<number, string | null>();
    for (const rel of lines(WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
      const storey = read(rel.RelatingStructure);
      if (storey?.type !== WebIFC.IFCBUILDINGSTOREY) continue;
      for (const object of rel.RelatedElements || []) floors.set(object.value, text(storey.Name) || text(storey.LongName));
    }
    const fileName = options.fileName?.trim() || "model.ifc";
    let hash = 2166136261;
    for (let index = 0; index < fileName.length; index += 1) { hash ^= fileName.charCodeAt(index); hash = Math.imul(hash, 16777619); }
    const sourceModelId = options.sourceModelId?.trim().toLowerCase().replace(/\.ifc$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || `ifc-model-${(hash >>> 0).toString(36).slice(0, 6)}`;
    const elements: IfcElementData[] = [];
    const countsByType: Record<string, number> = {};
    for (const [ifcType, type] of Object.entries(IFC_ELEMENT_TYPES)) {
      for (const entity of lines(WebIFC[ifcType as keyof typeof IFC_ELEMENT_TYPES])) {
        if (elements.length >= maxElements) throw new InvalidIfcModelError(`IFC model exceeds the supported limit of ${maxElements} elements`);
        const properties: Record<string, any> = {};
        const propertyUnits: Record<string, any> = {};
        for (const ref of propertySets.get(entity.expressID) || []) {
          const set = read(ref);
          for (const propertyRef of set?.HasProperties || set?.Quantities || []) {
            const property = read(propertyRef);
            const name = key(property.Name);
            properties[name] = property.NominalValue ?? property.LengthValue;
            if (property.Unit) propertyUnits[name] = property.Unit;
          }
        }
        const pickText = (...keys: string[]) => keys.map(k => text(properties[k])).find(Boolean) || null;
        const dimension = (...keys: string[]) => keys.map(k => number(properties[k], propertyUnits[k] ? scaleUnit(propertyUnits[k]) : mm)).find(n => n != null && n > 0) ?? null;
        let transform: Transform | null = null;
        if (entity.ObjectPlacement) transform = placement(entity.ObjectPlacement);
        // Dimensions come from declared IFC quantities/properties or exact primitive profiles.
        // Tessellated world-axis bounds are NOT treated as design dimensions.
        const dimensions: Record<string, number | null> = {
          thickness: dimension("thickness", "aecwallthickness", "aecpartthickness", "dimthickness", "roofthickness"),
          length: dimension("length", "aecpartlength", "dimlength"),
          width: number(entity.OverallWidth) ?? dimension("width", "dimwidth", "aecpartwidth", "concreteprofwidth"),
          height: number(entity.OverallHeight) ?? dimension("height", "dimheight", "aecpartheight", "aecwallheight", "concreteprofheight"),
          sectionWidth: dimension("sectionwidth", "concreteprofwidth", "dimwidth"),
          sectionHeight: dimension("sectionheight", "concreteprofheight", "dimheight")
        };
        const representation = read(entity.Representation);
        const representations = (representation?.Representations || []).map(read);
        // Exporters commonly include Axis/Box/FootPrint alongside Body. These are not extra solids.
        const bodies = representations.filter((entry: any) => text(entry?.RepresentationIdentifier)?.toLowerCase() === "body");
        const items = (bodies.length ? bodies : representations.filter((entry: any) => !text(entry?.RepresentationIdentifier)))
          .flatMap((entry: any) => entry?.Items || []);
        let lineTransform: Transform | null = null;
        let direction: Vector | null = null;
        let lineLength: number | null = null;
        if (items.length === 1) {
          const solid = read(items[0]);
          if (solid?.type === WebIFC.IFCEXTRUDEDAREASOLID) {
            const profile = read(solid.SweptArea);
            // Only an explicit swept solid defines an authoritative extrusion axis.
            // Product placement alone does not describe a beam/wall centreline.
            if (transform && type === "beam" && profile?.type === WebIFC.IFCRECTANGLEPROFILEDEF) {
              const solidTransform = axisTransform(transform, read(solid.Position));
              const profileOffset = rotate(solidTransform, vector(read(profile.Position)?.Location, "Coordinates", [0, 0, 0]));
              lineTransform = { ...solidTransform, origin: solidTransform.origin.map((n, i) => n + profileOffset[i]) as Vector };
              direction = unit(rotate(solidTransform, vector(solid.ExtrudedDirection, "DirectionRatios", [0, 0, 1])));
              lineLength = number(solid.Depth);
            }
            if (profile?.type === WebIFC.IFCRECTANGLEPROFILEDEF && number(profile.XDim) != null && number(profile.YDim) != null && number(solid.Depth) != null) {
              const a = number(profile.XDim), b = number(profile.YDim), depth = number(solid.Depth);
              if (type === "column") { dimensions.sectionWidth ??= Math.min(a!, b!); dimensions.sectionHeight ??= Math.max(a!, b!); dimensions.height ??= depth; }
              if (type === "slab" || type === "roof") { dimensions.length ??= Math.max(a!, b!); dimensions.width ??= Math.min(a!, b!); dimensions.thickness ??= depth; }
              if (type === "beam") { dimensions.length ??= depth; dimensions.width ??= Math.min(a!, b!); dimensions.height ??= Math.max(a!, b!); }
              if (type === "wall") { dimensions.length ??= a; dimensions.thickness ??= b; dimensions.height ??= depth; }
            }
          }
        }
        const start = lineTransform?.origin.map(n => round(n * mm));
        const end = start && direction && lineLength && lineLength > 0 ? start.map((n, i) => round(n + direction![i] * lineLength!)) : null;
        const rawMark = pickText("bommark", "bomnumber", "parttag", "mark", "марка", "tag", "positionnumber") || text(entity.Tag);
        const name = text(entity.Name);
        const mark = rawMark || (name && /^[A-ZА-Я]{1,8}[-._/]?\d[A-ZА-Я0-9._/-]{0,35}$/iu.test(name) ? name : null);
        const floor = floors.get(entity.expressID) || pickText("level", "этаж", "storey", "buildingstorey", "baselevel");
        elements.push({ elementId: `${sourceModelId}_${entity.expressID}`, expressId: entity.expressID, sourceModelId, type,
          ifcGuid: text(entity.GlobalId), name: text(entity.Name), description: text(entity.Description), objectType: text(entity.ObjectType),
          mark,
          axes: pickText("axes", "axis", "оси", "buildingsstructlinkedcoordgrid", "gridhandler", "gridaxis"),
          floor: floor?.replace(/^(этаж|эт\.?|level|storey|story)\s*[:#-]?\s*/iu, "") || null,
          hasPlacement: Boolean(transform), projectX: transform ? number(transform.origin[0]) : null,
          projectY: transform ? number(transform.origin[1]) : null, projectH: transform ? number(transform.origin[2]) : null,
          ...dimensions, directionX: direction?.[0] ?? null, directionY: direction?.[1] ?? null, lineStartX: end ? start![0] : null, lineStartY: end ? start![1] : null, lineStartH: end ? start![2] : null, lineEndX: end?.[0] ?? null, lineEndY: end?.[1] ?? null, lineEndH: end?.[2] ?? null
        });
        countsByType[type] = (countsByType[type] || 0) + 1;
      }
    }
    return { sourceModelId, fileName, importedCount: elements.length, countsByType, elements, schema: api.GetModelSchema(model) };
  } finally {
    if (model !== undefined && model >= 0) api.CloseModel(model);
    api.Dispose();
  }
}
