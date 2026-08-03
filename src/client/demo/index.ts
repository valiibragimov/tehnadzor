import { resolveAppRuntimeMode } from "../app/runtime-mode.js";
import { createDemoRepository } from "./repositories/demo-repository.js";
import { createDemoSession } from "./session.js";
import { createDemoService } from "./services/demo-service.js";
import { createDemoStorage } from "./storage.js";
import { mountDemoUi } from "./ui.js";

function bootstrapDemo() {
  const mode = resolveAppRuntimeMode({
    pathname: window.location.pathname,
    search: window.location.search
  });

  if (mode !== "demo") {
    throw new Error("Demo bootstrap can run only from the demo entrypoint.");
  }

  const storage = createDemoStorage(window.localStorage);
  const session = createDemoSession(storage);
  session.initialize();
  const repository = createDemoRepository({ session });
  const service = createDemoService(repository);

  mountDemoUi({
    root: document,
    service
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapDemo, { once: true });
} else {
  bootstrapDemo();
}
