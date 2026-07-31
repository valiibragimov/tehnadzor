import assert from "node:assert/strict";
import test from "node:test";

global.document = {
  getElementById() {
    return null;
  },
  createElement(tagName) {
    if (tagName === "template") {
      return {
        innerHTML: "",
        content: {
          querySelectorAll() {
            return [];
          }
        }
      };
    }
    return { id: "", textContent: "" };
  },
  createTextNode(textContent) {
    return { textContent };
  },
  head: {
    appendChild() {}
  }
};

const {
  buildReinforcementLocation,
  createReinforcementForm,
  getReinforcementVisibility
} = await import(
  "../../dist/features/inspections/reinforcement/form.js"
);
const { createReinforcementRowsRuntime } = await import(
  "../../dist/features/inspections/reinforcement/rows-runtime.js"
);
const {
  buildReinforcementMeasurementResults,
  createReinforcementRuntime
} = await import(
  "../../dist/features/inspections/reinforcement/runtime.js"
);
const { createReinforcementState } = await import(
  "../../dist/features/inspections/reinforcement/state.js"
);

function fakeClassList() {
  const values = new Set();
  return {
    add(...items) {
      items.forEach((item) => values.add(item));
    },
    remove(...items) {
      items.forEach((item) => values.delete(item));
    },
    toggle(item, enabled) {
      if (enabled) values.add(item);
      else values.delete(item);
    },
    contains(item) {
      return values.has(item);
    }
  };
}

