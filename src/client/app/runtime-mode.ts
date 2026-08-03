export type AppRuntimeMode = "production" | "demo";

export interface RuntimeLocationInput {
  pathname: string;
  search: string;
}

const DEMO_ENTRYPOINT_PATHS = new Set([
  "/",
  "/index.html",
  "/demo",
  "/demo.html"
]);

export function isDemoEntrypointPath(pathname: string): boolean {
  const input = String(pathname || "");
  const queryIndex = input.indexOf("?");
  const hashIndex = input.indexOf("#");
  let pathnameEnd = input.length;

  if (queryIndex >= 0) pathnameEnd = Math.min(pathnameEnd, queryIndex);
  if (hashIndex >= 0) pathnameEnd = Math.min(pathnameEnd, hashIndex);

  return DEMO_ENTRYPOINT_PATHS.has(input.slice(0, pathnameEnd).toLowerCase());
}

export function resolveAppRuntimeMode({ pathname }: RuntimeLocationInput): AppRuntimeMode {
  return isDemoEntrypointPath(pathname) ? "demo" : "production";
}
