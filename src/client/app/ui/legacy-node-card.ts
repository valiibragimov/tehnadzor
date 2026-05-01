import { escapeHtml } from "../../utils.js";

export interface LegacyNodeCardInteractionOptions {
  onOpen?: () => void;
  onDelete?: () => Promise<void> | void;
}

export function buildLegacyNodeDeleteIconButton(titleText = "Удалить проверку") {
  const safeTitle = escapeHtml(titleText == null ? "" : String(titleText));
  return `
    <button type="button" class="node-delete-icon" data-act="del" title="${safeTitle}" aria-label="${safeTitle}">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    </button>
  `;
}

export function setupLegacyNodeCardInteractions(
  row: HTMLDivElement,
  { onOpen, onDelete }: LegacyNodeCardInteractionOptions = {}
) {
  row.classList.add("node-card-compact");
  row.setAttribute("role", "button");
  row.tabIndex = 0;

  if (typeof onOpen === "function") {
    row.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-act="del"]')) return;
      onOpen();
    });

    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target;
      if (target instanceof Element && target.closest('[data-act="del"]')) return;
      event.preventDefault();
      onOpen();
    });
  }

  const deleteBtn = row.querySelector('[data-act="del"]');
  if (deleteBtn && typeof onDelete === "function") {
    deleteBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await onDelete();
    });
  }
}
