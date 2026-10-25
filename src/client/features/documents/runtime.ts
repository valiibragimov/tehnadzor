import { CONSTRUCTION_OPTIONS } from "../../app/construction.js";
import type { WorkspaceContext } from "../../app/workspace-context.js";
import { t, translateEngineeringLabel } from "../../shared/i18n/index.js";
import { createDocumentService, type DocumentKind, type DocumentVersion } from "./service.js";
import { createFirebaseDocumentRepository } from "../../app/repositories/document-repository.js";

export function initDocuments(workspace: WorkspaceContext) {
  const root = document.getElementById("documents");
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = "1";
  const field = <T extends HTMLElement>(id: string) => root.querySelector<T>("#" + id)!;
  const project = field<HTMLInputElement>("documentsProject");
  const select = field<HTMLSelectElement>("documentsSelect");
  const status = field<HTMLElement>("documentsStatus");
  const upload = field<HTMLFormElement>("documentsUpload");
  const access = field<HTMLFormElement>("documentsAccess");
  const versions = field<HTMLElement>("documentVersions");
  const more = field<HTMLButtonElement>("documentsMore");
  const moreVersions = field<HTMLButtonElement>("documentVersionsMore");
  const service = createDocumentService(createFirebaseDocumentRepository());
  let documentPage: Awaited<ReturnType<typeof service.listDocuments>> | null = null;
  let versionPage: Awaited<ReturnType<typeof service.listVersions>> | null = null;
  let generation = 0;
  let role = "none";
  let activeProject = "";
  const message = (key: string) => { status.textContent = t(key); };
  const fail = () => message("documents_error");
  CONSTRUCTION_OPTIONS.forEach(item => {
    const option = document.createElement("option");
    option.value = item.key;
    option.textContent = translateEngineeringLabel(item.label);
    field<HTMLSelectElement>("documentConstruction").append(option);
  });
  const clear = () => {
    generation++;
    select.replaceChildren(new Option(t("documents_new"), ""));
    versions.replaceChildren();
    upload.hidden = true;
    access.hidden = true;
    more.hidden = true;
    moreVersions.hidden = true;
    documentPage = versionPage = null;
  };
  async function refresh(append = false) {
    if (!append) clear();
    const token = generation;
    const projectId = project.value.trim();
    if (!projectId) { message("documents_choose_project"); return; }
    activeProject = projectId;
    try {
      role = await service.getAccess(projectId);
      const page = await service.listDocuments(projectId, append ? documentPage?.cursor : undefined);
      if (token !== generation || projectId !== project.value.trim()) return;
      documentPage = page;
      upload.hidden = role !== "owner" && role !== "editor";
      access.hidden = role !== "owner";
      for (const item of page.items) select.append(new Option(String(item.title || item.id), item.id));
      more.hidden = !page.hasMore;
      message("documents_loaded");
    } catch { if (token === generation) fail(); }
  }
  async function showVersions(append = false) {
    const token = ++generation;
    const projectId = activeProject;
    const documentId = select.value;
    if (!append) { versions.replaceChildren(); versionPage = null; }
    moreVersions.hidden = true;
    if (!documentId) return;
    try {
      const page = await service.listVersions(projectId, documentId, append ? versionPage?.cursor : undefined);
      if (token !== generation || documentId !== select.value) return;
      versionPage = page;
      for (const version of page.items) renderVersion(projectId, version);
      moreVersions.hidden = !page.hasMore;
    } catch { if (token === generation) fail(); }
  }
  function renderVersion(projectId: string, version: DocumentVersion) {
    const row = document.createElement("article");
    row.className = "card";
    const title = document.createElement("p");
    title.textContent = `${version.title} · ${t("document_" + version.kind)} · ${version.fileName} · ${version.id}`;
    const links = document.createElement("p");
    links.textContent = [version.construction, version.inspectionCollection, version.inspectionId, version.bimElementId].filter(Boolean).join(" · ");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.i18n = version.status === "ready" ? "documents_download" : "documents_pending";
    button.textContent = t(button.dataset.i18n);
    button.disabled = version.status !== "ready" && role === "reader";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        if (version.status !== "ready") {
          await service.finalize(projectId, version.documentId, version.id);
          await showVersions();
        } else {
          const blob = await service.download(projectId, version);
          if (projectId !== activeProject) return;
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = version.fileName;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      } catch { fail(); } finally { button.disabled = false; }
    });
    if (version.status === "ready") {
      const preview = document.createElement("button");
      preview.type = "button";
      preview.textContent = t("documents_preview");
      preview.addEventListener("click", async () => {
        preview.disabled = true;
        try {
          const blob = await service.download(projectId, version);
          if (projectId !== activeProject) return;
          const url = URL.createObjectURL(blob);
          const dialog = document.createElement("dialog");
          const close = document.createElement("button");
          close.type = "button";
          close.textContent = t("documents_close_preview");
          const frame = document.createElement("iframe");
          frame.title = version.title;
          frame.src = url;
          frame.className = "document-preview-frame";
          dialog.className = "document-preview-dialog";
          close.addEventListener("click", () => dialog.close());
          dialog.addEventListener("close", () => { URL.revokeObjectURL(url); dialog.remove(); }, { once: true });
          dialog.append(close, frame);
          root.append(dialog);
          dialog.showModal();
        } catch { fail(); } finally { preview.disabled = false; }
      });
      row.append(preview);
    }
    row.append(title, links, button);
    versions.append(row);
    // Editing metadata creates a new immutable version with the same document identity.
    if (version === versionPage?.items[0]) {
      field<HTMLInputElement>("documentTitle").value = version.title;
      field<HTMLSelectElement>("documentKind").value = version.kind;
      field<HTMLSelectElement>("documentConstruction").value = version.construction;
      field<HTMLSelectElement>("documentInspectionCollection").value = version.inspectionCollection;
      field<HTMLInputElement>("documentInspectionId").value = version.inspectionId;
      field<HTMLInputElement>("documentBimId").value = version.bimElementId;
    }
  }
  field<HTMLButtonElement>("documentsRefresh").addEventListener("click", () => void refresh());
  more.addEventListener("click", () => void refresh(true));
  moreVersions.addEventListener("click", () => void showVersions(true));
  project.addEventListener("input", () => { activeProject = ""; clear(); });
  select.addEventListener("change", () => { upload.reset(); void showVersions(); });
  upload.addEventListener("submit", async event => {
    event.preventDefault();
    if (project.value.trim() !== activeProject || !activeProject) return;
    const file = field<HTMLInputElement>("documentFile").files?.[0];
    if (!file) return;
    const projectId = activeProject;
    const documentId = select.value;
    const button = upload.querySelector<HTMLButtonElement>('[type="submit"]')!;
    button.disabled = true;
    try {
      const result = await service.addVersion(projectId, {
        title: field<HTMLInputElement>("documentTitle").value.trim(),
        kind: field<HTMLSelectElement>("documentKind").value as DocumentKind,
        construction: field<HTMLSelectElement>("documentConstruction").value,
        inspectionCollection: field<HTMLSelectElement>("documentInspectionCollection").value,
        inspectionId: field<HTMLInputElement>("documentInspectionId").value.trim(),
        bimElementId: field<HTMLInputElement>("documentBimId").value.trim()
      }, file, documentId || undefined);
      if (projectId !== activeProject) return;
      await refresh();
      if (![...select.options].some(option => option.value === result.documentId)) select.append(new Option(result.documentId, result.documentId));
      select.value = result.documentId;
      await showVersions();
      field<HTMLInputElement>("documentFile").value = "";
      message("documents_uploaded");
    } catch { if (projectId === activeProject) { await refresh(); fail(); } } finally { button.disabled = false; }
  });
  access.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await service.setMember(activeProject, field<HTMLInputElement>("documentMemberUid").value.trim(), field<HTMLSelectElement>("documentMemberRole").value as "editor" | "reader" | "none");
      message("documents_access_saved");
    } catch { fail(); }
  });
  project.value = workspace.getProjectId() || "";
  void refresh();
  document.addEventListener("app:tab-activated", event => {
    if ((event as CustomEvent).detail?.target !== "documents") return;
    if (workspace.getProjectId() && workspace.getProjectId() !== activeProject) project.value = workspace.getProjectId()!;
    void refresh();
  });
}
