import assert from "node:assert/strict";
import test from "node:test";

const { createStrengthActions } = await import(
  "../../dist/features/inspections/strength/handlers.js"
);
const { createStrengthChartController } = await import(
  "../../dist/features/inspections/strength/chart.js"
);
const { buildStrengthJournalPayload } = await import(
  "../../dist/features/inspections/strength/evaluation.js"
);
const { createStrengthState } = await import(
  "../../dist/features/inspections/strength/state.js"
);

function createResultElement() {
  const classes = new Set();
  return {
    className: "",
    innerHTML: "",
    textContent: "",
    style: { display: "" },
    classList: {
      add(...values) {
        values.forEach((value) => classes.add(value));
      }
    }
  };
}

function createHarness({
  record = {
    construction: "slab",
    floor: "2",
    mark: "B30(М400)",
    markValue: 30,
    days: 28,
    actual: 31,
    assessment: { reference: "Laboratory 17", responsible: "Lab engineer", date: "2026-10-20", confirmed: true, verdict: "conforms" },
    createdAt: 100
  },
  currentCheckId = null
} = {}) {
  const state = createStrengthState();
  state.currentCheckId = currentCheckId;
  if (currentCheckId) state.checks.set(currentCheckId, { ...record });
  const result = createResultElement();
  const restored = [];
  const cleared = [];
  const calls = [];
  const journals = [];
  const notifications = [];
  const stored = new Map();
  const chartCalls = [];
  let currentRecord = { ...record };

  const form = {
    init() {},
    readCheck() {
      return { ...currentRecord };
    },
    restoreCheck(check) {
      currentRecord = { ...check };
      restored.push(check);
    },
    clear() {
      cleared.push(true);
    },
    validateMarking() {
      return true;
    },
    updateFieldsVisibility() {},
    updateLocation() {},
    getConstructionFlags() {
      return {
        profile: "plate",
        behavior: { floorRequired: true },
        isPlate: true,
        isColumn: false,
        isWall: false,
        isBeam: false,
        isStair: false,
        isUnsupported: false
      };
    },
    getSelectedConstructionKey() {
      return "slab";
    },
    getSelectedConstructionLabel() {
      return "Плита";
    },
    getSelectedConstructionCategory() {
      return "horizontal";
    },
    getSelectedConstructionSubtype() {
      return "";
    },
    setUnsupportedState() {
      return "";
    }
  };
  const service = {
    async loadChecks() {
      return new Map();
    },
    async loadBimElements() {
      return [];
    },
    async createCheck(projectId, payload) {
      calls.push(["create", projectId, payload]);
      return { id: "server-check", ref: { path: "created" } };
    },
    async updateCheck(projectId, checkId, payload) {
      calls.push(["update", projectId, checkId, payload]);
      return { id: checkId, ref: { path: "updated" } };
    },
    async deleteCheck(projectId, checkId) {
      calls.push(["delete", projectId, checkId]);
    },
    async clearChecks(projectId) {
      calls.push(["clear", projectId]);
      return { deletedCount: 1, deletedDualWriteCount: 1 };
    }
  };
  const inspectionState = { strength: false };
  const inspectionChecked = { strength: false };
  const chart = {
    render(series, hasActual) {
      chartCalls.push(["render", series, hasActual]);
      return true;
    },
    destroy() {
      chartCalls.push(["destroy"]);
    }
  };
  const dom = {
    checksList: null,
    document: {},
    floor: { value: String(record.floor || ""), focus() {} },
    mark: { value: String(record.mark || ""), focus() {} },
    result,
    checkButton: null,
    saveButton: null,
    clearFormButton: null,
    clearChecksButton: null
  };
  const actions = createStrengthActions({
    state,
    service,
    form,
    chart,
    dom,
    inspectionState,
    inspectionChecked,
    storage: {
      getItem(key) {
        return stored.get(key) || null;
      },
      setItem(key, value) {
        stored.set(key, value);
      }
    },
    storageKey: "strength-test",
    getCurrentProjectId: () => "project-1",
    validateProject: () => true,
    async loadBimElements() {},
    async ensureChartJsLoaded() {
      return true;
    },
    renderRegulatoryBasis: () => "<div>Норматив</div>",
    notify(message, tone) {
      notifications.push([message, tone]);
    },
    confirm: async () => true,
    updateSummary() {
      calls.push(["summary"]);
    },
    addJournalEntry(payload) {
      journals.push(["add", payload]);
    },
    async upsertJournalEntry(payload) {
      journals.push(["upsert", payload]);
    },
    notifyFirestoreSyncStatus(ref) {
      calls.push(["sync", ref]);
    },
    schedule(callback) {
      callback();
    },
    now: () => 200
  });

  return {
    actions,
    state,
    form,
    result,
    restored,
    cleared,
    calls,
    journals,
    notifications,
    chartCalls,
    inspectionState,
    inspectionChecked,
    setRecord(nextRecord) {
      currentRecord = { ...nextRecord };
      dom.floor.value = String(nextRecord.floor || "");
      dom.mark.value = String(nextRecord.mark || "");
    }
  };
}

