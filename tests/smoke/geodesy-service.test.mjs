import assert from "node:assert/strict";
import test from "node:test";

const { createGeodesyService } = await import(
  "../../dist/features/inspections/geodesy/service.js"
);
const { createGeodesyNodeActions } = await import(
  "../../dist/features/inspections/geodesy/node-actions.js"
);
const {
  createGeodesyNodeState,
  createGeodesyState,
  replaceGeodesyItems,
  resetGeodesyFormState
} = await import(
  "../../dist/features/inspections/geodesy/state.js"
);
const {
  buildColumnJournalPayload,
  buildLinearJournalPayload,
  evaluateGeoColumnNode,
  evaluateGeoNode,
  evaluateGeoWallNode
} = await import(
  "../../dist/features/inspections/geodesy/evaluation.js"
);
const {
  collectGeodesyBimNodeData,
  filterGeodesyBimElements,
  normalizeGeodesyBimRecords,
  resolveGeodesyBimSelection,
  restoreGeodesyBimSelection
} = await import(
  "../../dist/features/inspections/geodesy/bim-selection.js"
);
function createRepository(overrides = {}) {
  const calls = [];
  const repository = {
    async loadNodes() {
      return { forEach() {} };
    },
    async loadBimElements() {
      return { forEach() {} };
    },
    async saveNode(...args) {
      calls.push(["saveNode", ...args]);
    },
    async markNodeDeleted(...args) {
      calls.push(["markNodeDeleted", ...args]);
    },
    async clearNodes(...args) {
      calls.push(["clearNodes", ...args]);
      return 0;
    },
    async upsertInspection(...args) {
      calls.push(["upsertInspection", ...args]);
    },
    async deleteInspection(...args) {
      calls.push(["deleteInspection", ...args]);
    },
    async clearInspections(...args) {
      calls.push(["clearInspections", ...args]);
      return 0;
    },
    ...overrides
  };
  return { repository, calls };
}

test("geodesy service loads active nodes and excludes soft-deleted records", async () => {
  const { repository } = createRepository({
    async loadNodes(projectId) {
      assert.equal(projectId, "project-1");
      const documents = [
        { id: "active", data: () => ({ status: "ok" }) },
        { id: "deleted", data: () => ({ deleted: true, status: "bad" }) }
      ];
      return {
        forEach(callback) {
          documents.forEach(callback);
        }
      };
    }
  });

  const service = createGeodesyService(repository);
  const nodes = await service.loadNodes("project-1");

  assert.deepEqual([...nodes.entries()], [["active", { status: "ok" }]]);
});

test("geodesy service persists the source node before its inspection projection", async () => {
  const { repository, calls } = createRepository();
  const service = createGeodesyService(repository);
  const payload = { status: "ok", floor: "2" };

  await service.saveNode("project-1", "node-A-1", payload);

  assert.deepEqual(calls, [
    ["saveNode", "project-1", "node-A-1", payload],
    ["upsertInspection", "project-1", "node-A-1", payload]
  ]);
});

test("geodesy service loads BIM records without leaking snapshots to UI", async () => {
  const { repository } = createRepository({
    async loadBimElements(projectId) {
      assert.equal(projectId, "project-1");
      const documents = [
        { id: "element-1", data: () => ({ type: "IfcSlab" }) },
        { id: "element-2", data: () => ({ type: "IfcWall", deleted: true }) }
      ];
      return {
        forEach(callback) {
          documents.forEach(callback);
        }
      };
    }
  });
  const service = createGeodesyService(repository);

  const elements = await service.loadBimElements("project-1");

  assert.deepEqual(elements, [
    { id: "element-1", data: { type: "IfcSlab" } },
    { id: "element-2", data: { type: "IfcWall", deleted: true } }
  ]);
});

test("geodesy service keeps a saved node when the analytics dual-write fails", async () => {
  const warnings = [];
  const { repository, calls } = createRepository({
    async upsertInspection() {
      throw new Error("offline");
    }
  });
  const service = createGeodesyService(repository, {
    warn(...args) {
      warnings.push(args);
    }
  });

  await service.saveNode("project-1", "node-A-1", { status: "pending" });

  assert.equal(calls[0][0], "saveNode");
  assert.equal(warnings.length, 1);
});

