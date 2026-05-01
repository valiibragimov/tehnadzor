import { getConstructionModuleBehavior, getConstructionProfile } from "../construction.js";

function formatNodeValue(value, unit = "") {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "number" ? value : parseFloat(value);
  if (Number.isNaN(num)) return "—";
  const rounded = Math.round(num * 10) / 10;
  const formatted = rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);
  return formatted + (unit ? ` ${unit}` : "");
}

interface GeoNodeRecord extends Record<string, unknown> {
  type?: string;
  constructionType?: string;
  construction?: string;
  floor?: string;
  location?: string;
  axisLetterFrom?: string;
  axisLetterTo?: string;
  axisNumberFrom?: string | number;
  axisNumberTo?: string | number;
  letter?: string;
  number?: string | number;
  columnMark?: string;
  columns?: Array<Record<string, unknown>>;
  walls?: Array<Record<string, unknown>>;
  beams?: Array<Record<string, unknown>>;
}

function formatGeoNodeDisplay(node, fallbackKey, safeValue = (value) => value) {
  const constructionProfile = getConstructionProfile(node?.construction || node?.constructionType || "", "geo");
  const geoBehavior = getConstructionModuleBehavior(
    node?.construction || node?.constructionType || "",
    "geo",
    node?.constructionSubtype || ""
  );
  const floorPart = geoBehavior.floorVisible !== false && node?.floor ? `Этаж ${safeValue(node.floor)}, ` : "";

  if (
    constructionProfile === "plate" &&
    (node?.location || (node?.axisLetterFrom && node?.axisLetterTo && node?.axisNumberFrom && node?.axisNumberTo))
  ) {
    const location = node.location || `${node.axisLetterFrom}-${node.axisLetterTo}, ${node.axisNumberFrom}-${node.axisNumberTo}`;
    return `${floorPart}${safeValue(location)}`;
  }

  if (node?.letter && node?.number) {
    return `${floorPart}${safeValue(node.letter)} × ${safeValue(node.number)}`;
  }

  const parts = String(fallbackKey || "").split("-");
  if (parts.length === 3) {
    return `Этаж ${safeValue(parts[0])}, ${safeValue(parts[1])} × ${safeValue(parts[2])}`;
  }
  if (parts.length === 2) {
    return `${safeValue(parts[0])} × ${safeValue(parts[1])}`;
  }
  return safeValue(fallbackKey);
}

function buildNodeDeleteIconButton(titleText = "Удалить узел", safeValue = (value) => value) {
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

interface NodeCardInteractionOptions {
  onOpen?: () => void;
  onDelete?: (button: HTMLElement) => Promise<void> | void;
}

function setupNodeCardInteractions(row, { onOpen, onDelete }: NodeCardInteractionOptions = {}) {
  if (!row) return;

  row.classList.add("node-card-compact");
  row.setAttribute("role", "button");
  row.tabIndex = 0;

  if (typeof onOpen === "function") {
    row.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest('[data-act="del"]')) return;
      onOpen();
    });

    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target instanceof Element && event.target.closest('[data-act="del"]')) return;
      event.preventDefault();
      onOpen();
    });
  }

  const deleteBtn = row.querySelector('[data-act="del"]');
  if (deleteBtn instanceof HTMLElement && typeof onDelete === "function") {
    deleteBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await onDelete(deleteBtn);
    });
  }
}

export function saveGeoNodesToStorage({ nodes, storage = localStorage, storageKey }) {
  const payload = Array.from(nodes.entries());
  storage.setItem(storageKey, JSON.stringify(payload));
}

export async function loadGeoNodesForProjectData({
  projectId,
  nodes,
  renderNodes,
  saveNodes,
  getProjectCollectionSnapshot
}) {
  nodes.clear();
  renderNodes();

  if (!projectId || projectId.trim() === "") return;

  try {
    const snap = await getProjectCollectionSnapshot(projectId, "geoNodes");
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.deleted) return;
      nodes.set(docSnap.id, data);
    });
    renderNodes();
    saveNodes();
  } catch (e) {
    console.error("Ошибка загрузки узлов проекта:", e);
  }
}

export async function saveGeoNodeToProject({
  projectId,
  nodeId,
  data,
  setProjectCollectionDoc,
  upsertGeoInspectionDualWrite
}) {
  await setProjectCollectionDoc(projectId, "geoNodes", nodeId, data);
  try {
    await upsertGeoInspectionDualWrite(projectId, nodeId, data);
  } catch (dualWriteError) {
    console.warn("[DualWrite][geo] inspections upsert failed:", dualWriteError);
  }
}

