/**
 * Локальный сервер для генерации ИИ-отчётов
 * Запуск: npm run dev
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { parseIfcElements } from "./services/ifc-import";
import { getProfileFeed } from "./services/profile-feed";

const app = express();
const PORT = Number(process.env.PORT || 5050);
const BODY_LIMIT = process.env.BODY_LIMIT || "100kb";
const IFC_IMPORT_BODY_LIMIT = process.env.IFC_IMPORT_BODY_LIMIT || "25mb";
const AUTH_REQUIRED = process.env.AUTH_REQUIRED !== "false";
const LOCAL_SERVICE_ACCOUNT_FILE = "serviceAccount.local.json";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];

function parseAllowedOrigins() {
  const raw = (process.env.ALLOWED_ORIGINS || "").trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const ALLOWED_ORIGINS = parseAllowedOrigins();
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 20);
const CHECK_REVOKED_TOKENS = process.env.CHECK_REVOKED_TOKENS === "true";
const HEAVY_OPERATION_LIMITS = {
  generateReport: {
    windowMs: Number(process.env.GENERATE_REPORT_WINDOW_MS || 30_000),
    max: Number(process.env.GENERATE_REPORT_MAX || 3)
  },
  ifcImport: {
    windowMs: Number(process.env.IFC_IMPORT_WINDOW_MS || 60_000),
    max: Number(process.env.IFC_IMPORT_MAX || 2)
  },
  bimDelete: {
    windowMs: Number(process.env.BIM_DELETE_WINDOW_MS || 30_000),
    max: Number(process.env.BIM_DELETE_MAX || 3)
  }
};
const recentHeavyOperations = new Map<string, number[]>();
const inFlightHeavyOperations = new Map<string, symbol>();

interface FirebaseAdminInitResult {
  error: unknown;
  source: string | null;
  projectId: string | null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readJsonFileIfExists(filePath: string | null) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read JSON file at ${filePath}: ${getErrorMessage(error)}`);
  }
}

function getServiceAccountPath() {
  const configuredPath = String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "").trim();
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);
  }

  const defaultCandidates = [
    path.resolve(process.cwd(), LOCAL_SERVICE_ACCOUNT_FILE),
    path.resolve(process.cwd(), "server", LOCAL_SERVICE_ACCOUNT_FILE)
  ];

  return defaultCandidates.find((candidatePath) => fs.existsSync(candidatePath)) || null;
}

function getEnvServiceAccountConfig() {
  const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || "");

  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    source: "env",
    projectId,
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n")
    })
  };
}

function getFileServiceAccountConfig() {
  const filePath = getServiceAccountPath();
  const serviceAccount = readJsonFileIfExists(filePath);
  if (!serviceAccount) return null;

  const projectId = String(serviceAccount.project_id || "").trim();
  const clientEmail = String(serviceAccount.client_email || "").trim();
  const privateKey = String(serviceAccount.private_key || "");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(`Service account file is missing required fields: ${filePath}`);
  }

  return {
    source: `file:${filePath}`,
    projectId,
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n")
    })
  };
}

function buildFirebaseAdminConfig() {
  const envConfig = getEnvServiceAccountConfig();
  if (envConfig) return envConfig;

  const fileConfig = getFileServiceAccountConfig();
  if (fileConfig) return fileConfig;

  const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim() || undefined;
  return {
    source: "applicationDefault",
    projectId,
    credential: applicationDefault()
  };
}

function initFirebaseAdmin(): FirebaseAdminInitResult {
  if (getApps().length > 0) {
    return {
      error: null,
      source: "existing-app",
      projectId: getApps()[0]?.options?.projectId || null
    };
  }

  try {
    const firebaseAdminConfig = buildFirebaseAdminConfig();
    initializeApp({
      credential: firebaseAdminConfig.credential,
      projectId: firebaseAdminConfig.projectId || undefined
    });
    return {
      error: null,
      source: firebaseAdminConfig.source,
      projectId: firebaseAdminConfig.projectId || null
    };
  } catch (error) {
    return {
      error,
      source: null,
      projectId: null
    };
  }
}

const firebaseAdminInit = initFirebaseAdmin();
const adminInitError = firebaseAdminInit.error;
if (AUTH_REQUIRED && adminInitError) {
  console.error("[startup] Firebase Admin init failed while AUTH_REQUIRED=true");
  console.error(adminInitError);
  process.exit(1);
}
if (!AUTH_REQUIRED) {
  console.warn("[security] AUTH_REQUIRED=false. /generateReport доступен без токена.");
}
if (adminInitError && !AUTH_REQUIRED) {
  console.warn("[security] Firebase Admin не инициализирован (допустимо при AUTH_REQUIRED=false)");
} else {
  console.log(
    `[startup] Firebase Admin initialized via ${firebaseAdminInit.source} projectId=${firebaseAdminInit.projectId || "-"}`
  );
}

const moduleStatsSchema = z
  .object({
    total: z.number().int().min(0).max(100000),
    exceeded: z.number().int().min(0).max(100000)
  })
  .refine((value) => value.exceeded <= value.total, {
    message: "exceeded must be <= total"
  });

const reportRequestSchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  construction: z.string().trim().min(1).max(64).optional(),
  summaryData: z.object({
    project: z.string().trim().max(256).optional(),
    construction: z.string().trim().max(64).optional(),
    date: z.string().trim().max(32).optional(),
    engineer: z.string().trim().max(128).optional(),
    geo: moduleStatsSchema,
    reinf: moduleStatsSchema,
    geom: moduleStatsSchema,
    strength: moduleStatsSchema
  })
});

const ifcImportQuerySchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  sourceModelId: z.string().trim().min(1).max(80).optional(),
  fileName: z.string().trim().min(1).max(256).optional()
});

const bimDeleteQuerySchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  sourceModelId: z.string().trim().min(1).max(80).optional()
});

const generateReportLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many requests. Please retry later."
  }
});

const ifcImportLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: Math.max(3, Math.floor(RATE_LIMIT_MAX / 2)),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many IFC import requests. Please retry later."
  }
});

function createHttpError(status, message) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function buildHeavyOperationKey(parts = []) {
  return parts
    .map((part) => String(part == null ? "-" : part).trim() || "-")
    .join(":");
}

function enforceHeavyOperationRateLimit({ key, windowMs, max, message }) {
  const now = Date.now();
  const recent = recentHeavyOperations.get(key) || [];
  const filtered = recent.filter((timestamp) => now - timestamp < windowMs);

  if (filtered.length >= max) {
    recentHeavyOperations.set(key, filtered);
    throw createHttpError(429, message);
  }

  filtered.push(now);
  recentHeavyOperations.set(key, filtered);
}

async function withHeavyOperationLock(options, operation) {
  const normalizedKey = String(options?.key || "").trim();
  if (!normalizedKey) {
    return operation();
  }

  if (inFlightHeavyOperations.has(normalizedKey)) {
    throw createHttpError(409, options.inFlightMessage || "Operation is already running");
  }

  enforceHeavyOperationRateLimit({
    key: normalizedKey,
    windowMs: Math.max(1_000, Number(options.rateWindowMs) || 30_000),
    max: Math.max(1, Number(options.rateMax) || 1),
    message: options.rateMessage || "Too many requests. Please retry later."
  });

  const token = Symbol(normalizedKey);
  inFlightHeavyOperations.set(normalizedKey, token);

  try {
    return await operation();
  } finally {
    if (inFlightHeavyOperations.get(normalizedKey) === token) {
      inFlightHeavyOperations.delete(normalizedKey);
    }
  }
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204
};

app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: BODY_LIMIT }));

app.use((req, res, next) => {
  const origin = req.headers.origin || "-";
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} origin=${origin}`);
  next();
});

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

async function ensureProjectAccess(projectId, uid) {
  const projectSnap = await getFirestore().collection("projects").doc(projectId).get();
  if (!projectSnap.exists) return { ok: false, reason: "project-not-found" };

  const data = projectSnap.data() || {};
  const ownerUid = String(data.ownerUid || "").trim();
  const createdBy = String(data.createdBy || "").trim();
  if (uid && (ownerUid === uid || createdBy === uid)) {
    return { ok: true, data };
  }

  return { ok: false, reason: "forbidden" };
}

async function clearExistingElementsBySourceModelId(projectId, sourceModelId) {
  const collectionRef = getFirestore().collection("projects").doc(projectId).collection("elements");
  const snap = await collectionRef.where("sourceModelId", "==", sourceModelId).get();
  if (snap.empty) return 0;

  let deleted = 0;
  let batch = getFirestore().batch();
  let batchSize = 0;

  for (const docSnap of snap.docs) {
    batch.delete(docSnap.ref);
    batchSize += 1;
    deleted += 1;

    if (batchSize >= 400) {
      await batch.commit();
      batch = getFirestore().batch();
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    await batch.commit();
  }

  return deleted;
}

async function clearProjectElements(projectId, sourceModelId) {
  const collectionRef = getFirestore().collection("projects").doc(projectId).collection("elements");
  const normalizedSourceModelId = String(sourceModelId || "").trim();
  const targetRef = normalizedSourceModelId
    ? collectionRef.where("sourceModelId", "==", normalizedSourceModelId)
    : collectionRef;
  const snap = await targetRef.get();
  if (snap.empty) return 0;

  let deleted = 0;
  let batch = getFirestore().batch();
  let batchSize = 0;

  for (const docSnap of snap.docs) {
    batch.delete(docSnap.ref);
    batchSize += 1;
    deleted += 1;

    if (batchSize >= 400) {
      await batch.commit();
      batch = getFirestore().batch();
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    await batch.commit();
  }

  return deleted;
}

async function writeImportedElements(projectId, elements) {
  if (!Array.isArray(elements) || elements.length === 0) return 0;

  const collectionRef = getFirestore().collection("projects").doc(projectId).collection("elements");
  let written = 0;
  let batch = getFirestore().batch();
  let batchSize = 0;

  for (const element of elements) {
    const docRef = collectionRef.doc(element.elementId);
    batch.set(docRef, {
      ...element,
      importedAt: FieldValue.serverTimestamp()
    });
    batchSize += 1;
    written += 1;

    if (batchSize >= 400) {
      await batch.commit();
      batch = getFirestore().batch();
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    await batch.commit();
  }

  return written;
}

async function requireFirebaseAuth(req, res, next) {
  if (!AUTH_REQUIRED) {
    return next();
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: "Missing Bearer token"
    });
  }

  try {
    const decoded = await getAuth().verifyIdToken(token, CHECK_REVOKED_TOKENS);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null
    };
    return next();
  } catch (error) {
    console.warn("[auth] Invalid Firebase token:", error?.code || error?.message || error);
    return res.status(401).json({
      ok: false,
      error: "Invalid or expired token"
    });
  }
}

/**
 * POST /generateReport
 * Генерирует отчёт по результатам проверок
 */