test("geodesy service deletes and clears source and inspection projections", async () => {
  const { repository, calls } = createRepository({
    async clearNodes(...args) {
      calls.push(["clearNodes", ...args]);
      return 3;
    },
    async clearInspections(...args) {
      calls.push(["clearInspections", ...args]);
      return 2;
    }
  });
  const service = createGeodesyService(repository);

  await service.deleteNode("project-1", "node-A-1");
  const result = await service.clearNodes("project-1");

  assert.deepEqual(calls, [
    ["markNodeDeleted", "project-1", "node-A-1"],
    ["deleteInspection", "project-1", "node-A-1"],
    ["clearNodes", "project-1"],
    ["clearInspections", "project-1"]
  ]);
  assert.deepEqual(result, { deletedCount: 3, deletedDualWriteCount: 2 });
});

test("geodesy node actions replace local state with loaded project nodes", async () => {
  const state = createGeodesyNodeState();
  state.nodes.set("stale", { status: "bad" });
  const renderedSnapshots = [];
  const stored = new Map();
  const actions = createGeodesyNodeActions({
    state,
    service: {
      async loadNodes(projectId) {
        assert.equal(projectId, "project-2");
        return new Map([["fresh", { status: "ok" }]]);
      }
    },
    storage: {
      setItem(key, value) {
        stored.set(key, value);
      }
    },
    storageKey: "geo-test",
    renderNodes() {
      renderedSnapshots.push([...state.nodes.keys()]);
    }
  });

  await actions.loadProjectNodes("project-2");

  assert.deepEqual(renderedSnapshots, [[], ["fresh"]]);
  assert.deepEqual(JSON.parse(stored.get("geo-test")), [
    ["fresh", { status: "ok" }]
  ]);
});

test("geodesy node actions clear records and current edit keys together", async () => {
  const state = createGeodesyNodeState();
  state.nodes.set("node-A-1", { status: "ok" });
  state.currentNodeKeys.column = "node-A-1";
  state.currentNodeKeys.wall = "node-wall";
  state.currentNodeKeys.beam = "node-beam";
  const actions = createGeodesyNodeActions({
    state,
    service: {
      async clearNodes(projectId) {
        assert.equal(projectId, "project-1");
        return { deletedCount: 1, deletedDualWriteCount: 1 };
      }
    },
    storage: { setItem() {} },
    storageKey: "geo-test",
    renderNodes() {}
  });

  const result = await actions.clearProjectNodes("project-1");

  assert.equal(state.nodes.size, 0);
  assert.deepEqual(state.currentNodeKeys, {
    column: null,
    wall: null,
    beam: null
  });
  assert.deepEqual(result, { deletedCount: 1, deletedDualWriteCount: 1 });
});

test("geodesy state keeps stable collection references while replacing form data", () => {
  const state = createGeodesyState();
  const wallsReference = state.walls;
  state.walls.push({ id: 1, mark: "old" });

  replaceGeodesyItems(state.walls, [{ id: 2, mark: "new" }]);

  assert.equal(state.walls, wallsReference);
  assert.deepEqual(state.walls, [{ id: 2, mark: "new" }]);
  assert.deepEqual(state.bimFilters, {
    search: "",
    type: "all",
    axes: "all"
  });
});

test("geodesy evaluation distinguishes incomplete, accepted and exceeded coordinates", () => {
  const incomplete = evaluateGeoColumnNode([
    {
      id: 1,
      mark: "К1",
      projX: "100",
      projY: "200",
      factX: "",
      factY: ""
    }
  ], 8);
  const accepted = evaluateGeoNode(
    {
      projX: 100,
      projY: 200,
      projH: 300,
      factX: 105,
      factY: 193,
      factH: 309
    },
    8,
    10
  );
  const exceeded = evaluateGeoNode(
    {
      projX: 100,
      projY: 200,
      projH: null,
      factX: 109,
      factY: 200,
      factH: null
    },
    8,
    10
  );

  assert.deepEqual(incomplete, {
    status: "empty",
    hasAllData: false,
    hasProjXY: true,
    hasFactXY: false
  });
  assert.equal(accepted.status, "ok");
  assert.deepEqual(
    accepted.details.map(({ axis, dev, ok }) => ({ axis, dev, ok })),
    [
      { axis: "X", dev: 5, ok: true },
      { axis: "Y", dev: 7, ok: true },
      { axis: "H", dev: 9, ok: true }
    ]
  );
  assert.equal(exceeded.status, "bad");
});

