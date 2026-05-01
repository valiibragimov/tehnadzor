#!/usr/bin/env node
require("dotenv").config();

const { initializeApp, cert, applicationDefault, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const LEGACY_MODULES = [
  {
    sourceCollection: "geoNodes",
    module: "Геодезия",
    moduleKey: "geo",
    resolveConstruction: resolveGeoConstruction
  },
  {
    sourceCollection: "reinfChecks",
    module: "Армирование",
    moduleKey: "reinforcement",
    resolveConstruction: resolveDefaultConstruction
  },
  {
    sourceCollection: "geomChecks",
    module: "Геометрия",
    moduleKey: "geometry",
    resolveConstruction: resolveDefaultConstruction
  },
  {
    sourceCollection: "strengthChecks",
    module: "Прочность",
    moduleKey: "strength",
    resolveConstruction: resolveDefaultConstruction
  }
];

function parseArgs(argv) {
  const args = {
    commit: false,
    dryRun: true,
    verbose: false,
    projectId: ""
  };

  argv.forEach((arg) => {
    if (arg === "--commit") {
      args.commit = true;
      args.dryRun = false;
      return;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      args.commit = false;
      return;
    }
    if (arg === "--verbose") {
      args.verbose = true;
      return;
    }
    if (arg.startsWith("--projectId=")) {
      args.projectId = String(arg.split("=")[1] || "").trim();
      return;
    }
    if (arg.startsWith("--project-id=")) {
      args.projectId = String(arg.split("=")[1] || "").trim();
    }
  });

  return args;
}

function buildFirebaseCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n")
    });
  }

  return applicationDefault();
}

function initFirebaseAdmin() {
  if (getApps().length > 0) return;
  initializeApp({
    credential: buildFirebaseCredential(),
    projectId: process.env.FIREBASE_PROJECT_ID || undefined
  });
}

export {};

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeUid(value) {
  const uid = normalizeText(value);
  return uid || "";
}

function normalizeContractorName(value) {
  if (value == null) return "";
  return String(value).trim();
}

function pickFirstNonEmpty(values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return "";
}

function parseTimestampMs(value) {
  if (value == null) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 0 && value < 1e12) return Math.round(value * 1000);
    return Math.round(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) {
      if (asNumber > 0 && asNumber < 1e12) return Math.round(asNumber * 1000);
      return Math.round(asNumber);
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value.toMillis === "function") {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value.toDate === "function") {
    const date = value.toDate();
    const ms = date instanceof Date ? date.getTime() : Number.NaN;
    return Number.isFinite(ms) ? ms : null;
  }

  if (
    typeof value === "object" &&
    Number.isFinite(value.seconds) &&
    Number.isFinite(value.nanoseconds)
  ) {
    return Math.round(value.seconds * 1000 + value.nanoseconds / 1e6);
  }

  return null;
}

function resolveCreatedAtMs(legacyData, nowMs) {
  const candidates = [
    legacyData?.createdAt,
    legacyData?.timestamp,
    legacyData?.ts,
    legacyData?.date
  ];
  for (const candidate of candidates) {
    const ms = parseTimestampMs(candidate);
    if (ms != null) return ms;
  }
  return nowMs;
}

function resolveUpdatedAtMs(legacyData, createdAtMs, nowMs) {
  const candidates = [
    legacyData?.updatedAt,
    legacyData?.checkedAt,
    legacyData?.lastCheckedAt
  ];
  for (const candidate of candidates) {
    const ms = parseTimestampMs(candidate);
    if (ms != null) return ms;
  }
  return createdAtMs || nowMs;
}

function resolveGeoConstruction(legacyData) {
  const explicit = pickFirstNonEmpty([legacyData?.constructionType, legacyData?.construction]);
  if (explicit) return explicit;

  const type = normalizeText(legacyData?.type).toLowerCase();
  if (type === "columns") return "Колонна";
  if (type === "walls") return "Стена";
  if (type === "beams") return "Балка";
  return "Плита";
}

function resolveDefaultConstruction(legacyData) {
  return pickFirstNonEmpty([legacyData?.construction, legacyData?.constructionType]);
}

function normalizeCheckStatus(sourceCollection, value) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const lowered = raw.toLocaleLowerCase("ru");

  if (sourceCollection === "geoNodes" && lowered === "bad") {
    return "exceeded";
  }
  return lowered;
}

function isAlreadyExistsError(error) {
  const code = error?.code;
  const message = String(error?.message || "").toLowerCase();
  if (code === 6 || code === "ALREADY_EXISTS" || code === "already-exists") return true;
  return message.includes("already exists");
}