app.post("/generateReport", generateReportLimiter, requireFirebaseAuth, async (req, res) => {
  try {
    const parsed = reportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }));
      return res.status(400).json({
        ok: false,
        error: "Invalid request body",
        details
      });
    }

    const { projectId, construction, summaryData } = parsed.data;
    const authReq = req as typeof req & {
      user?: {
        uid: string;
        email: string | null;
      };
    };
    const requester = authReq.user?.uid || "anonymous";
    if (AUTH_REQUIRED || authReq.user?.uid) {
      const access = await ensureProjectAccess(projectId, authReq.user?.uid || "");
      if (!access.ok) {
        const status = access.reason === "project-not-found" ? 404 : 403;
        return res.status(status).json({
          ok: false,
          error: access.reason === "project-not-found" ? "Project not found" : "Forbidden"
        });
      }
    }

    const reportText = await withHeavyOperationLock(
      {
        key: buildHeavyOperationKey(["generateReport", requester, projectId, construction || "all"]),
        inFlightMessage: "Report generation is already running for this project.",
        rateWindowMs: HEAVY_OPERATION_LIMITS.generateReport.windowMs,
        rateMax: HEAVY_OPERATION_LIMITS.generateReport.max,
        rateMessage: "Too many report generation requests. Please retry later."
      },
      async () => {
        console.log(`[generateReport] uid=${requester} projectId=${projectId} construction=${construction || "-"}`);
        return buildReportText(summaryData);
      }
    );

    return res.json({
      ok: true,
      text: reportText
    });
  } catch (error) {
    console.error("[generateReport] Ошибка:", error);
    return res.status(error.status || 500).json({
      ok: false,
      error: error.status ? error.message : "Internal server error"
    });
  }
});

