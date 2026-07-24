import type { IfcRequirementSummary } from "../../types/domain.js";
import { setGlobalScrollLock } from "../../utils.js";

function createCheckRow(summary: IfcRequirementSummary, checkIndex: number) {
  const check = summary.checks[checkIndex];
  const row = document.createElement("article");
  row.className = `ifc-check-row ${check.passed ? "is-passed" : check.severity === "error" ? "is-error" : "is-warning"}`;

  const icon = document.createElement("span");
  icon.className = "ifc-check-row__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = check.passed ? "✓" : check.severity === "error" ? "×" : "!";

  const body = document.createElement("div");
  body.className = "ifc-check-row__body";

  const heading = document.createElement("div");
  heading.className = "ifc-check-row__heading";

  const title = document.createElement("strong");
  title.textContent = check.label;

  const counter = document.createElement("span");
  counter.textContent = check.totalCount > 1
    ? `${check.passedCount} из ${check.totalCount}`
    : check.passed
      ? "пройдено"
      : "не пройдено";

  heading.append(title, counter);

  const description = document.createElement("p");
  description.textContent = check.description;
  body.append(heading, description);

  if (!check.passed && check.sampleElementIds.length > 0) {
    const samples = document.createElement("small");
    samples.textContent = `Примеры: ${check.sampleElementIds.join(", ")}`;
    body.append(samples);
  }

  row.append(icon, body);
  return row;
}

export function showIfcRequirementsDialog(summary: IfcRequirementSummary) {
  return new Promise<boolean>((resolve) => {
    setGlobalScrollLock(true);

    const modal = document.createElement("div");
    modal.className = "modal ifc-check-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "ifcCheckTitle");
    modal.innerHTML = `
      <section class="modal-content ifc-check-modal__content">
        <header class="ifc-check-modal__header">
          <div>
            <div class="ifc-check-modal__eyebrow">До импорта на сайт</div>
            <h3 id="ifcCheckTitle">Проверка требований IFC</h3>
          </div>
          <span class="ifc-check-modal__status"></span>
        </header>
        <div class="ifc-check-modal__metrics">
          <div><strong data-ifc-check-score></strong><span>заполнение атрибутов</span></div>
          <div><strong data-ifc-check-elements></strong><span>элементов без замечаний</span></div>
          <div><strong data-ifc-check-schema></strong><span>схема модели</span></div>
        </div>
        <div class="ifc-check-modal__notice"></div>
        <div class="ifc-check-modal__list"></div>
        <footer class="ifc-check-modal__footer">
          <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill" data-ifc-check-cancel>
            <span class="lg-btn__label"></span>
            <span class="lg-btn__glow" aria-hidden="true"></span>
          </button>
          <button type="button" class="btn-small btn-primary lg-btn lg-btn--pill ifc-check-modal__import" data-ifc-check-import>
            <span class="lg-btn__label">Импортировать модель</span>
            <span class="lg-btn__glow" aria-hidden="true"></span>
          </button>
        </footer>
      </section>
    `;

    const status = modal.querySelector<HTMLElement>(".ifc-check-modal__status");
    const score = modal.querySelector<HTMLElement>("[data-ifc-check-score]");
    const elements = modal.querySelector<HTMLElement>("[data-ifc-check-elements]");
    const schema = modal.querySelector<HTMLElement>("[data-ifc-check-schema]");
    const notice = modal.querySelector<HTMLElement>(".ifc-check-modal__notice");
    const list = modal.querySelector<HTMLElement>(".ifc-check-modal__list");
    const cancelButton = modal.querySelector<HTMLButtonElement>("[data-ifc-check-cancel]");
    const importButton = modal.querySelector<HTMLButtonElement>("[data-ifc-check-import]");
    const cancelLabel = cancelButton?.querySelector<HTMLElement>(".lg-btn__label");

    if (status) {
      status.dataset.status = summary.status;
      status.textContent =
        summary.status === "passed" ? "Готово" : summary.status === "warning" ? "Есть замечания" : "Импорт заблокирован";
    }
    if (score) score.textContent = `${summary.score}%`;
    if (elements) elements.textContent = `${summary.conformingElements} / ${summary.totalElements}`;
    if (schema) schema.textContent = summary.schema || "не указана";
    if (notice) {
      notice.dataset.status = summary.status;
      notice.textContent =
        summary.status === "passed"
          ? "Все обязательные проверки пройдены. Модель готова к импорту."
          : summary.status === "warning"
            ? "Модель можно импортировать, но замечания останутся в данных. Рекомендуется исправить их в авторской BIM-программе."
            : "Критические проверки не пройдены. Исправьте IFC-файл и выберите его повторно.";
    }
    summary.checks.forEach((_, index) => list?.append(createCheckRow(summary, index)));

    if (cancelLabel) cancelLabel.textContent = summary.canImport ? "Отмена" : "Закрыть";
    if (importButton) importButton.hidden = !summary.canImport;

    document.body.appendChild(modal);
    let closed = false;

    const close = (approved: boolean) => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", handleKeyDown, true);
      modal.remove();
      setGlobalScrollLock(false);
      resolve(approved);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(false);
    };

    cancelButton?.addEventListener("click", () => close(false));
    importButton?.addEventListener("click", () => close(true));
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close(false);
    });
    document.addEventListener("keydown", handleKeyDown, true);
    window.requestAnimationFrame(() => {
      (summary.canImport ? importButton : cancelButton)?.focus();
    });
  });
}
