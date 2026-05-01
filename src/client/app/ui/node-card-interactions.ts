import { escapeHtml } from "../../utils.js";

interface NodeCardInteractionOptions {
  onOpen?: () => void;
  onDelete?: () => Promise<void> | void;
}

const safeValue = (value: unknown) => escapeHtml(value == null ? "" : String(value));

function isDeleteActionTarget(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('[data-act="del"]');
}

export function buildNodeDeleteIconButton(titleText = "Удалить проверку") {
  const safeTitle = safeValue(titleText);
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

export function setupNodeCardInteractions(
  row: Element | null,
  { onOpen, onDelete }: NodeCardInteractionOptions = {}
) {
  if (!(row instanceof HTMLElement)) return;

  row.classList.add("node-card-compact");
  row.setAttribute("role", "button");
  row.tabIndex = 0;

  if (typeof onOpen === "function") {
    row.addEventListener("click", (event) => {
      if (isDeleteActionTarget(event.target)) return;
      onOpen();
    });

    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (isDeleteActionTarget(event.target)) return;
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