app.post(
  "/bim/import-ifc",
  ifcImportLimiter,
  requireFirebaseAuth,
  express.raw({
    type: [
      "application/octet-stream",
      "application/ifc",
      "application/x-step",
      "model/ifc",
      "text/plain"
    ],
    limit: IFC_IMPORT_BODY_LIMIT
  }),
  async (req, res) => {
    try {
      const parsedQuery = ifcImportQuerySchema.safeParse(req.query || {});
      if (!parsedQuery.success) {
        const details = parsedQuery.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }));
        return res.status(400).json({
          ok: false,
          error: "Invalid query params",
          details
        });
      }

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "IFC file body is empty"
        });
      }

      const authReq = req as typeof req & {
        user?: {
          uid: string;
          email: string | null;
        };
      };
      const { projectId, sourceModelId, fileName } = parsedQuery.data;
      const requester = authReq.user?.uid || "";
      const access = await ensureProjectAccess(projectId, requester);

      if (!access.ok) {
        const status = access.reason === "project-not-found" ? 404 : 403;
        return res.status(status).json({
          ok: false,
          error: access.reason === "project-not-found" ? "Project not found" : "Forbidden"
        });
      }

      const result = await withHeavyOperationLock(
        {
          key: buildHeavyOperationKey(["ifcImport", requester, projectId, sourceModelId || "auto"]),
          inFlightMessage: "IFC import is already running for this model.",
          rateWindowMs: HEAVY_OPERATION_LIMITS.ifcImport.windowMs,
          rateMax: HEAVY_OPERATION_LIMITS.ifcImport.max,
          rateMessage: "Too many IFC import requests. Please retry later."
        },
        async () => {
          const ifcText = req.body.toString("utf8");
          const parsedImport = parseIfcElements(ifcText, {
            sourceModelId,
            fileName
          });

          if (!parsedImport.importedCount) {
            throw createHttpError(422, "No supported IFC elements were found in the file");
          }

          const deletedCount = await clearExistingElementsBySourceModelId(
            projectId,
            parsedImport.sourceModelId
          );
          const writtenCount = await writeImportedElements(projectId, parsedImport.elements);

          console.log(
            `[bim/import-ifc] uid=${requester} projectId=${projectId} sourceModelId=${parsedImport.sourceModelId} imported=${writtenCount}`
          );

          return {
            sourceModelId: parsedImport.sourceModelId,
            fileName: parsedImport.fileName,
            importedCount: writtenCount,
            replacedCount: deletedCount,
            countsByType: parsedImport.countsByType,
            countsByLabel: parsedImport.countsByLabel
          };
        }
      );

      return res.json({
        ok: true,
        projectId,
        sourceModelId: result.sourceModelId,
        fileName: result.fileName,
        importedCount: result.importedCount,
        replacedCount: result.replacedCount,
        countsByType: result.countsByType,
        countsByLabel: result.countsByLabel
      });
    } catch (error) {
      console.error("[bim/import-ifc] Ошибка:", error);
      return res.status(error.status || 500).json({
        ok: false,
        error: error.status ? error.message : "Internal server error"
      });
    }
  }
);

