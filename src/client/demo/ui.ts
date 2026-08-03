import type { DemoService } from "./services/demo-service.js";
import type {
  DemoInspectionModule,
  DemoInspectionStatus,
  DemoIssueStatus,
  DemoState,
  DemoTaskStatus
} from "./types.js";

type DemoView =
  | "overview"
  | "control-plan"
  | "reinforcement"
  | "geometry"
  | "strength"
  | "journal"
  | "issues"
  | "summary";

export interface DemoUiOptions {
  root: HTMLElement;
  service: DemoService;
}

const VIEW_LABELS: Record<DemoView, string> = {
  overview: "Обзор",
  "control-plan": "План контроля",
  reinforcement: "Армирование",
  geometry: "Геометрия",
  strength: "Прочность",
  journal: "Журнал",
  issues: "Замечания",
  summary: "Итог"
};

const MODULE_LABELS: Record<DemoInspectionModule, string> = {
  geodesy: "Геодезия",
  reinforcement: "Армирование",
  geometry: "Геометрия",
  strength: "Прочность"
};

const STATUS_LABELS: Record<DemoTaskStatus, string> = {
  required: "Требуется выполнить",
  done: "Выполнено",
  resolved: "Закрыто повторным контролем",
  deviation: "Есть отклонение",
  issue_open: "Открыто замечание"
};

const INSPECTION_STATUS_LABELS: Record<DemoInspectionStatus, string> = {
  done: "В норме",
  deviation: "Отклонение",
  empty: "Черновик"
};