test("geodesy linear evaluation supports both axis binding modes", () => {
  const base = {
    id: 1,
    numberAxis: "1",
    letterAxis1: "А",
    letterAxis2: "Б",
    letterAxis: "А",
    numberAxis1: "1",
    numberAxis2: "2",
    projX_num_let1: "100",
    factX_num_let1: "104",
    projY_num_let1: "200",
    factY_num_let1: "204",
    projX_num_let2: "300",
    factX_num_let2: "304",
    projY_num_let2: "400",
    factY_num_let2: "404",
    projX_let_num1: "100",
    factX_let_num1: "104",
    projY_let_num1: "200",
    factY_let_num1: "204",
    projX_let_num2: "300",
    factX_let_num2: "304",
    projY_let_num2: "400",
    factY_let_num2: "404"
  };

  assert.equal(
    evaluateGeoWallNode(
      [{ ...base, bindingType: "number_letters" }],
      8
    ).status,
    "ok"
  );
  assert.equal(
    evaluateGeoWallNode(
      [{
        ...base,
        bindingType: "letter_numbers",
        factY_let_num2: "412"
      }],
      8
    ).status,
    "bad"
  );
});

test("geodesy journal payload keeps persisted source context and deviations", () => {
  const columnPayload = buildColumnJournalPayload({
    key: "columns_K1_2",
    construction: "column",
    columnMark: "К1",
    floor: "2",
    status: "bad",
    columns: [
      {
        id: 1,
        mark: "К1",
        projX: "100",
        projY: "200",
        factX: "110",
        factY: "204"
      }
    ]
  });
  const wallPayload = buildLinearJournalPayload({
    key: "walls_2",
    construction: "wall",
    floor: "2",
    status: "ok",
    entityLabel: "Стена",
    entityPlural: "Стены",
    emptyDetails: "Проверка стен",
    rows: [
      {
        id: 1,
        bindingType: "number_letters",
        numberAxis: "1",
        letterAxis1: "А",
        letterAxis2: "Б",
        letterAxis: "",
        numberAxis1: "",
        numberAxis2: "",
        projX_num_let1: "100",
        factX_num_let1: "104",
        projY_num_let1: "200",
        factY_num_let1: "206",
        projX_num_let2: "",
        factX_num_let2: "",
        projY_num_let2: "",
        factY_num_let2: "",
        projX_let_num1: "",
        factX_let_num1: "",
        projY_let_num1: "",
        factY_let_num1: "",
        projX_let_num2: "",
        factX_let_num2: "",
        projY_let_num2: "",
        factY_let_num2: ""
      }
    ]
  });

  assert.deepEqual(columnPayload, {
    module: "Геодезия",
    status: "exceeded",
    context: "К1, 2",
    details: "К1: ΔX=10.0, ΔY=4.0",
    sourceId: "columns_K1_2",
    construction: "column"
  });
  assert.equal(wallPayload.context, "Этаж 2, Стены");
  assert.equal(wallPayload.details, "Стена1: ΔX=4.0, ΔY=6.0");
});

test("clearing a geodesy form resets edit keys and only its active collection", () => {
  const state = createGeodesyState();
  state.currentNodeKeys = {
    column: "column-1",
    wall: "wall-1",
    beam: "beam-1"
  };
  state.columns.push({
    id: 1,
    mark: "К1",
    projX: "",
    factX: "",
    projY: "",
    factY: ""
  });
  state.walls.push({ id: 2 });
  state.beams.push({ id: 3 });
  state.plateOpeningPoints.push({
    id: 4,
    projX: "",
    projY: "",
    factX: "",
    factY: ""
  });

  resetGeodesyFormState(state, "column");

  assert.deepEqual(state.currentNodeKeys, {
    column: null,
    wall: null,
    beam: null
  });
  assert.equal(state.columns.length, 0);
  assert.equal(state.walls.length, 1);
  assert.equal(state.beams.length, 1);
  assert.equal(state.plateOpeningPoints.length, 0);
});

test("geodesy BIM selection resolves an available element", () => {
  const element = {
    id: "wall-1",
    elementId: "wall-1",
    type: "wall",
    mark: "С-1"
  };
  const resolution = resolveGeodesyBimSelection(
    new Map([["wall-1", element]]),
    "wall-1"
  );

  assert.equal(resolution.mode, "selected");
  assert.equal(resolution.selectedId, "wall-1");
  assert.equal(resolution.element, element);
});

