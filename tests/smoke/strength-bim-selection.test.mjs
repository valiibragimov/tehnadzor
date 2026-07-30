import assert from "node:assert/strict";
import test from "node:test";

const {
  clearStrengthBimManualFields,
  collectStrengthBimPayload,
  filterStrengthBimElements,
  normalizeStrengthBimRecords,
  resolveStrengthBimSelection,
  restoreStrengthBimSelection
} = await import(
  "../../dist/features/inspections/strength/bim-selection.js"
);

function createRecords() {
  return [
    {
      id: "column-1",
      elementId: "column-1",
      type: "column",
      mark: "К1",
      floor: "2",
      axes: "А-1",
      sourceModelId: "model-1",
      ifcGuid: "column-guid"
    },
    {
      id: "beam-1",
      elementId: "beam-1",
      type: "beam",
      mark: "Б2",
      floor: "3",
      axes: "Б-2",
      sourceModelId: "model-1",
      ifcGuid: "beam-guid"
    }
  ];
}

test("strength BIM selection resolves an available element", () => {
  const elements = normalizeStrengthBimRecords(createRecords());
  const elementsById = new Map(
    elements.map((element) => [element.elementId, element])
  );

  const selection = resolveStrengthBimSelection(
    elementsById,
    "column-1"
  );

  assert.equal(selection.mode, "selected");
  assert.equal(selection.selectedId, "column-1");
  assert.equal(selection.element?.mark, "К1");
});

test("strength BIM filters combine search, type and axes", () => {
  const elements = normalizeStrengthBimRecords(createRecords());

  const filtered = filterStrengthBimElements(elements, {
    search: "к1",
    type: "column",
    axes: "А-1"
  });

  assert.deepEqual(
    filtered.map((element) => element.elementId),
    ["column-1"]
  );
  assert.equal(
    filterStrengthBimElements(elements, {
      search: "к1",
      type: "beam",
      axes: "А-1"
    }).length,
    0
  );
});

test("strength BIM selection uses manual mode for an empty id", () => {
  const selection = resolveStrengthBimSelection(new Map(), "");

  assert.deepEqual(selection, {
    mode: "manual",
    selectedId: "",
    element: null
  });
});

test("strength BIM selection restores a saved binding", () => {
  const elements = normalizeStrengthBimRecords(createRecords());
  const elementsById = new Map(
    elements.map((element) => [element.elementId, element])
  );

  const restored = restoreStrengthBimSelection(
    elementsById,
    {
      bimElementId: "column-1",
      bimMark: "К1",
      bimAxes: "А-1",
      construction: "column"
    },
    "column"
  );

  assert.equal(restored.mode, "selected");
  assert.equal(restored.snapshot?.resolved, true);
  assert.equal(restored.snapshot?.elementId, "column-1");
  assert.equal(restored.snapshot?.floor, "2");
});

test("strength BIM selection excludes deleted elements and preserves unavailable snapshots", () => {
  const elements = normalizeStrengthBimRecords([
    ...createRecords(),
    {
      id: "deleted-1",
      elementId: "deleted-1",
      type: "slab",
      mark: "П1",
      deleted: true
    }
  ]);
  const elementsById = new Map(
    elements.map((element) => [element.elementId, element])
  );

  assert.equal(elementsById.has("deleted-1"), false);
  const restored = restoreStrengthBimSelection(elementsById, {
    bimElementId: "missing-1",
    bimSourceModelId: "model-old",
    bimIfcGuid: "missing-guid",
    bimType: "beam",
    bimFloor: "4",
    bimMark: "Б9",
    bimAxes: "В-3",
    construction: "beam"
  });
  assert.equal(restored.mode, "unavailable");
  assert.equal(restored.snapshot?.resolved, false);
  assert.equal(restored.snapshot?.elementId, "missing-1");
  assert.equal(restored.snapshot?.sourceModelId, "model-old");
});

test("strength BIM payload keeps the existing Firestore field format", () => {
  const [element] = normalizeStrengthBimRecords(createRecords());

  assert.deepEqual(
    collectStrengthBimPayload({
      selectedId: "column-1",
      selectedElement: element,
      snapshot: null,
      mark: " К1 ",
      axes: " А-1 "
    }),
    {
      bimElementId: "column-1",
      bimSourceModelId: "model-1",
      bimIfcGuid: "column-guid",
      bimType: "column",
      bimFloor: "2",
      bimMark: "К1",
      bimAxes: "А-1"
    }
  );
});

test("clearing strength BIM binding preserves manual fields on request", () => {
  assert.deepEqual(
    clearStrengthBimManualFields({
      keepManualFields: true,
      mark: "К1",
      axes: "А-1"
    }),
    { mark: "К1", axes: "А-1" }
  );
  assert.deepEqual(
    clearStrengthBimManualFields({
      keepManualFields: false,
      mark: "К1",
      axes: "А-1"
    }),
    { mark: "", axes: "" }
  );
});