const ISSUE_STATUS_LABELS: Record<DemoIssueStatus, string> = {
  open: "Открыто",
  resolved: "Закрыто"
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function statusClass(status: DemoTaskStatus | DemoInspectionStatus | DemoIssueStatus) {
  if (status === "done" || status === "resolved") return "is-success";
  if (status === "deviation" || status === "issue_open" || status === "open") return "is-danger";
  return "is-warning";
}

function renderNavigation(activeView: DemoView) {
  return (Object.entries(VIEW_LABELS) as Array<[DemoView, string]>)
    .map(
      ([view, label]) => `
        <button class="demo-nav__item ${view === activeView ? "is-active" : ""}"
          type="button" data-demo-nav="${view}" aria-current="${view === activeView ? "page" : "false"}">
          ${escapeHtml(label)}
        </button>`
    )
    .join("");
}

function renderOverview(state: DemoState, metrics: ReturnType<DemoService["getMetrics"]>) {
  const taskCards = state.controlPlan
    .filter((task) => task.inspectionStatus !== "notApplicable")
    .slice(0, 6)
    .map(
      (task) => `
        <article class="demo-task-card ${statusClass(task.status)}">
          <div>
            <span class="demo-eyebrow">${escapeHtml(MODULE_LABELS[task.module])}</span>
            <h3>${escapeHtml(task.title)}</h3>
            <p>${escapeHtml(task.constructionMark)}</p>
          </div>
          <span class="demo-status">${escapeHtml(
            task.inspectionStatus === "factory" ? "Заводской контроль" : STATUS_LABELS[task.status]
          )}</span>
        </article>`
    )
    .join("");

  const bimElements = state.bimElements
    .map(
      (element) => `
        <span class="demo-chip">
          <strong>${escapeHtml(element.mark)}</strong>
          ${escapeHtml(element.type)} · ${escapeHtml(element.level)}
        </span>`
    )
    .join("");

  return `
    <section class="demo-page" data-demo-screen="overview">
      <div class="demo-page__heading">
        <div><span class="demo-eyebrow">Рабочая сводка</span><h1>Обзор объекта</h1></div>
        <span class="demo-status ${metrics.openIssues ? "is-danger" : "is-success"}">
          ${metrics.openIssues ? "Требуется внимание" : "Готово"}
        </span>
      </div>
      <article class="demo-readiness">
        <div><span class="demo-eyebrow">Готовность по плану</span><strong>${metrics.percent}%</strong></div>
        <div class="demo-readiness__copy">Выполнено ${metrics.completed} из ${metrics.total} обязательных объектовых задач</div>
        <div class="demo-progress"><span style="width:${metrics.percent}%"></span></div>
      </article>
      <div class="demo-metric-grid">
        <article><span>Проверок</span><strong>${state.inspections.length}</strong><small>в журнале объекта</small></article>
        <article><span>Открытых замечаний</span><strong>${metrics.openIssues}</strong><small>требуют закрытия</small></article>
        <article><span>Отклонений</span><strong>${metrics.deviations}</strong><small>по обязательным задачам</small></article>
        <article><span>Заводской контроль</span><strong>${metrics.factoryTasks}</strong><small>не влияет на процент</small></article>
      </div>
      <div class="demo-layout demo-layout--wide">
        <article class="demo-panel">
          <div class="demo-panel__heading"><div><span class="demo-eyebrow">Контроль</span><h2>Проверки по плану</h2></div></div>
          <div class="demo-task-grid">${taskCards}</div>
        </article>
        <aside class="demo-panel">
          <span class="demo-eyebrow">BIM-контекст</span>
          <h2>Конструкции объекта</h2>
          <div class="demo-chip-list">${bimElements}</div>
          <p class="demo-note">Интерактивная IFC-модель не включена в публичную демонстрацию.</p>
        </aside>
      </div>
    </section>`;
}

function renderControlPlan(state: DemoState) {
  const rows = state.controlPlan
    .map(
      (task) => `
        <tr>
          <td><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.constructionMark)}</small></td>
          <td>${escapeHtml(MODULE_LABELS[task.module])}</td>
          <td>${
            task.inspectionStatus === "object"
              ? "Объектовый"
              : task.inspectionStatus === "factory"
                ? "Заводской"
                : "Не применяется"
          }</td>
          <td><span class="demo-status ${statusClass(task.status)}">${escapeHtml(STATUS_LABELS[task.status])}</span></td>
        </tr>`
    )
    .join("");

  return `
    <section class="demo-page" data-demo-screen="control-plan">
      <div class="demo-page__heading"><div><span class="demo-eyebrow">ITP</span><h1>План контроля</h1></div></div>
      <article class="demo-panel demo-table-wrap">
        <table class="demo-table">
          <thead><tr><th>Позиция</th><th>Модуль</th><th>Контроль</th><th>Статус</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </article>
    </section>`;
}

function renderInspectionForm(view: "reinforcement" | "geometry" | "strength", state: DemoState) {
  const config = {
    reinforcement: {
      title: "Проверка армирования",
      description: "Сравните проектный и фактический диаметр арматуры.",
      mark: "К-02",
      projectValue: 16,
      actualValue: 16,
      tolerance: 0,
      unit: "мм",
      projectLabel: "Проектный диаметр",
      actualLabel: "Фактический диаметр"
    },
    geometry: {
      title: "Геометрический контроль",
      description: "Зафиксируйте проектное и фактическое положение конструкции.",
      mark: "СТ-02",
      projectValue: 0,
      actualValue: 4,
      tolerance: 5,
      unit: "мм",
      projectLabel: "Проектное значение",
      actualLabel: "Фактическое отклонение"
    },
    strength: {
      title: "Контроль прочности",
      description: "Сравните требуемую и фактическую прочность бетона.",
      mark: "Б-01",
      projectValue: 30,
      actualValue: 32,
      tolerance: 0,
      unit: "МПа",
      projectLabel: "Требуемая прочность",
      actualLabel: "Фактическая прочность"
    }
  }[view];

  const recent = state.inspections
    .filter((inspection) => inspection.module === view)
    .slice(0, 6)
    .map(
      (inspection) => `
        <article class="demo-record">
          <div><span class="demo-eyebrow">${formatDate(inspection.createdAt)}</span><h3>${escapeHtml(inspection.title)}</h3><p>${escapeHtml(inspection.summary)}</p></div>
          <span class="demo-status ${statusClass(inspection.status)}">${escapeHtml(INSPECTION_STATUS_LABELS[inspection.status])}</span>
        </article>`
    )
    .join("");

  return `
    <section class="demo-page" data-demo-screen="${view}">
      <div class="demo-page__heading"><div><span class="demo-eyebrow">Проверки</span><h1>${config.title}</h1><p>${config.description}</p></div></div>
      <div class="demo-layout">
        <article class="demo-panel">
          <form class="demo-form" data-demo-form="inspection" data-demo-module="${view}">
            <label>Марка конструкции<input name="constructionMark" data-demo-field="mark" value="${config.mark}" required maxlength="24" /></label>
            <div class="demo-form__row">
              <label>${config.projectLabel}<input name="projectValue" type="number" step="0.1" value="${config.projectValue}" required /></label>
              <label>${config.actualLabel}<input name="actualValue" type="number" step="0.1" value="${config.actualValue}" required /></label>
            </div>
            <input name="tolerance" type="hidden" value="${config.tolerance}" />
            <input name="unit" type="hidden" value="${config.unit}" />
            <button class="demo-button demo-button--primary" type="submit" data-demo-submit="inspection">Проверить и сохранить</button>
          </form>
        </article>
        <aside class="demo-panel">
          <span class="demo-eyebrow">Сохранённые записи</span><h2>${config.title}</h2>
          <div class="demo-record-list">${recent || '<p class="demo-empty">Проверок пока нет.</p>'}</div>
        </aside>
      </div>
    </section>`;
}

function renderJournal(state: DemoState) {
  const entries = state.journal
    .map(
      (entry) => `
        <article class="demo-timeline__entry">
          <span class="demo-timeline__dot ${statusClass(entry.status)}"></span>
          <div><span class="demo-eyebrow">${formatDate(entry.createdAt)}</span><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.description)}</p></div>
          <span class="demo-status ${statusClass(entry.status)}">${escapeHtml(STATUS_LABELS[entry.status])}</span>
        </article>`
    )
    .join("");

  return `
    <section class="demo-page" data-demo-screen="journal">
      <div class="demo-page__heading"><div><span class="demo-eyebrow">История объекта</span><h1>Журнал</h1></div></div>
      <div class="demo-layout">
        <article class="demo-panel"><div class="demo-timeline">${entries}</div></article>
        <aside class="demo-panel">
          <span class="demo-eyebrow">Новое замечание</span><h2>Зафиксировать отклонение</h2>
          <form class="demo-form" data-demo-form="issue">
            <label>Заголовок<input name="title" value="Локальное отклонение" required maxlength="80" /></label>
            <label>Марка конструкции<input name="constructionMark" value="СТ-02" required maxlength="24" /></label>
            <label>Описание<textarea name="description" required maxlength="280">Требуется демонстрационное корректирующее действие.</textarea></label>
            <button class="demo-button demo-button--primary" type="submit" data-demo-submit="issue">Создать замечание</button>
          </form>
        </aside>
      </div>
    </section>`;
}

function renderIssues(state: DemoState) {
  const issues = state.issues
    .map(
      (issue) => `
        <article class="demo-issue ${statusClass(issue.status)}">
          <div>
            <span class="demo-eyebrow">${formatDate(issue.createdAt)} · ${escapeHtml(issue.constructionMark)}</span>
            <h3>${escapeHtml(issue.title)}</h3>
            <p>${escapeHtml(issue.description)}</p>
            ${issue.repeatControlAt ? `<small>Повторный контроль: ${formatDate(issue.repeatControlAt)}</small>` : ""}
          </div>
          <div class="demo-issue__actions">
            <span class="demo-status ${statusClass(issue.status)}">${escapeHtml(ISSUE_STATUS_LABELS[issue.status])}</span>
            ${
              issue.status === "open"
                ? `<button class="demo-button demo-button--compact" type="button" data-demo-repeat-control="${escapeHtml(issue.id)}">Провести повторный контроль</button>`
                : ""
            }
          </div>
        </article>`
    )
    .join("");

  return `
    <section class="demo-page" data-demo-screen="issues">
      <div class="demo-page__heading"><div><span class="demo-eyebrow">Корректирующие действия</span><h1>Замечания и повторный контроль</h1></div></div>
      <article class="demo-panel"><div class="demo-issue-list">${issues}</div></article>
    </section>`;
}

function renderSummary(state: DemoState, metrics: ReturnType<DemoService["getMetrics"]>) {
  const compliant = state.inspections.filter((record) => record.status === "done").length;
  const deviation = state.inspections.filter((record) => record.status === "deviation").length;

  return `
    <section class="demo-page" data-demo-screen="summary">
      <div class="demo-page__heading"><div><span class="demo-eyebrow">Итоговая сводка</span><h1>Готовность объекта</h1></div></div>
      <article class="demo-summary-hero">
        <div><strong>${metrics.percent}%</strong><span>готовность по обязательным позициям контроля</span></div>
        <div class="demo-summary-hero__status ${metrics.openIssues ? "is-danger" : "is-success"}">${metrics.openIssues ? "Требуются корректирующие действия" : "Объект готов к итоговой проверке"}</div>
      </article>
      <div class="demo-metric-grid">
        <article><span>Выполнено по плану</span><strong>${metrics.completed} / ${metrics.total}</strong><small>объектовых задач</small></article>
        <article><span>В норме</span><strong>${compliant}</strong><small>сохранённых проверок</small></article>
        <article><span>С отклонением</span><strong>${deviation}</strong><small>сохранённых проверок</small></article>
        <article><span>Открытые замечания</span><strong>${metrics.openIssues}</strong><small>требуют повторного контроля</small></article>
      </div>
      <article class="demo-panel">
        <span class="demo-eyebrow">Ограничение демонстрации</span>
        <h2>Локальная интерактивная сессия</h2>
        <p>Итог отражает только синтетические данные этого браузера. Серверная подпись, отправка документов и административное согласование отключены.</p>
      </article>
    </section>`;
}

function renderView(view: DemoView, state: DemoState, service: DemoService) {
  const metrics = service.getMetrics();
  switch (view) {
    case "control-plan": return renderControlPlan(state);
    case "reinforcement": return renderInspectionForm(view, state);
    case "geometry": return renderInspectionForm(view, state);
    case "strength": return renderInspectionForm(view, state);
    case "journal": return renderJournal(state);
    case "issues": return renderIssues(state);
    case "summary": return renderSummary(state, metrics);
    default: return renderOverview(state, metrics);
  }
}

export function mountDemoUi({ root, service }: DemoUiOptions) {
  let currentView: DemoView = "overview";
  let toastMessage = "";
  let resetPending = false;

  const notify = (message: string) => {
    toastMessage = message;
    render();
  };

  const render = () => {
    const state = service.getState();
    root.innerHTML = `
      <div class="demo-app">
        <header class="demo-header">
          <a class="demo-brand" href="./demo.html" aria-label="Tehnadzor demo"><span class="demo-brand__mark">T</span><span>Tehnadzor</span></a>
          <div class="demo-header__actions">
            <a class="demo-button" href="https://github.com/valiibragimov/tehnadzor-showcase" target="_blank" rel="noreferrer">О проекте</a>
            <button class="demo-button" type="button" data-demo-unavailable="profile">Профиль</button>
          </div>
        </header>
        <section class="demo-banner" aria-label="Демонстрационный режим">
          <div><strong>Демонстрационный режим</strong><span>Используются только синтетические данные. Изменения сохраняются локально в этом браузере.</span></div>
          <button class="demo-button demo-button--danger" type="button" data-demo-reset>Сбросить демо</button>
        </section>
        <section class="demo-project-bar">
          <div><span>Объект</span><strong>${escapeHtml(state.project.name)}</strong></div>
          <div><span>Организация</span><strong>${escapeHtml(state.project.organization)}</strong></div>
          <div><span>Тип</span><strong>${escapeHtml(state.project.structureType)}</strong></div>
          <button class="demo-button" type="button" data-demo-unavailable="cloud-upload">Загрузить IFC</button>
        </section>
        <nav class="demo-nav" aria-label="Разделы демонстрации">${renderNavigation(currentView)}</nav>
        <main class="demo-main">${renderView(currentView, state, service)}</main>
        <footer class="demo-footer">
          <span>Tehnadzor · локальная демонстрация</span>
          <div>
            <button type="button" data-demo-unavailable="users">Управление пользователями</button>
            <button type="button" data-demo-unavailable="integration">Интеграции</button>
          </div>
        </footer>
        <div class="demo-toast ${toastMessage ? "is-visible" : ""}" role="status">${escapeHtml(toastMessage)}</div>
        ${resetPending ? `
          <div class="demo-modal-backdrop">
            <section class="demo-modal" role="dialog" aria-modal="true" aria-labelledby="demoResetTitle">
              <span class="demo-eyebrow">Подтверждение</span>
              <h2 id="demoResetTitle">Сбросить демонстрационные данные?</h2>
              <p>Будут удалены только локальные изменения в namespace демонстрации. Другие данные браузера останутся без изменений.</p>
              <div class="demo-modal__actions">
                <button class="demo-button" type="button" data-demo-reset-cancel>Отмена</button>
                <button class="demo-button demo-button--danger" type="button" data-demo-reset-confirm>Сбросить демо</button>
              </div>
            </section>
          </div>` : ""}
      </div>`;

    bindInteractions();
  };

  const bindInteractions = () => {
    root.querySelectorAll<HTMLButtonElement>("[data-demo-nav]").forEach((button) => {
      button.addEventListener("click", () => {
        currentView = button.dataset.demoNav as DemoView;
        toastMessage = "";
        render();
      });
    });

    root.querySelector<HTMLButtonElement>("[data-demo-reset]")?.addEventListener("click", () => {
      resetPending = true;
      render();
    });

    root.querySelector<HTMLButtonElement>("[data-demo-reset-cancel]")?.addEventListener("click", () => {
      resetPending = false;
      render();
    });

    root.querySelector<HTMLButtonElement>("[data-demo-reset-confirm]")?.addEventListener("click", () => {
      service.reset();
      currentView = "overview";
      resetPending = false;
      notify("Исходные демонстрационные данные восстановлены.");
    });

    root.querySelectorAll<HTMLButtonElement>("[data-demo-unavailable]").forEach((button) => {
      button.addEventListener("click", () => notify("Функция недоступна в демонстрационном режиме"));
    });

    const inspectionForm = root.querySelector<HTMLFormElement>("[data-demo-form='inspection']");
    inspectionForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(inspectionForm);
      const module = inspectionForm.dataset.demoModule as "reinforcement" | "geometry" | "strength";
      service.createInspection({
        module,
        constructionMark: String(data.get("constructionMark") || "").trim(),
        projectValue: Number(data.get("projectValue")),
        actualValue: Number(data.get("actualValue")),
        tolerance: Number(data.get("tolerance") || 0),
        unit: String(data.get("unit") || "")
      });
      notify("Проверка сохранена локально.");
    });

    const issueForm = root.querySelector<HTMLFormElement>("[data-demo-form='issue']");
    issueForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(issueForm);
      service.createIssue({
        title: String(data.get("title") || "").trim(),
        constructionMark: String(data.get("constructionMark") || "").trim(),
        description: String(data.get("description") || "").trim()
      });
      notify("Замечание добавлено в локальный журнал.");
    });

    root.querySelectorAll<HTMLButtonElement>("[data-demo-repeat-control]").forEach((button) => {
      button.addEventListener("click", () => {
        service.resolveIssueWithRepeatControl(String(button.dataset.demoRepeatControl || ""));
        notify("Повторный контроль выполнен, замечание закрыто.");
      });
    });
  };

  render();
}
