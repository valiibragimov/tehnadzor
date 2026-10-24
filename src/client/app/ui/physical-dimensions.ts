import { t } from "../../shared/i18n/index.js";
import type { PhysicalDimensions } from "../../features/inspections/geometry/dimensions.js";

export function mountPhysicalDimensions(root: HTMLElement, values: PhysicalDimensions, keys: string[]) {
  const group = document.createElement("fieldset");
  group.dataset.physicalDimensions = "";
  const title = document.createElement("legend");
  title.dataset.i18n = "physical_dimensions";
  title.textContent = t("physical_dimensions");
  group.append(title);
  for (const key of keys) {
    values[key] ||= { project: "", actual: "" };
    const pair = document.createElement("div");
    pair.className = "grid-2";
    for (const side of ["project", "actual"] as const) {
      const label = document.createElement("label");
      const text = document.createElement("span");
      text.textContent = `${t("dimension_" + key)} — ${t(side === "project" ? "dimension_design" : "dimension_actual")} (${t("form_mm")})`;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "any";
      input.value = String(values[key][side] ?? "");
      input.dataset.dimension = key;
      input.dataset.side = side;
      input.addEventListener("input", () => { values[key][side] = input.value; });
      label.append(text, input);
      pair.append(label);
    }
    group.append(pair);
  }
  group.hidden = keys.length === 0;
  root.append(group);
}
