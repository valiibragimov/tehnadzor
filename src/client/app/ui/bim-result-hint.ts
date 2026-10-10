import { t } from "../../shared/i18n/index.js";
/** Native selects stay bounded; filters still search the complete engineering catalog. */
export function setBimResultHint(select: HTMLElement, count: number) {
  const id = `${select.id}Results`;
  let hint = select.ownerDocument.getElementById(id);
  if (!hint) {
    hint = select.ownerDocument.createElement("p"); hint.id = id;
    hint.className = "bim-results-hint"; hint.setAttribute("role", "status");
    select.after(hint);
    select.setAttribute("aria-describedby", [select.getAttribute("aria-describedby"), id].filter(Boolean).join(" "));
  }
  hint.hidden = count <= 100;
  hint.textContent = count > 100 ? t("bimResultLimit", { count, shown: 100 }) : "";
}
