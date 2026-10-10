import { BIM_DISPLAY_LABELS } from "./presentation/bim-labels";
import { createIfcImportService } from "./application/import-ifc";
import { buildReportText } from "./presentation/report-text";
/**
 * Локальный сервер для генерации ИИ-отчётов
 * Запуск: npm run dev
 */

import "dotenv/config";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { initFirebaseAdmin } from "./infrastructure/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { ensureProjectAccess, clearProjectElements, writeImportedElements, clearExistingElementsBySourceModelId } from "./repositories/bim-repository";
import { reportRequestSchema, ifcImportQuerySchema, bimDeleteQuerySchema } from "./http-contract";
import { API_ROUTES } from "../../src/shared/api-routes";
import { createIfcWorkerPool } from "./services/ifc-worker-pool";
const ifcWorkers = createIfcWorkerPool();
const importIfc = createIfcImportService({
  parse: (bytes, options) => ifcWorkers.parse(bytes, options),
  async save(projectId, model) {
    const writtenCount = await writeImportedElements(projectId, model.elements);
    const removedCount = await clearExistingElementsBySourceModelId(projectId, model.sourceModelId, model.elements.map(element => element.elementId));
    return { writtenCount, removedCount };
  }
});
import { getProfileFeed } from "./services/profile-feed";

const app = express();
const PORT = Number(process.env.PORT || 5050);
const BODY_LIMIT = process.env.BODY_LIMIT || "100kb";
const IFC_IMPORT_BODY_LIMIT = process.env.IFC_IMPORT_BODY_LIMIT || "25mb";
const AUTH_REQUIRED = process.env.AUTH_REQUIRED !== "false";

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
app.post(API_ROUTES.generateReport, generateReportLimiter, requireFirebaseAuth, async (req, res) => {
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
  API_ROUTES.importIfc,
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
          key: buildHeavyOperationKey(["bimMutation", requester, projectId]),
          inFlightMessage: "IFC import is already running for this model.",
          rateWindowMs: HEAVY_OPERATION_LIMITS.ifcImport.windowMs,
          rateMax: HEAVY_OPERATION_LIMITS.ifcImport.max,
          rateMessage: "Too many IFC import requests. Please retry later."
        },
        async () => {
          const result = await importIfc(projectId, req.body, { sourceModelId, fileName });
          return { ...result, countsByLabel: Object.fromEntries(Object.entries(result.countsByType).map(([type, count]) => [BIM_DISPLAY_LABELS[type] || type, count])) };

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

app.delete(API_ROUTES.deleteBimElements, ifcImportLimiter, requireFirebaseAuth, async (req, res) => {
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
        key: buildHeavyOperationKey(["bimMutation", requester, projectId]),
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

// Health check
app.get(API_ROUTES.health, (req, res) => {
  res.json({ ok: true, status: "running", port: PORT });
});

app.get(API_ROUTES.profileFeed, async (req, res) => {
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

  if (err?.status === 413) return res.status(413).json({ ok: false, error: "Request body exceeds configured size limit" });
  if (err?.status === 415) return res.status(415).json({ ok: false, error: "Unsupported content encoding" });
  console.error("[server] Unhandled middleware error:", err);
  return res.status(500).json({
    ok: false,
    error: "Internal server error"
  });
});

// Запуск сервера
const httpServer = app.listen(PORT, () => {
  const address = httpServer.address();
  console.log(`[startup] listeningPort=${typeof address === "object" && address ? address.port : PORT}`);
  const port = typeof address === "object" && address ? address.port : PORT;
  console.log(`Tehnadzor API listening on port ${port}`);
  for (const operation of ["health", "generateReport", "importIfc", "deleteBimElements", "profileFeed"] as const) {
    console.log(`[route] ${operation}=${API_ROUTES[operation]}`);
  }
  console.log(`AUTH_REQUIRED=${AUTH_REQUIRED}`);
  console.log(`ALLOWED_ORIGINS=${ALLOWED_ORIGINS.join(", ")}\n`);
});

async function shutdown() {
  httpServer.close();
  await ifcWorkers.close();
  httpServer.closeAllConnections();
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