function fakeElement(value = "") {
  return {
    value,
    dataset: {},
    style: { display: "" },
    hidden: false,
    disabled: false,
    textContent: "",
    innerHTML: "",
    className: "",
    classList: fakeClassList(),
    parentElement: null,
    options: [],
    addEventListener() {},
    appendChild(child) {
      this.options.push(child);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    focus() {}
  };
}

function createDom(constructionKey = "slab") {
  const construction = fakeElement(constructionKey);
  construction.dataset.machineValue = constructionKey;
  construction.dataset.displayLabel = "Конструкция";
  construction.dataset.categoryKey = "horizontal";
  const fields = {
    document: {
      readyState: "complete",
      addEventListener() {},
      createElement() {
        return fakeElement();
      }
    },
    construction,
    reinfFloorEl: fakeElement("2"),
    reinfLocationEl: fakeElement(),
    reinfAxisLetterFromEl: fakeElement("А"),
    reinfAxisLetterToEl: fakeElement("Б"),
    reinfAxisNumberFromEl: fakeElement("1"),
    reinfAxisNumberToEl: fakeElement("2"),
    reinfStripAxisModeEl: fakeElement("letter_numbers"),
    reinfStairNameEl: fakeElement(),
    reinfColumnFloorEl: fakeElement(),
    reinfBeamFloorEl: fakeElement(),
    reinfWallFloorEl: fakeElement(),
    projDia: fakeElement("12"),
    factDia: fakeElement("12"),
    projStep: fakeElement("200"),
    factStep: fakeElement("205"),
    projCover: fakeElement("30"),
    factCover: fakeElement("31"),
    reinfProjHoopsStepEl: fakeElement(),
    reinfFactHoopsStepEl: fakeElement(),
    reinfResult: fakeElement(),
    reinfChecksList: null,
    btnReinf: null,
    btnSaveReinfCheck: null,
    btnClearReinfForm: null,
    btnClearReinfChecks: null,
    btnAddReinfColumn: null,
    btnAddReinfBeam: null,
    btnAddReinfWall: null,
    reinfColumnsList: null,
    reinfBeamsList: null,
    reinfWallsList: null
  };
  return new Proxy(fields, {
    get(target, property) {
      return property in target ? target[property] : null;
    }
  });
}

function flags(profile, locationMode = "") {
  return {
    profile,
    behavior: {
      supported: true,
      locationMode,
      floorVisible: true
    },
    isPlate: profile === "plate",
    isColumn: profile === "column",
    isWall: profile === "wall",
    isBeam: profile === "beam",
    isStair: profile === "stair",
    isUnsupported: false
  };
}

function createFormHarness(constructionKey = "slab") {
  const state = createReinforcementState();
  const dom = createDom(constructionKey);
  const calls = [];
  const rows = {
    renderColumns() {
      calls.push("render-columns");
    },
    renderBeams() {
      calls.push("render-beams");
    },
    renderWalls() {
      calls.push("render-walls");
    },
    loadWallsDraft() {},
    saveWallsDraft() {},
    bindWallButton() {},
    updateWallLimit() {}
  };
  const bim = {
    collectCheckData() {
      return { bimElementId: "bim-1" };
    },
    restoreSelection(check) {
      calls.push(["restore-bim", check.id]);
    },
    clearSelection(options) {
      calls.push(["clear-bim", options]);
    },
    renderBinding() {},
    updateControls() {},
    updateHighlights() {}
  };
  const form = createReinforcementForm({
    state,
    dom,
    bim,
    rows,
    inspectionState: { reinforcement: true },
    inspectionChecked: { reinforcement: true },
    notify() {},
    setConstruction(next) {
      dom.construction.value = next;
      dom.construction.dataset.machineValue = next;
    },
    now: () => 1000
  });
  return { state, dom, calls, form };
}

test("reinforcement location is formed from axes", () => {
  assert.equal(buildReinforcementLocation({
    profile: "plate",
    letterFrom: "А",
    letterTo: "В",
    numberFrom: "1",
    numberTo: "4"
  }), "А-В, 1-4");
});

test("strip foundation supports both axis modes", () => {
  assert.equal(buildReinforcementLocation({
    profile: "plate",
    locationMode: "strip_foundation",
    axisMode: "letter_numbers",
    letterFrom: "Б",
    letterTo: "Г",
    numberFrom: "3"
  }), "3, Б-Г");
  assert.equal(buildReinforcementLocation({
    profile: "plate",
    locationMode: "strip_foundation",
    axisMode: "number_letters",
    letterFrom: "Д",
    numberFrom: "5",
    numberTo: "8"
  }), "5-8, Д");
});

test("visibility follows column, beam, wall, plate and stair profiles", () => {
  assert.deepEqual(
    getReinforcementVisibility(flags("column")),
    {
      location: false,
      column: true,
      beam: false,
      wall: false,
      common: false,
      stairName: false,
      letterTo: false,
      numberTo: false
    }
  );
  assert.equal(getReinforcementVisibility(flags("beam")).beam, true);
  assert.equal(getReinforcementVisibility(flags("wall")).wall, true);
  assert.equal(getReinforcementVisibility(flags("plate")).location, true);
  const stair = getReinforcementVisibility(flags("stair"));
  assert.equal(stair.location, true);
  assert.equal(stair.stairName, true);
});

test("form creates and restores a persisted payload", () => {
  const { state, dom, form, calls } = createFormHarness();
  const payload = form.readCheck();
  assert.equal(payload.location, "А-Б, 1-2");
  assert.equal(payload.floor, "2");
  assert.equal(payload.projDia, 12);
  assert.equal(payload.bimElementId, "bim-1");

  form.restoreCheck({
    ...payload,
    id: "saved-1",
    floor: "7",
    axisLetterFrom: "В",
    axisLetterTo: "Г",
    axisNumberFrom: "4",
    axisNumberTo: "6",
    location: "В-Г, 4-6",
    projDia: 16
  });
  assert.equal(state.currentCheckId, "saved-1");
  assert.equal(dom.reinfFloorEl.value, "7");
  assert.equal(dom.projDia.value, "16");
  assert.equal(dom.reinfLocationEl.value, "В-Г, 4-6");
  assert.ok(calls.some((item) =>
    Array.isArray(item) && item[0] === "restore-bim"
  ));
});

test("form clear resets rows, values and BIM binding", () => {
  const { state, dom, form, calls } = createFormHarness();
  state.currentCheckId = "saved-1";
  state.columns = [{ id: 1, marking: "К1" }];
  state.beams = [{ id: 2, marking: "Б1" }];
  state.walls = [{ id: 3, bindingType: "number_letters" }];
  form.clear();
  assert.equal(state.currentCheckId, null);
  assert.deepEqual(state.columns, []);
  assert.deepEqual(state.beams, []);
  assert.deepEqual(state.walls, []);
  assert.equal(dom.projDia.value, "");
  assert.ok(calls.some((item) =>
    Array.isArray(item) &&
    item[0] === "clear-bim" &&
    item[1].keepManualFields === false
  ));
});

test("row runtime adds, changes and removes elements", () => {
  const state = createReinforcementState();
  const dom = createDom("column");
  let constructionKey = "column";
  const rows = createReinforcementRowsRuntime({
    state,
    dom,
    storage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {}
    },
    getCurrentProjectId: () => "project-1",
    getConstructionKey: () => constructionKey,
    getConstructionSubtype: () => "",
    getConstructionFlags: () => flags(
      constructionKey === "wall" ? "wall" : constructionKey
    ),
    getBimMark: () => null,
    setBimFieldAutofilled() {},
    notify() {}
  });

  assert.equal(rows.addColumn(10), true);
  assert.equal(rows.updateColumn(10, { marking: "К1" }), true);
  assert.equal(state.columns[0].marking, "К1");
  rows.removeColumn(10);
  assert.equal(state.columns.length, 0);

  assert.equal(rows.addBeam(20), true);
  assert.equal(rows.updateBeam(20, { factDia: "14" }), true);
  assert.equal(state.beams[0].factDia, "14");
  rows.removeBeam(20);
  assert.equal(state.beams.length, 0);

  constructionKey = "wall";
  dom.reinfWallsList = fakeElement();
  assert.equal(rows.addWall(30), true);
  assert.equal(rows.updateWall(30, { numberAxis: "2" }), true);
  assert.equal(state.walls[0].numberAxis, "2");
  rows.removeWall(30);
  assert.equal(state.walls.length, 0);
});