app.delete("/bim/elements", ifcImportLimiter, requireFirebaseAuth, async (req, res) => {
  try {
    const parsedQuery = bimDeleteQuerySchema.safeParse(req.query || {});
    if (!parsedQuery.success) {
      const details = parsedQuery.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }));
      return res.status(400).json({
        ok: false,
        error: "Invalid query params",
        details
      });
    }

    const { projectId, sourceModelId } = parsedQuery.data;
    const authReq = req as typeof req & {
      user?: {
        uid: string;
        email: string | null;
      };
    };
    const requester = authReq.user?.uid || "";
    const access = await ensureProjectAccess(projectId, requester);

    if (!access.ok) {
      const status = access.reason === "project-not-found" ? 404 : 403;
      return res.status(status).json({
        ok: false,
        error: access.reason === "project-not-found" ? "Project not found" : "Forbidden"
      });
    }

    const deletedCount = await withHeavyOperationLock(
      {
        key: buildHeavyOperationKey(["bimDelete", requester, projectId, sourceModelId || "all"]),
        inFlightMessage: "BIM elements cleanup is already running for this project.",
        rateWindowMs: HEAVY_OPERATION_LIMITS.bimDelete.windowMs,
        rateMax: HEAVY_OPERATION_LIMITS.bimDelete.max,
        rateMessage: "Too many BIM delete requests. Please retry later."
      },
      async () => clearProjectElements(projectId, sourceModelId)
    );

    console.log(
      `[bim/elements] uid=${requester} projectId=${projectId} sourceModelId=${sourceModelId || "all"} deleted=${deletedCount}`
    );

    return res.json({
      ok: true,
      projectId,
      sourceModelId: sourceModelId || null,
      deletedCount
    });
  } catch (error) {
    console.error("[bim/elements] Ошибка:", error);
    return res.status(error.status || 500).json({
      ok: false,
      error: error.status ? error.message : "Internal server error"
    });
  }
});

/**
 * Формирует текст отчёта в стиле технадзора
 */