test("geodesy BIM filters combine search, type and resolved axes", () => {
  const elements = [
    {
      id: "wall-1",
      elementId: "wall-1",
      type: "wall",
      mark: "С-1",
      axes: "А-1"
    },
    {
      id: "column-1",
      elementId: "column-1",
      type: "column",
      mark: "К-7",
      resolvedAxes: "Б-2"
    },
    {
      id: "column-2",
      elementId: "column-2",
      type: "column",
      mark: "К-8",
      resolvedAxes: "А-1"
    }
  ];

  const filtered = filterGeodesyBimElements(elements, {
    search: "к-7",
    type: "column",
    axes: "Б-2"
  });

  assert.deepEqual(filtered.map((element) => element.elementId), ["column-1"]);
});

test("geodesy BIM selection uses manual mode when no element is selected", () => {
  const resolution = resolveGeodesyBimSelection(new Map(), "");

  assert.deepEqual(resolution, {
    mode: "manual",
    selectedId: "",
    element: null
  });
});

test("geodesy BIM binding is restored from a saved node", () => {
  const element = {
    id: "beam-1",
    elementId: "beam-1",
    sourceModelId: "model-1",
    ifcGuid: "guid-1",
    type: "beam",
    mark: "Б-1",
    axes: "А-Б, 1",
    projectX: 120,
    projectY: 240,
    projectH: 360
  };
  const restored = restoreGeodesyBimSelection(
    new Map([["beam-1", element]]),
    {
      bimElementId: "beam-1",
      bimMark: "Старая марка",
      bimAxes: "Старые оси"
    },
    "beam"
  );

  assert.equal(restored.mode, "selected");
  assert.equal(restored.snapshot.resolved, true);
  assert.equal(restored.snapshot.mark, "Б-1");
  assert.equal(restored.snapshot.axes, "А-Б, 1");
  assert.equal(restored.snapshot.projectH, 360);
});

test("geodesy BIM binding preserves a snapshot for an unavailable element", () => {
  const restored = restoreGeodesyBimSelection(
    new Map(),
    {
      bimElementId: "removed-1",
      bimSourceModelId: "model-old",
      bimIfcGuid: "guid-old",
      bimType: "wall",
      bimMark: "С-9",
      bimAxes: "Г-4",
      bimProjectX: 15
    },
    "wall"
  );

  assert.equal(restored.mode, "unavailable");
  assert.equal(restored.snapshot.resolved, false);
  assert.equal(restored.snapshot.elementId, "removed-1");
  assert.equal(restored.snapshot.mark, "С-9");
  assert.equal(restored.snapshot.projectX, 15);
});

test("geodesy BIM records exclude deleted and malformed elements", () => {
  const elements = normalizeGeodesyBimRecords([
    {
      id: "active-wall",
      data: { type: "wall", mark: "С-1" }
    },
    {
      id: "deleted-column",
      data: { type: "column", mark: "К-1", deleted: true }
    },
    {
      id: "malformed",
      data: { mark: "Без типа" }
    }
  ]);

  assert.deepEqual(elements.map((element) => element.elementId), [
    "active-wall"
  ]);
});

test("geodesy BIM node payload keeps the existing Firestore field format", () => {
  const payload = collectGeodesyBimNodeData({
    selectedId: "column-1",
    selectedElement: {
      id: "column-1",
      elementId: "column-1",
      sourceModelId: "model-1",
      ifcGuid: "guid-1",
      type: "column",
      projectX: 10,
      projectY: 20,
      projectH: 30,
      lineStartX: 1,
      lineStartY: 2,
      lineEndX: 3,
      lineEndY: 4
    },
    mark: " К-1 ",
    axes: " А-1 "
  });

  assert.deepEqual(payload, {
    bimElementId: "column-1",
    bimSourceModelId: "model-1",
    bimIfcGuid: "guid-1",
    bimType: "column",
    bimMark: "К-1",
    bimAxes: "А-1",
    bimProjectX: 10,
    bimProjectY: 20,
    bimProjectH: 30,
    bimLineStartX: 1,
    bimLineStartY: 2,
    bimLineEndX: 3,
    bimLineEndY: 4
  });
});
