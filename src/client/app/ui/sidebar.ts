import { t } from "../../shared/i18n/index.js";

const STORAGE_KEY = "workspace_sidebar_v1";
const COLLAPSED = 64;
const MIN = 208;
const MAX = 360;
const DEFAULT = 240;
const SNAP = 144;

/** Presentation preference only; keyboard behavior follows the WAI-ARIA Window Splitter pattern. */
export function initSidebar() {
  const sidebar = document.getElementById("workspaceSidebar");
  const toggle = document.getElementById("sidebarToggle");
  if (!sidebar || !toggle) return;
  const desktop = matchMedia("(min-width: 769px)");
  const handles = [...sidebar.querySelectorAll<HTMLElement>(".sidebar-resize")];
  const tooltip = document.createElement("div");
  tooltip.className = "sidebar-tooltip";
  tooltip.id = "sidebarTooltip";
  tooltip.role = "tooltip";
  tooltip.hidden = true;
  document.body.append(tooltip);
  let width = DEFAULT;
  let collapsed = false;
  let tooltipSource: HTMLElement | null = null;
  let tooltipTimer: ReturnType<typeof setTimeout> | undefined;
  let drag: { handle: HTMLElement; pointerId: number; x: number; width: number; savedWidth: number; collapsed: boolean } | null = null;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && Number.isFinite(saved.width)) width = Math.max(MIN, Math.min(MAX, saved.width));
    collapsed = saved?.collapsed === true;
  } catch { /* Preferences are optional, including in private browsing. */ }

  const hideTooltip = () => {
    clearTimeout(tooltipTimer);
    tooltip.hidden = true;
    tooltipSource?.removeAttribute("aria-describedby");
    tooltipSource = null;
  };
  const render = () => {
    const current = collapsed ? COLLAPSED : width;
    document.body.style.setProperty("--sidebar-width", `${current}px`);
    sidebar.dataset.collapsed = String(collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", t(collapsed ? "expandSidebar" : "collapseSidebar"));
    for (const handle of handles) {
      handle.tabIndex = desktop.matches ? 0 : -1;
      handle.setAttribute("aria-valuenow", String(current));
      handle.setAttribute("aria-valuetext", collapsed ? t("sidebarCollapsed") : t("sidebarWidth", { width }));
    }
  };
  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ width, collapsed })); } catch { /* Optional. */ }
  };
  const toggleSidebar = () => {
    collapsed = !collapsed;
    hideTooltip();
    render();
    save();
  };
  const resize = (next: number) => {
    collapsed = next < SNAP;
    if (collapsed && drag) width = drag.savedWidth;
    else if (!collapsed) width = Math.round(Math.max(MIN, Math.min(MAX, next)));
    hideTooltip();
    render();
  };
  const finishDrag = (cancel = false) => {
    if (!drag) return;
    const previous = drag;
    drag = null;
    if (cancel) { width = previous.savedWidth; collapsed = previous.collapsed; }
    if (previous.handle.hasPointerCapture(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId);
    document.body.classList.remove("is-sidebar-resizing");
    render();
    if (!cancel) save();
  };
  for (const handle of handles) {
    handle.addEventListener("pointerdown", event => {
      if (!desktop.matches || event.button !== 0 || drag) return;
      event.preventDefault();
      handle.focus();
      drag = { handle, pointerId: event.pointerId, x: event.clientX, width: collapsed ? COLLAPSED : width, savedWidth: width, collapsed };
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add("is-sidebar-resizing");
      hideTooltip();
    });
    handle.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const direction = handle.dataset.edge === "left" ? -1 : 1;
      resize(drag.width + (event.clientX - drag.x) * direction);
    });
    handle.addEventListener("pointerup", () => finishDrag());
    handle.addEventListener("pointercancel", () => finishDrag(true));
    handle.addEventListener("lostpointercapture", () => finishDrag());
    handle.addEventListener("dblclick", toggleSidebar);
    handle.addEventListener("keydown", event => {
      const current = collapsed ? COLLAPSED : width;
      if (event.key === "Enter") toggleSidebar();
      else if (event.key === "Home") { collapsed = true; render(); save(); }
      else if (event.key === "End") { resize(MAX); save(); }
      else if (event.key === "ArrowLeft") { resize(current <= MIN ? COLLAPSED : current - 16); save(); }
      else if (event.key === "ArrowRight") { resize(collapsed ? MIN : current + 16); save(); }
      else return;
      event.preventDefault();
    });
  }
  toggle.addEventListener("click", toggleSidebar);
  sidebar.querySelectorAll<HTMLElement>(".tab, .sidebar-link, #sidebarToggle").forEach(control => {
    const showTooltip = () => {
      hideTooltip();
      if (!collapsed || !desktop.matches || drag) return;
      tooltipSource = control;
      tooltip.textContent = control.getAttribute("aria-label") || control.querySelector("[data-i18n]")?.textContent || control.textContent;
      tooltip.hidden = false;
      const rect = control.getBoundingClientRect();
      tooltip.style.left = `${sidebar.getBoundingClientRect().right + 10}px`;
      tooltip.style.top = `${Math.max(8, Math.min(innerHeight - tooltip.offsetHeight - 8, rect.top + (rect.height - tooltip.offsetHeight) / 2))}px`;
      control.setAttribute("aria-describedby", tooltip.id);
    };
    const scheduleHide = () => { tooltipTimer = setTimeout(hideTooltip, 120); };
    control.addEventListener("pointerenter", showTooltip);
    control.addEventListener("focus", showTooltip);
    control.addEventListener("pointerleave", scheduleHide);
    control.addEventListener("blur", hideTooltip);
    control.addEventListener("click", hideTooltip);
  });
  tooltip.addEventListener("pointerenter", () => clearTimeout(tooltipTimer));
  tooltip.addEventListener("pointerleave", hideTooltip);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") { hideTooltip(); finishDrag(true); }
  });
  sidebar.querySelector(".sidebar-scroll")?.addEventListener("scroll", hideTooltip);
  window.addEventListener("resize", hideTooltip);
  window.addEventListener("blur", () => finishDrag(true));
  desktop.addEventListener("change", () => { finishDrag(true); hideTooltip(); render(); });
  document.addEventListener("app:language-changed", () => { hideTooltip(); render(); });
  document.addEventListener("app:tab-activated", hideTooltip);
  render();
}