function createRuntimeHarness() {
  const state = createReinforcementState();
  const dom = createDom("slab");
  const calls = [];
  const journals = [];
  const storage = new Map();
  const service = {
    async loadChecks() {
      return new Map();
    },
    async createCheck(projectId, payload) {
      calls.push(["create", projectId, payload]);
      return { id: "created-1", ref: { path: "created" } };
    },
    async updateCheck(projectId, id, payload) {
      calls.push(["update", projectId, id, payload]);
      return { id, ref: { path: "updated" } };
    },
    async deleteCheck() {},
    async clearChecks() {},
    async loadBimElements() {
      return [];
    }
  };
  const runtime = createReinforcementRuntime({
    state,
    service,
    dom,
    bim: {
      collectCheckData: () => ({}),
      restoreSelection() {},
      clearSelection() {},
      renderBinding() {},
      updateControls() {},
      updateHighlights() {},
      initBindings() {},
      async loadElements() {},
      renderVisualPanel() {},
      getMark: () => null,
      setFieldAutofilled() {}
    },
    inspectionState: {},
    inspectionChecked: {},
    storage: {
      getItem(key) {
        return storage.get(key) || null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
      removeItem(key) {
        storage.delete(key);
      }
    },
    storageKey: "reinf-test",
    getCurrentProjectId: () => "project-1",
    validateProject: () => true,
    setConstruction(next) {
      dom.construction.value = next;
      dom.construction.dataset.machineValue = next;
    },
    notify() {},
    confirm: async () => true,
    updateSummary() {},
    addJournalEntry(payload) {
      journals.push(["add", payload]);
    },
    upsertJournalEntry(payload) {
      journals.push(["upsert", payload]);
    },
    notifyFirestoreSyncStatus() {}
  });
  return { state, dom, calls, journals, runtime };
}

test("runtime updates existing check but creates a new one after location changes", async () => {
  const { state, dom, calls, runtime } = createRuntimeHarness();
  const existing = runtime.form.readCheck();
  state.currentCheckId = "saved-1";
  state.checks.set("saved-1", { ...existing, id: "saved-1" });

  await runtime.saveCheck();
  assert.equal(calls[0][0], "update");
  assert.equal(calls[0][2], "saved-1");

  calls.length = 0;
  state.currentCheckId = "saved-1";
  dom.reinfAxisNumberToEl.value = "3";
  await runtime.saveCheck();
  assert.equal(calls[0][0], "create");
  assert.equal(calls[0][2].location, "А-Б, 1-3");
});

test("run result contains the final phrase", async () => {
  const { dom, runtime } = createRuntimeHarness();
  await runtime.runCheck();
  assert.match(
    dom.reinfResult.innerHTML,
    /Армирование соответствует проекту и нормативным требованиям\./
  );
});

test("run result contains the reinforcement regulatory basis", async () => {
  const { dom, runtime } = createRuntimeHarness();
  await runtime.runCheck();
  assert.match(dom.reinfResult.innerHTML, /Нормативное основание/);
});

test("hoops step keeps GOST R 57997-2017 as its regulatory document", () => {
  const results = buildReinforcementMeasurementResults(
    {
      projDia: null,
      factDia: null,
      projStep: null,
      factStep: null,
      projCover: null,
      factCover: null,
      projHoopsStep: 200,
      factHoopsStep: 205
    },
    true,
    "column",
    ""
  );
  const hoops = results.find((result) => result.name === "Шаг хомутов");
  assert.equal(hoops?.regulatoryDoc, "GOST_R_57997_2017");
});

test("partially filled check auto-saves with empty status", async () => {
  const { state, dom, calls, runtime } = createRuntimeHarness();
  dom.factDia.value = "";
  dom.factStep.value = "";
  dom.factCover.value = "";

  await runtime.runCheck();

  const createCall = calls.find((call) => call[0] === "create");
  assert.ok(createCall);
  assert.equal(createCall[2].status, "empty");
  assert.equal(state.checks.get("created-1")?.status, "empty");
});

test("empty auto-saved check does not create a journal entry", async () => {
  const { dom, journals, runtime } = createRuntimeHarness();
  dom.factDia.value = "";
  dom.factStep.value = "";
  dom.factCover.value = "";

  await runtime.runCheck();

  assert.deepEqual(journals, []);
});