function isSoftDeletedDoc(legacyData) {
  if (!legacyData || typeof legacyData !== "object") return false;
  if (legacyData.deleted === true) return true;
  if (legacyData.deleted === 1) return true;
  if (typeof legacyData.deleted === "string" && legacyData.deleted.trim().toLowerCase() === "true") {
    return true;
  }
  return false;
}

function normalizeExistingSourceCollection(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, "");
}

function buildInspectionPayload({
  projectId,
  moduleConfig,
  sourceId,
  legacyData,
  projectData,
  nowMs
}) {
  const projectOwnerUid = normalizeUid(projectData?.ownerUid || projectData?.createdBy);
  const projectCreatedBy = normalizeUid(projectData?.createdBy || projectData?.ownerUid);
  const ownerUid = normalizeUid(
    pickFirstNonEmpty([
      legacyData?.ownerUid,
      legacyData?.createdBy,
      projectOwnerUid,
      projectCreatedBy
    ])
  );
  const createdBy = normalizeUid(
    pickFirstNonEmpty([
      legacyData?.createdBy,
      legacyData?.ownerUid,
      projectCreatedBy,
      projectOwnerUid,
      ownerUid
    ])
  );

  const contractorName = normalizeContractorName(
    pickFirstNonEmpty([
      legacyData?.contractorName,
      projectData?.contractorName
    ])
  );

  const createdAt = resolveCreatedAtMs(legacyData, nowMs);
  const updatedAt = resolveUpdatedAtMs(legacyData, createdAt, nowMs);

  const inspectionPayload: Record<string, unknown> & {
    ownerUid?: string;
    createdBy?: string;
  } = {
    projectId,
    module: moduleConfig.module,
    moduleKey: moduleConfig.moduleKey,
    sourceCollection: moduleConfig.sourceCollection,
    sourceId,
    sourceDocId: sourceId,
    construction: moduleConfig.resolveConstruction(legacyData) || "",
    checkStatus: normalizeCheckStatus(moduleConfig.sourceCollection, legacyData?.status || legacyData?.checkStatus),
    summaryText: normalizeText(legacyData?.summaryText),
    createdAt,
    updatedAt,
    contractorName
  };

  if (ownerUid) inspectionPayload.ownerUid = ownerUid;
  if (createdBy) inspectionPayload.createdBy = createdBy;

  return inspectionPayload;
}

function createProjectStats(projectId) {
  return {
    projectId,
    inspectionsExistingAtStart: 0,
    legacyScanned: 0,
    candidates: 0,
    created: 0,
    skippedExisting: 0,
    skippedDeleted: 0,
    conflicts: 0,
    errors: 0,
    perCollection: {}
  };
}

function createCollectionStats() {
  return {
    scanned: 0,
    candidates: 0,
    created: 0,
    skippedExisting: 0,
    skippedDeleted: 0,
    conflicts: 0,
    errors: 0
  };
}