export async function deleteGeoNodeFromProject({
  projectId,
  nodeId,
  setProjectCollectionDoc,
  deleteGeoInspectionDualWrite
}) {
  await setProjectCollectionDoc(projectId, "geoNodes", nodeId, { deleted: true }, { merge: true });
  await deleteGeoInspectionDualWrite(projectId, nodeId);
}

export async function clearGeoNodesForProjectData({
  projectId,
  clearProjectCollection,
  clearGeoInspectionDualWrite,
  nodes,
  saveNodes,
  renderNodes,
  resetCurrentNodeKeys
}) {
  const deletedCount = await clearProjectCollection(projectId, "geoNodes");
  const deletedDualWriteCount = await clearGeoInspectionDualWrite(projectId);

  nodes.clear();
  saveNodes();
  renderNodes();
  if (typeof resetCurrentNodeKeys === "function") {
    resetCurrentNodeKeys();
  }

  return { deletedCount, deletedDualWriteCount };
}

export function renderGeoNodesList({
  nodes,
  listElement,
  safeValue,
  evaluateGeoColumnNode,
  evaluateGeoNode,
  evaluateGeoWallNode,
  evaluateGeoBeamNode,
  loadNode,
  onDeleteNode
}) {
  if (!listElement) return;

  listElement.innerHTML = "";
  const typedNodes = nodes as Map<string, GeoNodeRecord>;
  const keys = Array.from(typedNodes.keys()).sort((a, b) => {
    const na = typedNodes.get(a);
    const nb = typedNodes.get(b);
    if (na?.type === "columns" && nb?.type === "columns") {
      const markA = na.columnMark || "";
      const markB = nb.columnMark || "";
      return markA.localeCompare(markB, "ru");
    }
    if (na?.type === "columns") return 1;
    if (nb?.type === "columns") return -1;

    const [la, naVal] = a.split("-");
    const [lb, nbVal] = b.split("-");
    const lc = la.localeCompare(lb, "ru");
    if (lc !== 0) return lc;
    return Number(naVal) - Number(nbVal);
  });

  if (keys.length === 0) {
    listElement.innerHTML =
      '<div class="caption" style="padding:10px">Нет сохранённых узлов. Заполните форму и нажмите «Проверить и сохранить».</div>';
    return;
  }

  keys.forEach((k) => {
    const n = typedNodes.get(k);

    if (n.type === "columns") {
      const colMark = n.columnMark ? safeValue(n.columnMark) : "Без маркировки";
      const floorPart = n.floor ? `, Этаж ${safeValue(n.floor)}` : "";
      const colCount = n.columns ? n.columns.length : 0;

      let evaluation = {
        status: "empty",
        hasProjXY: false,
        hasFactXY: false
      };
      try {
        const fn =
          typeof evaluateGeoColumnNode === "function"
            ? evaluateGeoColumnNode
            : (typeof evaluateGeoNode === "function" ? evaluateGeoNode : null);

        if (fn) {
          const input =
            fn === evaluateGeoColumnNode
              ? (n.columns || [])
              : (n.columns && n.columns.length
                  ? {
                      projX: n.columns[0]?.projX ?? null,
                      factX: n.columns[0]?.factX ?? null,
                      projY: n.columns[0]?.projY ?? null,
                      factY: n.columns[0]?.factY ?? null
                    }
                  : { projX: null, factX: null, projY: null, factY: null });

          const res = fn(input);
          if (res && typeof res === "object") {
            evaluation = {
              status: res.status || "empty",
              hasProjXY: !!res.hasProjXY,
              hasFactXY: !!res.hasFactXY
            };
          }
        }
      } catch (e) {
        console.error("Status evaluation for columns failed", e);
        evaluation = {
          status: "empty",
          hasProjXY: false,
          hasFactXY: false
        };
      }

      let statusTag = "";
      if (evaluation.status === "bad") {
        statusTag = '<span class="tag bad">превышено</span>';
      } else if (evaluation.status === "ok") {
        statusTag = '<span class="tag ok">в норме</span>';
      } else if (evaluation.hasProjXY && !evaluation.hasFactXY) {
        statusTag = '<span class="tag" style="background: #fbbf24; color: #1f2937; font-weight: 600;">только проектные</span>';
      } else if (!evaluation.hasProjXY && evaluation.hasFactXY) {
        statusTag = '<span class="tag" style="background: #93c5fd; color: #1f2937; font-weight: 600;">только фактические</span>';
      } else {
        statusTag = '<span class="tag" style="background: #9ca3af; color: #1f2937; font-weight: 600;">не заполнено</span>';
      }

      const row = document.createElement("div");
      row.className = "node node-enhanced";
      row.innerHTML = `
        <div class="node-content">
          <div class="node-header">
            <div class="node-title">
              <span class="node-icon">🏛️</span>
              ${colMark}${floorPart}
            </div>
            <div class="node-header-controls">
              ${statusTag}
              ${buildNodeDeleteIconButton("Удалить узел", safeValue)}
            </div>
          </div>
          <div class="node-data">
            <div class="node-data-row">
              <span class="node-label">Колонн:</span>
              <span class="node-values"><strong>${colCount} шт.</strong></span>
            </div>
          </div>
        </div>
      `;
      setupNodeCardInteractions(row, {
        onOpen: () => loadNode(k),
        onDelete: async (button) => {
          if (typeof onDeleteNode === "function") {
            await onDeleteNode(k, n, button);
          }
        }
      });
      listElement.appendChild(row);
      return;
    }

    if (n.type === "walls") {
      const floorPart = n.floor ? `, Этаж ${safeValue(n.floor)}` : "";
      const wallCount = n.walls ? n.walls.length : 0;
      const evaluation = evaluateGeoWallNode(n.walls || []);

      let statusTag = "";
      if (evaluation.status === "bad") {
        statusTag = '<span class="tag bad">превышено</span>';
      } else if (evaluation.status === "ok") {
        statusTag = '<span class="tag ok">в норме</span>';
      } else if (evaluation.hasProjXY && !evaluation.hasFactXY) {
        statusTag = '<span class="tag" style="background: #fbbf24; color: #1f2937; font-weight: 600;">только проектные</span>';
      } else if (!evaluation.hasProjXY && evaluation.hasFactXY) {
        statusTag = '<span class="tag" style="background: #93c5fd; color: #1f2937; font-weight: 600;">только фактические</span>';
      } else {
        statusTag = '<span class="tag" style="background: #9ca3af; color: #1f2937; font-weight: 600;">не заполнено</span>';
      }

      const row = document.createElement("div");
      row.className = "node node-enhanced";
      row.innerHTML = `
        <div class="node-content">
          <div class="node-header">
            <div class="node-title">
              <span class="node-icon">🧱</span>
              Стены${floorPart}
            </div>
            <div class="node-header-controls">
              ${statusTag}
              ${buildNodeDeleteIconButton("Удалить узел", safeValue)}
            </div>
          </div>
          <div class="node-data">
            <div class="node-data-row">
              <span class="node-label">Стен:</span>
              <span class="node-values"><strong>${wallCount} шт.</strong></span>
            </div>
          </div>
        </div>
      `;
      setupNodeCardInteractions(row, {
        onOpen: () => loadNode(k),
        onDelete: async (button) => {
          if (typeof onDeleteNode === "function") {
            await onDeleteNode(k, n, button);
          }
        }
      });
      listElement.appendChild(row);
      return;
    }

    if (n.type === "beams") {
      const floorPart = n.floor ? `, Этаж ${safeValue(n.floor)}` : "";
      const beamCount = n.beams ? n.beams.length : 0;

      let evaluation = {
        status: "empty",
        hasProjXY: false,
        hasFactXY: false
      };
      try {
        const fn =
          typeof evaluateGeoBeamNode === "function"
            ? evaluateGeoBeamNode
            : (typeof evaluateGeoNode === "function" ? evaluateGeoNode : null);

        if (fn) {
          const input =
            fn === evaluateGeoBeamNode
              ? (n.beams || [])
              : (n.beams && n.beams.length && n.beams[0].bindingType === "number_letters"
                  ? {
                      projX: n.beams[0].projX_num_let1 ?? null,
                      factX: n.beams[0].factX_num_let1 ?? null,
                      projY: n.beams[0].projY_num_let1 ?? null,
                      factY: n.beams[0].factY_num_let1 ?? null
                    }
                  : (n.beams && n.beams.length
                      ? {
                          projX: n.beams[0].projX_let_num1 ?? null,
                          factX: n.beams[0].factX_let_num1 ?? null,
                          projY: n.beams[0].projY_let_num1 ?? null,
                          factY: n.beams[0].factY_let_num1 ?? null
                        }
                      : { projX: null, factX: null, projY: null, factY: null }));

          const res = fn(input);
          if (res && typeof res === "object") {
            evaluation = {
              status: res.status || "empty",
              hasProjXY: !!res.hasProjXY,
              hasFactXY: !!res.hasFactXY
            };
          }
        }
      } catch (e) {
        console.error("Status evaluation for beams failed", e);
        evaluation = {
          status: "empty",
          hasProjXY: false,
          hasFactXY: false
        };
      }

      let statusTag = "";
      if (evaluation.status === "bad") {
        statusTag = '<span class="tag bad">превышено</span>';
      } else if (evaluation.status === "ok") {
        statusTag = '<span class="tag ok">в норме</span>';
      } else if (evaluation.hasProjXY && !evaluation.hasFactXY) {
        statusTag = '<span class="tag" style="background: #fbbf24; color: #1f2937; font-weight: 600;">только проектные</span>';
      } else if (!evaluation.hasProjXY && evaluation.hasFactXY) {
        statusTag = '<span class="tag" style="background: #93c5fd; color: #1f2937; font-weight: 600;">только фактические</span>';
      } else {
        statusTag = '<span class="tag" style="background: #9ca3af; color: #1f2937; font-weight: 600;">не заполнено</span>';
      }

      const row = document.createElement("div");
      row.className = "node node-enhanced";
      row.innerHTML = `
        <div class="node-content">
          <div class="node-header">
            <div class="node-title">
              <span class="node-icon">📏</span>
              Балки${floorPart}
            </div>
            <div class="node-header-controls">
              ${statusTag}
              ${buildNodeDeleteIconButton("Удалить узел", safeValue)}
            </div>
          </div>
          <div class="node-data">
            <div class="node-data-row">
              <span class="node-label">Балок:</span>
              <span class="node-values"><strong>${beamCount} шт.</strong></span>
            </div>
          </div>
        </div>
      `;
      setupNodeCardInteractions(row, {
        onOpen: () => loadNode(k),
        onDelete: async (button) => {
          if (typeof onDeleteNode === "function") {
            await onDeleteNode(k, n, button);
          }
        }
      });
      listElement.appendChild(row);
      return;
    }

    const safeNodeDisplay = formatGeoNodeDisplay(n, k, safeValue);
    const evaluation = evaluateGeoNode({
      projX: n.projX,
      factX: n.factX,
      projY: n.projY,
      factY: n.factY,
      projH: n.projH,
      factH: n.factH
    });

    let statusTag = "";
    if (evaluation.status === "bad") {
      statusTag = '<span class="tag bad">превышено</span>';
    } else if (evaluation.status === "ok") {
      statusTag = '<span class="tag ok">в норме</span>';
    } else if (evaluation.hasProjXY && !evaluation.hasFactXY) {
      statusTag = '<span class="tag" style="background: #fbbf24; color: #1f2937; font-weight: 600;">только проектные</span>';
    } else if (!evaluation.hasProjXY && evaluation.hasFactXY) {
      statusTag = '<span class="tag" style="background: #93c5fd; color: #1f2937; font-weight: 600;">только фактические</span>';
    } else {
      statusTag = '<span class="tag" style="background: #9ca3af; color: #1f2937; font-weight: 600;">не заполнено</span>';
    }

    const row = document.createElement("div");
    row.className = "node node-enhanced";
    row.innerHTML = `
      <div class="node-content">
        <div class="node-header">
          <div class="node-title">
            <span class="node-icon">📍</span>
            ${safeNodeDisplay}
          </div>
          <div class="node-header-controls">
            ${statusTag}
            ${buildNodeDeleteIconButton("Удалить узел", safeValue)}
          </div>
        </div>
        <div class="node-data">
          <div class="node-data-row">
            <span class="node-label">Проект:</span>
            <span class="node-values">
              X: <strong>${formatNodeValue(n.projX, "мм")}</strong> |
              Y: <strong>${formatNodeValue(n.projY, "мм")}</strong> |
              H: <strong>${formatNodeValue(n.projH, "мм")}</strong>
            </span>
          </div>
          <div class="node-data-row">
            <span class="node-label">Факт:</span>
            <span class="node-values">
              X: <strong>${formatNodeValue(n.factX, "мм")}</strong> |
              Y: <strong>${formatNodeValue(n.factY, "мм")}</strong> |
              H: <strong>${formatNodeValue(n.factH, "мм")}</strong>
            </span>
          </div>
          ${Array.isArray(n.openingPoints) && n.openingPoints.length ? `
            <div class="node-data-row">
              <span class="node-label">Точки проёма:</span>
              <span class="node-values"><strong>${n.openingPoints.length} шт.</strong></span>
            </div>
          ` : ""}
        </div>
      </div>
    `;
    setupNodeCardInteractions(row, {
      onOpen: () => loadNode(k),
      onDelete: async (button) => {
        if (typeof onDeleteNode === "function") {
          await onDeleteNode(k, n, button);
        }
      }
    });
    listElement.appendChild(row);
  });
}
