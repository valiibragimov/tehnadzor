import { parseArgs } from "node:util";
import { applicationDefault, deleteApp, initializeApp } from "firebase-admin/app";
import { createAdminBimStore, collectProjectBimGenerations } from "../repositories/bim-repository";

/** Explicit, single-project maintenance; dry-run by default. No timers or live deployment. */
async function main() {
  const { values } = parseArgs({ options: {
    project: { type: "string" }, "firebase-project": { type: "string" }, apply: { type: "boolean", default: false }
  } });
  if (!values.project || !/^[a-zA-Z0-9_-]{1,128}$/.test(values.project) || !values["firebase-project"]) throw new Error("Usage: npm run bim:gc -- --firebase-project ID --project ID [--apply]");
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulator && (!/^(localhost|127\.0\.0\.1):\d+$/.test(emulator) || !values["firebase-project"].startsWith("demo-"))) throw new Error("Emulator maintenance requires loopback and a demo- project.");
  const app = initializeApp({ projectId: values["firebase-project"], ...(emulator ? {} : { credential: applicationDefault() }) });
  try {
    if (values.apply) console.log(JSON.stringify(await collectProjectBimGenerations(values.project)));
    else {
      const records = await createAdminBimStore(values.project).list("bimGenerations");
      const counts: Record<string, number> = {};
      for (const record of records) { const status = String(record.data.status); counts[status] = (counts[status] || 0) + 1; }
      console.log(JSON.stringify({ dryRun: true, registeredGenerations: counts, retentionHours: 24, abandonedImportHours: 1 }));
    }
  } finally { await deleteApp(app); }
}
main().catch(() => { console.error("BIM maintenance failed. Verify explicit project IDs, credentials and connectivity; no credentials are logged."); process.exitCode = 1; });
