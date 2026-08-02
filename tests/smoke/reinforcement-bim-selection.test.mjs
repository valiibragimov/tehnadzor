import assert from "node:assert/strict";
import test from "node:test";

const {
  clearReinforcementBimBinding,
  collectReinforcementBimPayload,
  filterReinforcementBimElements,
  normalizeReinforcementBimRecords,
  resolveReinforcementBimSelection,
  restoreReinforcementBimSelection
} = await import(
  "../../dist/features/inspections/reinforcement/bim-selection.js"
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

test("reinforcement BIM selection resolves an available element", () => {
  const elements = normalizeReinforcementBimRecords(createRecords());
  const elementsById = new Map(
    elements.map((element) => [element.elementId, element])
  );

  const selection = resolveReinforcementBimSelection(
    elementsById,
    "column-1"
  );

  assert.equal(selection.mode, "selected");
  assert.equal(selection.selectedId, "column-1");
  assert.equal(selection.element?.mark, "К1");
});

test("reinforcement BIM filters preserve search, type and axes behavior", () => {
  const elements = normalizeReinforcementBimRecords(createRecords());

  assert.deepEqual(
    filterReinforcementBimElements(elements, {
      search: "к1",
      type: "column",
      axes: "А-1"
    }).map((element) => element.elementId),
    ["column-1"]
  );
});

test("reinforcement BIM selection restores saved binding data", () => {
  const elements = normalizeReinforcementBimRecords(createRecords());
  const elementsById = new Map(
    elements.map((element) => [element.elementId, element])
  );

  const restored = restoreReinforcementBimSelection(
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

test("reinforcement BIM restoration preserves an unavailable binding", () => {
  const restored = restoreReinforcementBimSelection(new Map(), {
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

test("reinforcement BIM payload keeps the Firestore field format", () => {
  const [element] = normalizeReinforcementBimRecords(createRecords());

  assert.deepEqual(
    collectReinforcementBimPayload({
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

test("clearing reinforcement BIM binding can preserve manual fields", () => {
  assert.deepEqual(
    clearReinforcementBimBinding({
      keepManualFields: true,
      mark: "К1",
      axes: "А-1"
    }),
    {
      selectedId: "",
      snapshot: null,
      mark: "К1",
      axes: "А-1"
    }
  );
  assert.deepEqual(
    clearReinforcementBimBinding({
      keepManualFields: false,
      mark: "К1",
      axes: "А-1"
    }),
    {
      selectedId: "",
      snapshot: null,
      mark: "",
      axes: ""
    }
  );
});
