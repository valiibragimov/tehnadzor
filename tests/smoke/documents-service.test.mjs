import test from "node:test";
import assert from "node:assert/strict";
import { validatePdf } from "../../dist/features/documents/service.js";

test("PDF storage rejects renamed executable content and oversized files", async () => {
  await assert.rejects(validatePdf(new File(["not a PDF"], "report.pdf", { type: "application/pdf" })), /PDF/);
  await assert.rejects(validatePdf({ name: "large.pdf", type: "application/pdf", size: 21 * 1024 * 1024 }), /PDF/);
});
