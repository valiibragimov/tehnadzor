self.addEventListener("message", async (event) => {
  const data = event?.data || {};
  if (data.type !== "parse-ifc") return;

  try {
    const file = data.file;
    if (!(file instanceof File)) {
      throw new Error("Не выбран IFC-файл.");
    }

    self.postMessage({ type: "status", phase: "read" });
    const bytes = new Uint8Array(await file.arrayBuffer());

    self.postMessage({ type: "status", phase: "parse" });
    const { parseIfcElements } = await import("./ifc-parser.js");
    const result = await parseIfcElements(bytes, data.options || {});

    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error?.message || "Не удалось разобрать IFC-файл."
    });
  }
});