async function processProject(projectDoc, options) {
  const projectId = projectDoc.id;
  const projectData = projectDoc.data() || {};
  const projectStats = createProjectStats(projectId);
  const inspectionsRef = projectDoc.ref.collection("inspections");

  const inspectionsSnapshot = await inspectionsRef.get();
  const existingInspectionsById = new Map();
  inspectionsSnapshot.forEach((inspectionDoc) => {
    existingInspectionsById.set(inspectionDoc.id, inspectionDoc.data() || {});
  });
  projectStats.inspectionsExistingAtStart = existingInspectionsById.size;

  for (const moduleConfig of LEGACY_MODULES) {
    const collectionStats = createCollectionStats();
    projectStats.perCollection[moduleConfig.sourceCollection] = collectionStats;

    let legacySnapshot;
    try {
      legacySnapshot = await projectDoc.ref.collection(moduleConfig.sourceCollection).get();
    } catch (error) {
      collectionStats.errors += 1;
      projectStats.errors += 1;
      console.error(
        `[backfill] ${projectId}: failed to read ${moduleConfig.sourceCollection}:`,
        error?.message || error
      );
      continue;
    }

    collectionStats.scanned = legacySnapshot.size;
    projectStats.legacyScanned += legacySnapshot.size;

    for (const legacyDoc of legacySnapshot.docs) {
      const sourceId = legacyDoc.id;
      const legacyData = legacyDoc.data() || {};

      if (isSoftDeletedDoc(legacyData)) {
        collectionStats.skippedDeleted += 1;
        projectStats.skippedDeleted += 1;
        continue;
      }

      const existingInspection = existingInspectionsById.get(sourceId);

      if (existingInspection) {
        collectionStats.skippedExisting += 1;
        projectStats.skippedExisting += 1;

        const existingSource = normalizeExistingSourceCollection(existingInspection.sourceCollection);
        const currentSource = normalizeExistingSourceCollection(moduleConfig.sourceCollection);
        if (existingSource && existingSource !== currentSource) {
          collectionStats.conflicts += 1;
          projectStats.conflicts += 1;
          if (options.verbose) {
            console.warn(
              `[backfill] ${projectId}/${sourceId}: id conflict (${existingInspection.sourceCollection} vs ${moduleConfig.sourceCollection})`
            );
          }
        }
        continue;
      }

      const nowMs = Date.now();
      const payload = buildInspectionPayload({
        projectId,
        moduleConfig,
        sourceId,
        legacyData,
        projectData,
        nowMs
      });

      collectionStats.candidates += 1;
      projectStats.candidates += 1;

      if (options.dryRun) {
        existingInspectionsById.set(sourceId, { sourceCollection: moduleConfig.sourceCollection });
        continue;
      }

      try {
        await inspectionsRef.doc(sourceId).create(payload);
        collectionStats.created += 1;
        projectStats.created += 1;
        existingInspectionsById.set(sourceId, { sourceCollection: moduleConfig.sourceCollection });
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          collectionStats.skippedExisting += 1;
          projectStats.skippedExisting += 1;
          continue;
        }
        collectionStats.errors += 1;
        projectStats.errors += 1;
        console.error(
          `[backfill] ${projectId}/${moduleConfig.sourceCollection}/${sourceId}: create failed:`,
          error?.message || error
        );
      }
    }
  }

  return projectStats;
}

function printProjectStats(stats, modeLabel) {
  console.log(
    `[${modeLabel}] ${stats.projectId}: legacy=${stats.legacyScanned}, candidates=${stats.candidates}, created=${stats.created}, skippedExisting=${stats.skippedExisting}, skippedDeleted=${stats.skippedDeleted}, conflicts=${stats.conflicts}, errors=${stats.errors}`
  );
}

function printTotals(totals, modeLabel) {
  console.log("------------------------------------------------------------");
  console.log(
    `[${modeLabel}] totals: projects=${totals.projects}, legacy=${totals.legacyScanned}, candidates=${totals.candidates}, created=${totals.created}, skippedExisting=${totals.skippedExisting}, skippedDeleted=${totals.skippedDeleted}, conflicts=${totals.conflicts}, errors=${totals.errors}`
  );
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  initFirebaseAdmin();
  const db = getFirestore();
  const modeLabel = args.dryRun ? "dry-run" : "commit";

  let projectDocs = [];
  if (args.projectId) {
    const projectSnap = await db.collection("projects").doc(args.projectId).get();
    if (!projectSnap.exists) {
      console.error(`[backfill] project not found: ${args.projectId}`);
      process.exitCode = 1;
      return;
    }
    projectDocs = [projectSnap];
  } else {
    const projectsSnap = await db.collection("projects").get();
    projectDocs = projectsSnap.docs;
  }

  if (!projectDocs.length) {
    console.log(`[${modeLabel}] no projects found`);
    return;
  }

  console.log(
    `[${modeLabel}] starting backfill for ${projectDocs.length} project(s), modules=${LEGACY_MODULES.map((item) => item.sourceCollection).join(", ")}`
  );

  const totals = {
    projects: 0,
    legacyScanned: 0,
    candidates: 0,
    created: 0,
    skippedExisting: 0,
    skippedDeleted: 0,
    conflicts: 0,
    errors: 0
  };

  for (const projectDoc of projectDocs) {
    const stats = await processProject(projectDoc, args);
    totals.projects += 1;
    totals.legacyScanned += stats.legacyScanned;
    totals.candidates += stats.candidates;
    totals.created += stats.created;
    totals.skippedExisting += stats.skippedExisting;
    totals.skippedDeleted += stats.skippedDeleted;
    totals.conflicts += stats.conflicts;
    totals.errors += stats.errors;
    printProjectStats(stats, modeLabel);
  }

  printTotals(totals, modeLabel);
  if (args.dryRun) {
    console.log("[dry-run] no writes were made. Re-run with --commit to apply changes.");
  }
}

run().catch((error) => {
  console.error("[backfill] fatal error:", error);
  process.exitCode = 1;
});
