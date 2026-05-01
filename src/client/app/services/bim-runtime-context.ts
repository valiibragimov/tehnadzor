export function getCurrentProjectIdFromGlobal(): string | null {
  return globalThis.currentProjectId || null;
}

export function getCurrentIfcFileFromInput(
  input: Element | null | undefined = document.getElementById("ifcFileInput")
): File | null {
  if (!(input instanceof HTMLInputElement)) return null;
  return input.files?.[0] || null;
}
