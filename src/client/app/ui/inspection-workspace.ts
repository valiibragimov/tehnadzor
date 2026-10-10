import { t } from "../../shared/i18n/index.js";

/** Shared by production and demo. Dialog focus, modality and Escape belong to the browser. */
export function initInspectionWorkspace() {
  const mobile = matchMedia("(max-width: 768px)");
  const sheets = [...document.querySelectorAll<HTMLDialogElement>("dialog.wizard-sheet")];
  const setStep = (wizard: HTMLElement, step: number) => {
    const steps = [...wizard.querySelectorAll<HTMLElement>("[data-step]")];
    const current = Math.max(1, Math.min(step, steps.length));
    wizard.dataset.currentStep = String(current);
    for (const panel of steps) panel.classList.toggle("is-active", Number(panel.dataset.step) === current);
    wizard.querySelectorAll<HTMLElement>("[data-wizard-step]").forEach(button => {
      const active = Number(button.dataset.wizardStep) === current;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    const progress = wizard.querySelector<HTMLElement>("[data-wizard-progress]");
    if (progress) progress.textContent = t("wizardProgress", { current, total: steps.length });
  };
  const syncSheets = () => {
    for (const sheet of sheets) {
      sheet.close();
      sheet.classList.remove("is-open");
      if (!mobile.matches) sheet.open = true;
    }
  };
  for (const sheet of sheets) {
    sheet.addEventListener("close", () => sheet.classList.remove("is-open"));
    sheet.addEventListener("click", event => { if (event.target === sheet && mobile.matches) sheet.close(); });
  }
  document.querySelectorAll<HTMLElement>("[data-wizard]").forEach(wizard => setStep(wizard, 1));
  document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>("[data-wizard-step], [data-sheet-target], [data-sheet-close], [data-trigger]");
    if (control?.dataset.wizardStep) {
      const wizard = control.closest<HTMLElement>("[data-wizard]");
      if (wizard) setStep(wizard, Number(control.dataset.wizardStep));
    } else if (control?.dataset.sheetTarget && mobile.matches) {
      const sheet = document.getElementById(control.dataset.sheetTarget);
      if (sheet instanceof HTMLDialogElement && !sheet.open) { sheet.classList.add("is-open"); sheet.showModal(); }
    } else if (control?.hasAttribute("data-sheet-close") && mobile.matches) {
      control.closest<HTMLDialogElement>("dialog")?.close();
    } else if (control?.dataset.trigger) {
      document.querySelector<HTMLButtonElement>(control.dataset.trigger)?.click();
    }
  });
  document.addEventListener("app:tab-activated", event => {
    const target = (event as CustomEvent<{ target: string }>).detail?.target;
    const wizard = target ? document.getElementById(target)?.querySelector<HTMLElement>("[data-wizard]") : null;
    if (wizard) setStep(wizard, 1);
    if (mobile.matches) for (const sheet of sheets) sheet.close();
  });
  document.addEventListener("app:language-changed", () => {
    document.querySelectorAll<HTMLElement>("[data-wizard]").forEach(wizard => setStep(wizard, Number(wizard.dataset.currentStep || 1)));
  });
  mobile.addEventListener("change", syncSheets);
  syncSheets();
  initHelpPopover();
}

function initHelpPopover() {
  const popover = document.createElement("div");
  popover.className = "help-popover";
  popover.id = "workspaceHelp";
  popover.popover = "auto";
  popover.setAttribute("role", "note");
  document.body.append(popover);
  let source: HTMLElement | null = null;
  popover.addEventListener("toggle", () => {
    if (!popover.matches(":popover-open") && source) { source.setAttribute("aria-expanded", "false"); source = null; }
  });
  document.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>(".module-help-toggle[data-help-target]") : null;
    if (!button) return;
    const content = document.getElementById(button.dataset.helpTarget || "");
    if (!content) return;
    if (source === button && popover.matches(":popover-open")) { popover.hidePopover(); return; }
    if (source) source.setAttribute("aria-expanded", "false");
    source = button;
    popover.replaceChildren(...[...content.childNodes].map(node => node.cloneNode(true)));
    button.setAttribute("aria-controls", popover.id);
    button.setAttribute("aria-expanded", "true");
    popover.showPopover();
  });
}
