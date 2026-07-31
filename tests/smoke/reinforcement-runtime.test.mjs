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
  getReinforcementVisibility,
  isSameReinforcementCheckIdentity
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
  const listeners = new Map();
  const element = {
    value,
    dataset: {},
    style: { display: "" },
    hidden: false,
    disabled: false,
    textContent: "",
    className: "",
    classList: fakeClassList(),
    parentElement: null,
    children: [],
    options: [],
    tabIndex: 0,
    _focused: false,
    _scrolled: false,
    _deleteButton: null,
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    async _emit(type, event) {
      const handlers = listeners.get(type) || [];
      for (const handler of handlers) {
        await handler(event);
      }
    },
    async click(target = this) {
      let stopped = false;
      const event = {
        target,
        preventDefault() {},
        stopPropagation() {
          stopped = true;
        }
      };
      await this._emit("click", event);
      if (!stopped && this.parentElement?._emit) {
        await this.parentElement._emit("click", event);
      }
    },
    appendChild(child) {
      this.options.push(child);
      this.children.push(child);
      child.parentElement = this;
    },
    querySelector(selector) {
      if (selector === '[data-act="del"]') return this._deleteButton;
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest(selector) {
      if (
        selector === '[data-act="del"]' &&
        this.dataset.act === "del"
      ) return this;
      return null;
    },
    setAttribute(name, nextValue) {
      this[name] = String(nextValue);
    },
    focus() {
      this._focused = true;
    },
    scrollIntoView() {
      this._scrolled = true;
    }
  };
  let html = "";
  Object.defineProperty(element, "innerHTML", {
    get() {
      return html;
    },
    set(nextHtml) {
      html = String(nextHtml || "");
      if (!html) {
        element.children = [];
        element.options = [];
      }
      if (html.includes('data-act="del"')) {
        const deleteButton = fakeElement();
        deleteButton.dataset.act = "del";
        deleteButton.parentElement = element;
        element._deleteButton = deleteButton;
      } else {
        element._deleteButton = null;
      }
    }
  });
  return element;
}

