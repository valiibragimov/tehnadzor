import type { AcceptanceCriteria } from "../../features/inspections/acceptance.js";
import { measurementNumber } from "../../features/inspections/acceptance.js";
import { t } from "../../shared/i18n/index.js";

export function mountAcceptanceCriteria(root: HTMLElement, keys: Array<{ key: string; label: string }>) {
  if (root.querySelector("[data-acceptance]")) return;
  const panel = document.createElement("details");
  panel.className = "card";
  panel.dataset.acceptance = "";
  const summary = document.createElement("summary");
  summary.dataset.i18n = "assessment_limits";
  summary.textContent = t("assessment_limits");
  panel.append(summary);
  const label = document.createElement("label");
  const caption = document.createElement("span");
  caption.dataset.i18n = "assessment_reference";
  caption.textContent = t("assessment_reference");
  label.append(caption);
  const reference = document.createElement("textarea");
  reference.dataset.reference = "";
  reference.maxLength = 1000;
  label.append(reference);
  panel.append(label);
  for (const { key, label: title } of keys) {
    const group = document.createElement("fieldset");
    group.dataset.limit = key;
    const legend = document.createElement("legend");
    const labelKeys = { dimensions: "physical_dimensions", section: "dimension_section", thickness: "dimension_thickness", vertical: "form_vertical_deviation_mm", flatness: "form_measured_flatness_deviation_mm", geoFlatness: "form_measured_flatness_deviation_mm", opening: "dimension_opening", step: "dimension_step", cover: "form_design_concrete_cover", hoopsStep: "form_design_stirrup_spacing" };
    if (labelKeys[key]) legend.dataset.i18n = labelKeys[key];
    legend.textContent = title;
    group.append(legend);
    for (const bound of ["min", "max"]) {
      const caption = document.createElement("label");
      const text = document.createElement("span");
      text.dataset.i18n = bound === "min" ? "assessment_min" : "assessment_max";
      text.textContent = t(text.dataset.i18n);
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.dataset.bound = bound;
      caption.append(text, input);
      group.append(caption);
    }
    panel.append(group);
  }
  const confirmation = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.confirmed = "";
  const text = document.createElement("span");
  text.dataset.i18n = "assessment_confirmed";
  text.textContent = t("assessment_confirmed");
  confirmation.append(checkbox, text);
  panel.append(confirmation);
  // Changing the basis/limits invalidates the explicit confirmation.
  panel.addEventListener("input", event => { if (event.target !== checkbox) checkbox.checked = false; });
  root.prepend(panel);
}

export function readAcceptanceCriteria(root: ParentNode | null): AcceptanceCriteria {
  const panel = root?.querySelector("[data-acceptance]");
  const limits: AcceptanceCriteria["limits"] = {};
  panel?.querySelectorAll<HTMLElement>("[data-limit]").forEach(group => {
    limits[group.dataset.limit!] = {
      min: measurementNumber(group.querySelector<HTMLInputElement>('[data-bound="min"]')?.value),
      max: measurementNumber(group.querySelector<HTMLInputElement>('[data-bound="max"]')?.value)
    };
  });
  return { reference: panel?.querySelector<HTMLTextAreaElement>("[data-reference]")?.value.trim() || "",
    confirmed: panel?.querySelector<HTMLInputElement>("[data-confirmed]")?.checked === true, limits };
}

export function restoreAcceptanceCriteria(root: ParentNode | null, criteria?: AcceptanceCriteria | null) {
  const panel = root?.querySelector("[data-acceptance]");
  const reference = panel?.querySelector<HTMLTextAreaElement>("[data-reference]");
  if (reference) reference.value = criteria?.reference || "";
  const confirmed = panel?.querySelector<HTMLInputElement>("[data-confirmed]");
  if (confirmed) confirmed.checked = criteria?.confirmed === true;
  panel?.querySelectorAll<HTMLElement>("[data-limit]").forEach(group => {
    for (const bound of ["min", "max"] as const) {
      const input = group.querySelector<HTMLInputElement>(`[data-bound="${bound}"]`);
      if (input) input.value = String(criteria?.limits[group.dataset.limit!]?.[bound] ?? "");
    }
  });
}