function buildReportText(data) {
  const {
    project = "—",
    construction = "—",
    date = new Date().toISOString().slice(0, 10),
    engineer = "—",
    geo = { total: 0, exceeded: 0 },
    reinf = { total: 0, exceeded: 0 },
    geom = { total: 0, exceeded: 0 },
    strength = { total: 0, exceeded: 0 }
  } = data;

  const totalChecks = geo.total + reinf.total + geom.total + strength.total;
  const totalExceeded = geo.exceeded + reinf.exceeded + geom.exceeded + strength.exceeded;

  const modules = [
    { name: "Геодезия", total: geo.total, exceeded: geo.exceeded },
    { name: "Армирование", total: reinf.total, exceeded: reinf.exceeded },
    { name: "Геометрия", total: geom.total, exceeded: geom.exceeded },
    { name: "Прочность бетона", total: strength.total, exceeded: strength.exceeded }
  ];

  const getStatusText = (module) => {
    if (module.total === 0) return "Проверки не выполнялись";
    return module.exceeded > 0 ? "Выявлены отклонения" : "Соответствует требованиям";
  };

  let conclusionText = "";
  if (totalChecks === 0) {
    conclusionText = "Проверки по выбранному разделу не выполнялись. Для формирования окончательного заключения необходимо выполнить строительный контроль по установленному перечню параметров.";
  } else if (totalExceeded === 0) {
    conclusionText = "По результатам выполненных проверок отклонений, превышающих допустимые значения, не выявлено. Проверенные параметры соответствуют установленным требованиям проектной и нормативной документации.";
  } else {
    conclusionText = "По результатам выполненных проверок выявлены отклонения, превышающие допустимые значения. Требуется выполнение корректирующих мероприятий и проведение повторного контроля по выявленным замечаниям.";
  }

  const lines = [
    "ИТОГОВОЕ ЗАКЛЮЧЕНИЕ",
    "",
    "1. Общие сведения",
    `Объект: ${project}`,
    `Вид конструкций / раздел проверок: ${construction}`,
    `Дата формирования документа: ${date}`,
    `ФИО инженера: ${engineer}`,
    "Документ сформирован в системе «Технадзор онлайн».",
    "",
    "Основание:",
    "«Заключение сформировано по результатам проверок, выполненных в рамках строительного контроля (технического надзора) по объекту.»",
    "",
    "2. Результаты проверок"
  ];

  modules.forEach((module) => {
    lines.push(module.name);
    lines.push(`  Количество выполненных проверок: ${module.total}`);
    lines.push(`  Выявлено превышений: ${module.exceeded}`);
    lines.push(`  Статус: ${getStatusText(module)}`);
    lines.push("");
  });

  lines.push(`Итого количество выполненных проверок: ${totalChecks}`);
  lines.push(`Итого выявлено превышений: ${totalExceeded}`);
  lines.push("");
  lines.push("3. Итоговое заключение");
  lines.push(conclusionText);
  lines.push("");
  lines.push(`Инженер технического контроля: ${engineer}`);
  lines.push("Подпись: ____________");
  lines.push(`Дата: ${date}`);
  lines.push("Документ сформирован автоматически.");

  return lines.join("\n");
}

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, status: "running", port: PORT });
});

app.get("/profile-feed", async (req, res) => {
  try {
    const feed = await getProfileFeed();
    return res.json({
      ok: true,
      ...feed
    });
  } catch (error) {
    console.error("[profile-feed] Ошибка:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to load profile feed"
    });
  }
});

app.use((err, req, res, next) => {
  const syntaxError = err as SyntaxError & { status?: number };
  if (err instanceof SyntaxError && syntaxError.status === 400 && "body" in syntaxError) {
    return res.status(400).json({
      ok: false,
      error: "Invalid JSON body"
    });
  }

  if (err?.message === "Not allowed by CORS") {
    return res.status(403).json({
      ok: false,
      error: "CORS origin denied"
    });
  }

  console.error("[server] Unhandled middleware error:", err);
  return res.status(500).json({
    ok: false,
    error: "Internal server error"
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`\nСервер запущен на http://localhost:${PORT}`);
  console.log(`Endpoint: POST http://localhost:${PORT}/generateReport`);
  console.log(`Endpoint: POST http://localhost:${PORT}/bim/import-ifc`);
  console.log(`Endpoint: GET http://localhost:${PORT}/profile-feed`);
  console.log(`Health: GET http://localhost:${PORT}/health`);
  console.log(`AUTH_REQUIRED=${AUTH_REQUIRED}`);
  console.log(`ALLOWED_ORIGINS=${ALLOWED_ORIGINS.join(", ")}\n`);
});

export {};

