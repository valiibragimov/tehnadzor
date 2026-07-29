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
  replaceGeodesyItems
} = await import(
  "../../dist/features/inspections/geodesy/state.js"
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