function createDom(constructionKey = "slab") {
  const construction = fakeElement(constructionKey);
  construction.dataset.machineValue = constructionKey;
  construction.dataset.displayLabel = "Конструкция";
  construction.dataset.categoryKey = "horizontal";
  const reinforcementWizard = fakeElement();
  const reinforcementChecksStep = fakeElement();
  reinforcementChecksStep.dataset.step = "1";
  reinforcementChecksStep.classList.add("is-active");
  const reinforcementParametersStep = fakeElement();
  reinforcementParametersStep.dataset.step = "2";
  const reinforcementChecksStepButton = fakeElement();
  reinforcementChecksStepButton.dataset.wizardStep = "1";
  reinforcementChecksStepButton.classList.add("is-active");
  const reinforcementParametersStepButton = fakeElement();
  reinforcementParametersStepButton.dataset.wizardStep = "2";
  const wizardEvents = [];
  reinforcementWizard.dataset.currentStep = "1";
  reinforcementParametersStepButton.addEventListener("click", () => {
    reinforcementWizard.dataset.currentStep = "2";
    reinforcementChecksStep.classList.toggle("is-active", false);
    reinforcementParametersStep.classList.toggle("is-active", true);
    reinforcementChecksStepButton.classList.toggle("is-active", false);
    reinforcementParametersStepButton.classList.toggle(
      "is-active",
      true
    );
    wizardEvents.push("wizard-step-2");
  });
  const fields = {
    document: {
      readyState: "complete",
      addEventListener() {},
      createElement() {
        return fakeElement();
      }
    },
    reinforcementSection: fakeElement(),
    reinforcementWizard,
    reinforcementParametersStepButton,
    reinforcementParametersStep,
    _reinforcementChecksStep: reinforcementChecksStep,
    _wizardEvents: wizardEvents,
    construction,
    reinfFloorEl: fakeElement("2"),
    reinfLocationEl: fakeElement(),
    reinfAxisLetterFromEl: fakeElement("А"),
    reinfAxisLetterToEl: fakeElement("Б"),
    reinfAxisNumberFromEl: fakeElement("1"),
    reinfAxisNumberToEl: fakeElement("2"),
    reinfStripAxisModeEl: fakeElement("letter_numbers"),
    reinfStairNameEl: fakeElement(),
    reinfColumnFloorEl: fakeElement("2"),
    reinfBeamFloorEl: fakeElement("2"),
    reinfWallFloorEl: fakeElement("2"),
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
  fields.reinforcementSection.scrollIntoView = () => {
    fields.reinforcementSection._scrolled = true;
    wizardEvents.push("scroll");
  };
  [
    ["floor", fields.reinfFloorEl],
    ["column-floor", fields.reinfColumnFloorEl],
    ["beam-floor", fields.reinfBeamFloorEl],
    ["wall-floor", fields.reinfWallFloorEl]
  ].forEach(([name, element]) => {
    element.focus = () => {
      element._focused = true;
      wizardEvents.push(`focus-${name}`);
    };
  });
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

function createRuntimeHarness({
  constructionKey = "slab",
  withChecksList = false
} = {}) {
  const state = createReinforcementState();
  const dom = createDom(constructionKey);
  if (withChecksList) dom.reinfChecksList = fakeElement();
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
    async deleteCheck(projectId, id) {
      calls.push(["delete", projectId, id]);
    },
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

function linearRow(id, marking, factDia = "12") {
  return {
    id,
    marking,
    projDia: "12",
    factDia,
    projStep: "200",
    factStep: "205",
    projCover: "30",
    factCover: "31",
    projHoopsStep: "200",
    factHoopsStep: "205"
  };
}

function wallRow(id, {
  numberAxis = "1",
  letterAxis1 = "А",
  letterAxis2 = "Б"
} = {}) {
  return {
    id,
    bindingType: "number_letters",
    numberAxis,
    letterAxis1,
    letterAxis2,
    letterAxis: "",
    numberAxis1: "",
    numberAxis2: "",
    projDia: "12",
    factDia: "12",
    projStep: "200",
    factStep: "205",
    projCover: "30",
    factCover: "31"
  };
}

test("changed column marking creates a new check and preserves the old one", async () => {
  const { state, calls, runtime } = createRuntimeHarness({
    constructionKey: "column"
  });
  state.columns = [linearRow(1, "К1")];
  const existing = runtime.form.readCheck();
  state.currentCheckId = "column-1";
  state.checks.set("column-1", { ...existing, id: "column-1" });

  state.columns[0].marking = "К2";
  await runtime.saveCheck();

  assert.equal(calls[0][0], "create");
  assert.equal(state.checks.size, 2);
  assert.equal(state.checks.get("column-1").columns[0].marking, "К1");
  assert.equal(state.checks.get("created-1").columns[0].marking, "К2");
});

test("changed column measurements update the existing check", async () => {
  const { state, calls, runtime } = createRuntimeHarness({
    constructionKey: "column"
  });
  state.columns = [linearRow(1, "К1")];
  const existing = runtime.form.readCheck();
  state.currentCheckId = "column-1";
  state.checks.set("column-1", { ...existing, id: "column-1" });

  state.columns[0].factDia = "14";
  await runtime.saveCheck();

  assert.equal(calls[0][0], "update");
  assert.equal(calls[0][2], "column-1");
  assert.equal(state.checks.size, 1);
});

test("changed beam marking creates while changed measurements update", async () => {
  const changedMark = createRuntimeHarness({
    constructionKey: "beam"
  });
  changedMark.state.beams = [linearRow(1, "Б1")];
  const existingMark = changedMark.runtime.form.readCheck();
  changedMark.state.currentCheckId = "beam-1";
  changedMark.state.checks.set(
    "beam-1",
    { ...existingMark, id: "beam-1" }
  );
  changedMark.state.beams[0].marking = "Б2";
  await changedMark.runtime.saveCheck();
  assert.equal(changedMark.calls[0][0], "create");
  assert.equal(changedMark.state.checks.size, 2);

  const changedMeasurement = createRuntimeHarness({
    constructionKey: "beam"
  });
  changedMeasurement.state.beams = [linearRow(1, "Б1")];
  const existingMeasurement =
    changedMeasurement.runtime.form.readCheck();
  changedMeasurement.state.currentCheckId = "beam-1";
  changedMeasurement.state.checks.set(
    "beam-1",
    { ...existingMeasurement, id: "beam-1" }
  );
  changedMeasurement.state.beams[0].factCover = "35";
  await changedMeasurement.runtime.saveCheck();
  assert.equal(changedMeasurement.calls[0][0], "update");
  assert.equal(changedMeasurement.calls[0][2], "beam-1");
});

test("changed wall axes create a new check", async () => {
  const { state, calls, runtime } = createRuntimeHarness({
    constructionKey: "wall"
  });
  state.walls = [wallRow(1)];
  const existing = runtime.form.readCheck();
  state.currentCheckId = "wall-1";
  state.checks.set("wall-1", { ...existing, id: "wall-1" });

  state.walls[0].letterAxis2 = "В";
  await runtime.saveCheck();

  assert.equal(calls[0][0], "create");
  assert.equal(state.checks.size, 2);
});

test("reordering elements and wall extremes keeps check identity", async () => {
  const { state, calls, runtime } = createRuntimeHarness({
    constructionKey: "column"
  });
  state.columns = [
    linearRow(1, "К1"),
    linearRow(2, "К2")
  ];
  const existing = runtime.form.readCheck();
  state.currentCheckId = "columns-1";
  state.checks.set("columns-1", { ...existing, id: "columns-1" });
  state.columns.reverse();

  await runtime.saveCheck();

  assert.equal(calls[0][0], "update");
  assert.equal(calls[0][2], "columns-1");
  assert.equal(isSameReinforcementCheckIdentity(
    {
      construction: "wall",
      constructionSubtype: "",
      floor: "2",
      walls: [wallRow(1)]
    },
    {
      construction: "wall",
      constructionSubtype: "",
      floor: "2",
      walls: [wallRow(2, {
        letterAxis1: "Б",
        letterAxis2: "А"
      })]
    }
  ), true);
});

test("changing selected BIM element changes check identity", () => {
  assert.equal(isSameReinforcementCheckIdentity(
    {
      construction: "column",
      constructionSubtype: "",
      floor: "2",
      bimElementId: "bim-1",
      columns: [linearRow(1, "К1")]
    },
    {
      construction: "column",
      constructionSubtype: "",
      floor: "2",
      bimElementId: "bim-2",
      columns: [linearRow(2, "К1")]
    }
  ), false);
});

test("clicking a saved check card opens parameters and restores its form", async () => {
  const { state, dom, runtime } = createRuntimeHarness({
    constructionKey: "column",
    withChecksList: true
  });
  state.checks.set("column-card-1", {
    id: "column-card-1",
    construction: "column",
    constructionSubtype: "",
    floor: "7",
    columns: [{
      marking: "К1",
      projDia: 12,
      factDia: 14,
      projStep: 200,
      factStep: 205,
      projCover: 30,
      factCover: 31,
      projHoopsStep: 200,
      factHoopsStep: 205
    }],
    status: "exceeded",
    lastMsg: "<b>Сохранённый результат</b>",
    createdAt: 100
  });

  runtime.renderChecks();
  const card = dom.reinfChecksList.children[0];
  assert.equal(card.dataset.checkId, "column-card-1");
  assert.equal(
    dom._reinforcementChecksStep.classList.contains("is-active"),
    true
  );
  assert.equal(
    dom.reinforcementParametersStep.classList.contains("is-active"),
    false
  );
  await card.click();

  assert.equal(state.currentCheckId, "column-card-1");
  assert.equal(
    dom._reinforcementChecksStep.classList.contains("is-active"),
    false
  );
  assert.equal(
    dom.reinforcementParametersStep.classList.contains("is-active"),
    true
  );
  assert.equal(dom.construction.dataset.machineValue, "column");
  assert.equal(dom.reinfColumnFloorEl.value, "7");
  assert.equal(state.columns[0].marking, "К1");
  assert.equal(state.columns[0].factDia, "14");
  assert.match(dom.reinfResult.innerHTML, /Сохранённый результат/);
  assert.equal(dom.reinforcementSection._scrolled, true);
  assert.equal(dom.reinfColumnFloorEl._focused, true);
  assert.deepEqual(dom._wizardEvents, [
    "wizard-step-2",
    "scroll",
    "focus-column-floor"
  ]);
});

test("clicking delete does not open the saved check", async () => {
  const { state, dom, calls, runtime } = createRuntimeHarness({
    constructionKey: "column",
    withChecksList: true
  });
  state.checks.set("column-delete-1", {
    id: "column-delete-1",
    construction: "column",
    floor: "9",
    columns: [linearRow(1, "К9")],
    createdAt: 100
  });

  runtime.renderChecks();
  const card = dom.reinfChecksList.children[0];
  assert.equal(
    dom._reinforcementChecksStep.classList.contains("is-active"),
    true
  );
  await card._deleteButton.click();

  assert.equal(state.currentCheckId, null);
  assert.equal(dom.reinfColumnFloorEl.value, "2");
  assert.equal(dom.reinforcementSection._scrolled, false);
  assert.equal(
    dom._reinforcementChecksStep.classList.contains("is-active"),
    true
  );
  assert.equal(
    dom.reinforcementParametersStep.classList.contains("is-active"),
    false
  );
  assert.deepEqual(dom._wizardEvents, []);
  assert.ok(calls.some((call) =>
    call[0] === "delete" && call[2] === "column-delete-1"
  ));
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
