import type { DemoService } from "./services/demo-service.js";
import type { DemoInspection, DemoInspectionModule, DemoState } from "./types.js";

export interface DemoUiOptions {
  root: Document;
  service: DemoService;
}

const MODULE_SECTION: Record<DemoInspectionModule, string> = {
  geodesy: "geo",
  reinforcement: "reinforcement",
  geometry: "geometry",
  strength: "strength"
};

const MODULE_LABEL: Record<DemoInspectionModule, string> = {
  geodesy: "Геодезия",
  reinforcement: "Армирование",
  geometry: "Геометрия",
  strength: "Прочность"
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function statusLabel(status: string): string {
  if (status === "done" || status === "resolved") return "В норме";
  if (status === "deviation" || status === "issue_open") return "Есть отклонение";
  if (status === "required") return "Требуется выполнить";
  return "Нет данных";
}

function statusTone(status: string): string {
  if (status === "done" || status === "resolved") return "success";
  if (status === "deviation" || status === "issue_open") return "danger";
  return "warning";
}

export function mountDemoUi({ root, service }: DemoUiOptions) {
  const byId = <T extends HTMLElement>(id: string) => root.getElementById(id) as T | null;
  const setText = (id: string, value: unknown) => {
    const element = byId(id);
    if (element) element.textContent = String(value ?? "");
  };
  const setInput = (id: string, value: string) => {
    const input = byId<HTMLInputElement | HTMLSelectElement>(id);
    if (input) input.value = value;
  };
  const show = (id: string, visible = true) => {
    const element = byId(id);
    if (!element) return;
    element.hidden = !visible;
    element.style.display = visible ? "" : "none";
  };

  let activeSection = "overview";
  let toastTimer = 0;

  const notify = (message: string) => {
    root.querySelector(".demo-toast")?.remove();
    const toast = root.createElement("div");
    toast.className = "demo-toast";
    toast.setAttribute("role", "status");
    toast.textContent = message;
    root.body.append(toast);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.remove(), 2600);
  };

  const activateSection = (target: string) => {
    const section = byId(target);
    if (!section?.classList.contains("section")) return;
    activeSection = target;
    root.querySelectorAll<HTMLElement>(".section").forEach((item) => {
      item.classList.toggle("active", item.id === target);
    });
    root.querySelectorAll<HTMLElement>(".tab[data-target]").forEach((item) => {
      item.classList.toggle("active", item.dataset.target === target);
    });
    root.querySelectorAll<HTMLElement>(".bottom-nav-item[data-tab]").forEach((item) => {
      const tab = item.dataset.tab;
      item.classList.toggle("active", tab === target);
    });
    const inspectionActive = ["geo", "reinforcement", "geometry", "strength"].includes(target);
    root.querySelector<HTMLElement>('.bottom-nav-item[data-tab-group="inspections"]')?.classList.toggle("active", inspectionActive);
    const bottomMenu = byId("bottomInspectionMenu");
    bottomMenu?.classList.remove("is-open");
    bottomMenu?.setAttribute("aria-hidden", "true");
    root.querySelector<HTMLElement>('.bottom-nav-item[data-tab-group="inspections"]')?.setAttribute("aria-expanded", "false");
    root.querySelector(".tabs-group-trigger")?.classList.toggle(
      "active",
      ["geo", "reinforcement", "geometry", "strength"].includes(target)
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const renderInspectionList = (module: DemoInspectionModule, containerId: string) => {
    const container = byId(containerId);
    if (!container) return;
    const inspections = service.getState().inspections.filter((item) => item.module === module);
    container.innerHTML = inspections.length
      ? inspections.map((item) => `
        <article class="node" data-demo-inspection-id="${escapeHtml(item.id)}">
          <div class="node-head">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="status ${item.status === "done" ? "ok" : "bad"}">${statusLabel(item.status)}</span>
          </div>
          <div class="meta">${escapeHtml(formatDate(item.createdAt))} · ${escapeHtml(item.constructionMark)}</div>
          <div class="subtitle">${escapeHtml(item.summary)}</div>
        </article>`).join("")
      : '<div class="geo-manual-note">Сохранённых проверок пока нет.</div>';
  };

  const renderOverview = (state: DemoState) => {
    const metrics = service.getMetrics();
    setText("overviewProjectName", `${state.project.name} · ${state.project.organization}`);
    setText("overviewReadinessValue", `${metrics.percent}%`);
    setText("overviewReadinessNote", `Выполнено ${metrics.completed} из ${metrics.total} обязательных объектовых задач.`);
    setText("overviewChecksCount", state.inspections.length);
    setText("overviewIssuesCount", metrics.openIssues);
    setText("overviewIssuesNote", metrics.openIssues ? "требуют закрытия" : "нет активных");
    setText("overviewIfcCount", state.bimElements.length ? 1 : 0);
    setText("overviewModulesCount", `${metrics.completed} / ${metrics.total}`);
    setText("overviewStatusBadge", metrics.openIssues || metrics.deviations ? "Требуется внимание" : "Готово");
    setText("overviewNextTitle", metrics.openIssues ? "Устраните открытые отклонения" : "Продолжите проверки по плану");
    setText("overviewNextDescription", metrics.openIssues
      ? `Открытых замечаний: ${metrics.openIssues}. После устранения проведите повторный контроль.`
      : "Откройте план контроля и выполните следующую обязательную задачу.");
    const progress = byId("overviewProgressBar");
    if (progress) progress.style.width = `${metrics.percent}%`;
    byId("overviewProgress")?.setAttribute("aria-valuenow", String(metrics.percent));

    for (const module of Object.keys(MODULE_SECTION) as DemoInspectionModule[]) {
      const inspections = state.inspections.filter((item) => item.module === module);
      const task = state.controlPlan.find((item) => item.module === module && item.inspectionStatus === "object");
      const suffix = module === "reinforcement" ? "Reinforcement" : module === "geometry" ? "Geometry" : module === "strength" ? "Strength" : "Geo";
      setText(`overview${suffix}Count`, inspections.length);
      setText(`overview${suffix}Status`, task ? statusLabel(task.status) : "Не требуется по плану");
      const row = root.querySelector<HTMLElement>(`.overview-module-row[data-overview-target="${MODULE_SECTION[module]}"]`);
      if (row) row.dataset.tone = task ? statusTone(task.status) : "neutral";
    }
  };

  const renderControlPlan = (state: DemoState) => {
    const constructionMarks = [...new Set(state.controlPlan.map((item) => item.constructionMark))];
    const rows = constructionMarks.map((mark) => {
      const tasks = state.controlPlan.filter((item) => item.constructionMark === mark);
      const objectTasks = tasks.filter((item) => item.inspectionStatus === "object");
      const completed = objectTasks.filter((item) => ["done", "resolved"].includes(item.status)).length;
      const blocked = objectTasks.some((item) => ["deviation", "issue_open"].includes(item.status));
      const missing = objectTasks.some((item) => item.status === "required");
      return { mark, tasks, completed, total: objectTasks.length, status: blocked ? "blocked" : missing ? "missing_required" : "ready" };
    });
    setText("controlPlanTotalRows", rows.length);
    setText("controlPlanReadyRows", rows.filter((row) => row.status === "ready").length);
    setText("controlPlanBlockedRows", rows.filter((row) => row.status === "blocked").length);
    setText("controlPlanMissingTasks", state.controlPlan.filter((item) => item.inspectionStatus === "object" && item.status === "required").length);
    const body = byId<HTMLTableSectionElement>("controlPlanTableBody");
    if (body) {
      const renderTask = (row: (typeof rows)[number], module: DemoInspectionModule) => {
        const task = row.tasks.find((item) => item.module === module);
        if (!task) return '<span class="control-plan-task control-plan-task--na">—</span>';
        return `<button type="button" class="control-plan-task control-plan-task--${task.status}" data-demo-plan-target="${MODULE_SECTION[module]}">${escapeHtml(statusLabel(task.status))}</button>`;
      };
      body.innerHTML = rows.map((row) => {
        const nextTask = row.tasks.find((item) => !["done", "resolved"].includes(item.status));
        const statusLabelText = row.status === "ready" ? "Готово" : row.status === "blocked" ? "Нельзя принимать" : "Не хватает проверок";
        return `
          <tr class="control-plan-row control-plan-row--${row.status}">
            <td class="control-plan-construction"><strong>${escapeHtml(row.mark)}</strong><span>${escapeHtml(state.project.structureType)}</span></td>
            <td><span class="control-plan-status control-plan-status--${row.status}">${statusLabelText}</span></td>
            <td><span class="control-plan-progress">${row.completed}/${row.total}</span></td>
            <td><button type="button" class="control-plan-next-action" data-demo-plan-target="${nextTask ? MODULE_SECTION[nextTask.module] : "summary"}">${escapeHtml(nextTask?.title || "Открыть итог")}</button></td>
            <td>${renderTask(row, "geodesy")}</td>
            <td>${renderTask(row, "reinforcement")}</td>
            <td>${renderTask(row, "geometry")}</td>
            <td>${renderTask(row, "strength")}</td>
          </tr>`;
      }).join("");
    }
    show("controlPlanEmpty", false);
    show("controlPlanTableWrap", true);
  };

  const renderJournal = (state: DemoState) => {
    const tbody = root.querySelector<HTMLTableSectionElement>("#journalTable tbody");
    if (tbody) {
      tbody.innerHTML = state.journal.map((entry) => `
        <tr>
          <td>${escapeHtml(formatDate(entry.createdAt))}</td>
          <td>${escapeHtml(entry.title)}</td>
          <td>${escapeHtml(entry.kind === "inspection" ? "Конструкция" : "Замечание")}</td>
          <td>${escapeHtml(entry.description)}</td>
          <td><span class="status ${statusTone(entry.status)}">${escapeHtml(statusLabel(entry.status))}</span></td>
          <td>${escapeHtml(entry.description)}</td>
          <td></td>
        </tr>`).join("");
    }
    setText("journalStatTotal", state.journal.length);
    setText("journalStatExceeded", state.journal.filter((entry) => ["deviation", "issue_open"].includes(entry.status)).length);
    const openIssues = state.issues.filter((issue) => issue.status === "open");
    setText("journalIssueOpenCount", openIssues.length);
    setText("journalIssueOverdueCount", 0);
    show("journalIssueEmpty", state.issues.length === 0);
    const list = byId("journalIssueList");
    if (list) {
      list.innerHTML = `
        <form id="demoIssueForm" class="card" style="margin-bottom:12px">
          <div class="grid-2"><div><label>Замечание</label><input name="title" required value="Отклонение контрольного параметра"></div><div><label>Марка</label><input name="mark" required value="СТ-02"></div></div>
          <label>Корректирующее действие</label><textarea name="description" required>Устранить отклонение и предъявить конструкцию повторно.</textarea>
          <button class="btn-small btn-secondary" type="submit">Создать замечание</button>
        </form>
        ${state.issues.map((issue) => `
          <article class="journal-issue-card" data-demo-issue-id="${escapeHtml(issue.id)}">
            <div class="journal-issues-head"><div><strong>${escapeHtml(issue.title)}</strong><div class="meta">${escapeHtml(issue.constructionMark)} · ${escapeHtml(formatDate(issue.createdAt))}</div></div><span class="status ${issue.status === "open" ? "bad" : "ok"}">${issue.status === "open" ? "Открыто" : "Закрыто"}</span></div>
            <p>${escapeHtml(issue.description)}</p>
            ${issue.status === "open" ? `<div class="demo-issue-actions"><button class="btn-small btn-secondary" type="button" data-demo-repeat-control="${escapeHtml(issue.id)}">Повторный контроль</button></div>` : ""}
          </article>`).join("")}`;
    }
  };

  const renderSummary = (state: DemoState) => {
    for (const module of Object.keys(MODULE_SECTION) as DemoInspectionModule[]) {
      const inspections = state.inspections.filter((item) => item.module === module);
      const deviations = inspections.filter((item) => item.status === "deviation").length;
      const statusId = module === "reinforcement" ? "summaryModuleStatusReinf" : module === "geometry" ? "summaryModuleStatusGeom" : module === "strength" ? "summaryModuleStatusStrength" : "summaryModuleStatusGeo";
      const statsId = module === "reinforcement" ? "summaryModuleStatsReinf" : module === "geometry" ? "summaryModuleStatsGeom" : module === "strength" ? "summaryModuleStatsStrength" : "summaryModuleStatsGeo";
      const status = byId(statusId);
      if (status) status.innerHTML = `<span class="summary-status-badge ${deviations ? "bad" : inspections.length ? "ok" : "empty"}">${deviations ? "Есть отклонения" : inspections.length ? "Выполнено" : "Нет проверок"}</span>`;
      const stats = byId(statsId);
      if (stats) stats.innerHTML = `<span class="summary-module-stat"><span class="summary-module-stat-label">Проверок</span><strong class="summary-module-stat-value">${inspections.length}</strong></span><span class="summary-module-stat"><span class="summary-module-stat-label">Отклонений</span><strong class="summary-module-stat-value">${deviations}</strong></span>`;
    }
    setText("summaryParamProject", state.project.name);
    setText("summaryParamDate", new Intl.DateTimeFormat("ru-RU").format(new Date()));
    setText("summaryParamEngineer", "Демо-инженер");
    const text = byId("summaryTextContent");
    if (text) text.innerHTML = `<p><strong>${escapeHtml(state.project.name)}</strong></p><p>По результатам демонстрационного контроля выполнено ${service.getMetrics().completed} из ${service.getMetrics().total} обязательных задач. Открытых замечаний: ${service.getMetrics().openIssues}.</p>`;
  };

  const render = () => {
    const state = service.getState();
    renderOverview(state);
    renderControlPlan(state);
    renderInspectionList("geodesy", "nodesList");
    renderInspectionList("reinforcement", "reinfChecksList");
    renderInspectionList("geometry", "geomChecksList");
    renderInspectionList("strength", "strengthChecksList");
    renderJournal(state);
    renderSummary(state);
    activateSection(activeSection);
  };

  const projectSelector = byId<HTMLSelectElement>("projectSelector");
  if (projectSelector) projectSelector.innerHTML = '<option value="demo-project">Демонстрационный объект</option>';
  const category = byId<HTMLSelectElement>("constructionCategory");
  if (category) category.innerHTML = '<option>Вертикальные несущие элементы</option>';
  const type = byId<HTMLSelectElement>("constructionType");
  if (type) type.innerHTML = '<option value="Колонна">Колонна</option><option value="Стена">Стена</option><option value="Балка">Балка</option><option value="Плита">Плита</option>';
  setText("bimImportedIfcCount", "IFC: 1");
  setText("bimImportFileState", "Синтетическая BIM-модель");
  setText("bimImportStatus", "4 демонстрационных элемента доступны для привязки");

  root.querySelector("header")?.insertAdjacentHTML("afterend", '<div class="demo-only-note">Демонстрационный режим · синтетические данные сохраняются только в этом браузере.</div>');

  root.querySelectorAll<HTMLElement>("[data-wizard]").forEach((wizard) => {
    const setWizardStep = (step: number) => {
      const steps = [...wizard.querySelectorAll<HTMLElement>("[data-step]")];
      if (!steps.length) return;
      const nextStep = Math.min(Math.max(step, 1), steps.length);
      wizard.dataset.currentStep = String(nextStep);
      steps.forEach((item) => item.classList.toggle("is-active", Number(item.dataset.step) === nextStep));
      wizard.querySelectorAll<HTMLElement>("[data-wizard-step]").forEach((button) => {
        button.classList.toggle("is-active", Number(button.dataset.wizardStep) === nextStep);
      });
      const progress = wizard.querySelector<HTMLElement>("[data-wizard-progress]");
      if (progress) progress.textContent = `Шаг ${nextStep} из ${steps.length}`;
      const previous = wizard.querySelector<HTMLButtonElement>("[data-wizard-prev]");
      const next = wizard.querySelector<HTMLButtonElement>("[data-wizard-next]");
      if (previous) previous.disabled = nextStep === 1;
      if (next) next.disabled = nextStep === steps.length;
    };

    wizard.querySelectorAll<HTMLElement>("[data-wizard-step]").forEach((button) => {
      button.addEventListener("click", () => setWizardStep(Number(button.dataset.wizardStep || 1)));
    });
    wizard.querySelector<HTMLElement>("[data-wizard-prev]")?.addEventListener("click", () => {
      setWizardStep(Number(wizard.dataset.currentStep || 1) - 1);
    });
    wizard.querySelector<HTMLElement>("[data-wizard-next]")?.addEventListener("click", () => {
      setWizardStep(Number(wizard.dataset.currentStep || 1) + 1);
    });
    setWizardStep(1);
  });

  root.querySelectorAll<HTMLElement>("[data-sheet-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const sheet = byId(button.dataset.sheetTarget || "");
      if (!sheet) return;
      sheet.classList.add("is-open");
      sheet.setAttribute("aria-hidden", "false");
      sheet.querySelector<HTMLElement>("input, select, textarea, button")?.focus({ preventScroll: true });
    });
  });
  root.querySelectorAll<HTMLElement>("[data-sheet-close]").forEach((button) => {
    button.addEventListener("click", () => {
      const sheet = button.closest<HTMLElement>(".wizard-sheet");
      sheet?.classList.remove("is-open");
      sheet?.setAttribute("aria-hidden", "true");
    });
  });

  root.querySelectorAll<HTMLElement>(".tabs-group-trigger").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const group = trigger.closest<HTMLElement>(".tabs-group");
      const shouldOpen = !group?.classList.contains("is-open");
      group?.classList.toggle("is-open", shouldOpen);
      trigger.setAttribute("aria-expanded", String(shouldOpen));
    });
  });
  root.querySelectorAll<HTMLElement>(".tab[data-target]").forEach((tab) => tab.addEventListener("click", () => activateSection(String(tab.dataset.target || "overview"))));
  root.querySelectorAll<HTMLElement>(".bottom-nav-item[data-tab]").forEach((tab) => tab.addEventListener("click", () => {
    const target = String(tab.dataset.tab || "overview");
    activateSection(target);
  }));
  root.querySelector<HTMLElement>('.bottom-nav-item[data-tab-group="inspections"]')?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLElement;
    const menu = byId("bottomInspectionMenu");
    const shouldOpen = !menu?.classList.contains("is-open");
    menu?.classList.toggle("is-open", shouldOpen);
    menu?.setAttribute("aria-hidden", String(!shouldOpen));
    button.setAttribute("aria-expanded", String(shouldOpen));
  });
  root.querySelectorAll<HTMLElement>(".bottom-nav-group-option[data-tab]").forEach((option) => {
    option.addEventListener("click", () => activateSection(String(option.dataset.tab || "reinforcement")));
  });
  root.querySelectorAll<HTMLElement>("[data-overview-target]").forEach((button) => button.addEventListener("click", () => activateSection(String(button.dataset.overviewTarget || "overview"))));
  root.querySelector(".brand")?.addEventListener("click", () => activateSection("overview"));

  byId("themeToggleBtn")?.addEventListener("click", () => {
    const light = root.documentElement.classList.toggle("theme-light");
    root.documentElement.classList.toggle("theme-dark", !light);
    root.body.classList.toggle("theme-light", light);
    root.body.classList.toggle("theme-dark", !light);
  });
  byId("headerProfileButton")?.addEventListener("click", (event) => { event.preventDefault(); notify("Профиль недоступен в демонстрационном режиме"); });
  const logout = byId<HTMLButtonElement>("btnLogout");
  if (logout) {
    logout.title = "Сбросить демонстрационные данные";
    logout.setAttribute("aria-label", "Сбросить демонстрационные данные");
    logout.addEventListener("click", () => {
      if (!window.confirm("Сбросить демонстрационные данные?")) return;
      service.reset();
      render();
      notify("Исходные демонстрационные данные восстановлены.");
    });
  }

  show("reinfColumnFields", true);
  show("reinfCommonFields", true);
  setInput("reinfColumnFloor", "1");
  const columns = byId("reinfColumnsList");
  if (columns) columns.innerHTML = '<div class="card"><label>Маркировка колонны</label><input id="demoReinfMark" value="К-02"></div>';
  setInput("projDia", "16"); setInput("factDia", "16"); setInput("projStep", "200"); setInput("factStep", "198"); setInput("projCover", "30"); setInput("factCover", "31");
  byId("btnReinf")?.addEventListener("click", () => {
    service.createInspection({ module: "reinforcement", constructionMark: (byId<HTMLInputElement>("demoReinfMark")?.value || "К-02").trim(), projectValue: Number(byId<HTMLInputElement>("projDia")?.value), actualValue: Number(byId<HTMLInputElement>("factDia")?.value), tolerance: 1, unit: "мм" });
    render(); notify("Проверка армирования сохранена локально.");
  });

  show("geomPlateFields", true); show("geomPlateThickFields", true);
  setInput("geomFloor", "2"); setInput("projPlateHeight", "200"); setInput("factPlateHeight", "202");
  byId("btnGeom")?.addEventListener("click", () => {
    service.createInspection({ module: "geometry", constructionMark: "ПЛ-02", projectValue: Number(byId<HTMLInputElement>("projPlateHeight")?.value), actualValue: Number(byId<HTMLInputElement>("factPlateHeight")?.value), tolerance: 5, unit: "мм" });
    render(); notify("Геометрическая проверка сохранена локально.");
  });

  setInput("strengthFloor", "2");
  const strengthMark = byId<HTMLSelectElement>("mark");
  if (strengthMark) strengthMark.innerHTML = '<option value="25">B25</option><option value="30">B30</option>';
  setInput("actual", "27.4"); setInput("days", "28");
  byId("btnStrength")?.addEventListener("click", () => {
    service.createInspection({ module: "strength", constructionMark: "Б-02", projectValue: Number(strengthMark?.value || 25), actualValue: Number(byId<HTMLInputElement>("actual")?.value), tolerance: 0, unit: "МПа" });
    render(); notify("Проверка прочности сохранена локально.");
  });

  root.addEventListener("submit", (event) => {
    const form = event.target as HTMLFormElement;
    if (form.id !== "demoIssueForm") return;
    event.preventDefault();
    const data = new FormData(form);
    service.createIssue({ title: String(data.get("title") || "").trim(), constructionMark: String(data.get("mark") || "").trim(), description: String(data.get("description") || "").trim() });
    render(); notify("Замечание добавлено в локальный журнал.");
  });
  root.addEventListener("click", (event) => {
    const planTarget = (event.target as Element).closest<HTMLElement>("[data-demo-plan-target]");
    if (planTarget) {
      activateSection(String(planTarget.dataset.demoPlanTarget || "controlPlan"));
      return;
    }
    const target = (event.target as Element).closest<HTMLElement>("[data-demo-repeat-control]");
    if (!target) return;
    service.resolveIssueWithRepeatControl(String(target.dataset.demoRepeatControl));
    render(); notify("Повторный контроль выполнен, замечание закрыто.");
  });

  render();
}