test("strength action checks complete data and records accepted status", async () => {
  const harness = createHarness();

  await harness.actions.runCheck({ autoSave: false });

  assert.equal(harness.inspectionState.strength, true);
  assert.equal(harness.inspectionChecked.strength, true);
  assert.match(harness.result.textContent, /engineering_conforms|Соответствует/u);
  assert.equal(harness.chartCalls.length, 1);
  assert.equal(harness.journals.length, 0);
});

test("strength action keeps check incomplete when actual strength is absent", async () => {
  const harness = createHarness({
    record: {
      construction: "slab",
      floor: "2",
      mark: "B30(М400)",
      markValue: 30,
      days: 7,
      actual: null
    }
  });

  await harness.actions.runCheck({ autoSave: false });

  assert.equal(harness.inspectionState.strength, false);
  assert.equal(harness.inspectionChecked.strength, false);
  assert.match(harness.result.textContent, /engineering_requires_review|Требует проверки/u);
  assert.equal(harness.journals.length, 0);
});

test("strength action saves a new check and replaces its provisional id", async () => {
  const harness = createHarness();

  const checkId = await harness.actions.saveCheck();

  assert.equal(checkId, "server-check");
  assert.equal(harness.state.currentCheckId, "server-check");
  assert.equal(harness.state.checks.has("server-check"), true);
  assert.equal(harness.calls[0][0], "create");
  assert.equal(harness.journals[0][0], "upsert");
  assert.equal(harness.journals[0][1].sourceId, "server-check");
});

test("strength action updates the current check", async () => {
  const harness = createHarness({ currentCheckId: "check-1" });

  const checkId = await harness.actions.saveCheck();

  assert.equal(checkId, "check-1");
  assert.equal(harness.calls[0][0], "update");
  assert.equal(harness.calls[0][2], "check-1");
  assert.equal(harness.state.currentCheckId, "check-1");
});

test("strength action restores a saved check into the form", async () => {
  const harness = createHarness({ currentCheckId: "check-1" });

  await harness.actions.loadCheck("check-1");

  assert.equal(harness.restored.length, 1);
  assert.equal(harness.restored[0].mark, "B30(М400)");
  assert.equal(harness.state.currentCheckId, "check-1");
});

test("strength action deletes a check and clears its edit id", async () => {
  const harness = createHarness({ currentCheckId: "check-1" });

  const deleted = await harness.actions.deleteCheck("check-1", {
    askConfirmation: false
  });

  assert.equal(deleted, true);
  assert.equal(harness.state.checks.size, 0);
  assert.equal(harness.state.currentCheckId, null);
  assert.deepEqual(harness.calls.find((call) => call[0] === "delete"), [
    "delete",
    "project-1",
    "check-1"
  ]);
});

test("strength action clears every check and inspection status", async () => {
  const harness = createHarness({ currentCheckId: "check-1" });
  harness.inspectionState.strength = true;
  harness.inspectionChecked.strength = true;

  const cleared = await harness.actions.clearChecks({
    askConfirmation: false
  });

  assert.equal(cleared, true);
  assert.equal(harness.state.checks.size, 0);
  assert.equal(harness.state.currentCheckId, null);
  assert.equal(harness.inspectionState.strength, false);
  assert.equal(harness.inspectionChecked.strength, false);
  assert.equal(harness.calls.some((call) => call[0] === "clear"), true);
});

test("strength chart destroys the previous instance before recreating it", () => {
  const instances = [];
  class FakeChart {
    constructor(_context, config) {
      this.config = config;
      this.destroyed = false;
      instances.push(this);
    }

    destroy() {
      this.destroyed = true;
    }
  }
  const canvas = {
    style: { display: "none" },
    getContext() {
      return {};
    }
  };
  const chart = createStrengthChartController({
    canvas,
    getChartConstructor: () => FakeChart
  });
  const series = {
    labels: [1],
    normative: [6],
    actual: [7]
  };

  assert.equal(chart.render(series, true), true);
  assert.equal(chart.render(series, true), true);
  assert.equal(instances[0].destroyed, true);
  chart.destroy();
  assert.equal(instances[1].destroyed, true);
  assert.equal(canvas.style.display, "none");
});

test("strength journal payload keeps result context and source id", () => {
  const payload = buildStrengthJournalPayload(
    {
      floor: "4",
      construction: "floor_slab", assessment: { reference: "Laboratory 17", responsible: "Lab engineer", date: "2026-10-20", confirmed: true, verdict: "conforms" },
      markValue: 30,
      days: 28,
      actual: 31
    },
    { sourceId: "check-4" }
  );

  assert.deepEqual(payload, {
    evaluationSchemaVersion: 2,
    module: "Прочность",
    status: "ok",
    context: "Этаж 4, день=28",
    details: "основание=Laboratory 17; факт=31.0 МПа",
    construction: "floor_slab",
    sourceId: "check-4"
  });
});
