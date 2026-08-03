export type AppRuntimeMode = "production" | "demo";

export interface RuntimeLocationInput {
  pathname: string;
  search: string;
}

export function resolveAppRuntimeMode({ pathname, search }: RuntimeLocationInput): AppRuntimeMode {
  const normalizedPath = String(pathname || "").toLowerCase();
  const params = new URLSearchParams(String(search || ""));

  if (normalizedPath.endsWith("/demo.html") || normalizedPath === "demo.html") {
    return "demo";
  }

  return params.get("demo") === "1" ? "demo" : "production";
}
