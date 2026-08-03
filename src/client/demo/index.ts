import { prepareDemoRuntime, mountDemoRuntimeControls } from "./runtime.js";

async function bootstrapDemo() {
  prepareDemoRuntime();
  await import("../app.js");
  mountDemoRuntimeControls();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void bootstrapDemo(), { once: true });
} else {
  void bootstrapDemo();
}
