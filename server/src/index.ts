import { createDocumentUploader } from "./application/upload-document";
import { firebaseDocumentUploadPorts, downloadDocument } from "./repositories/document-repository";
import { BIM_DISPLAY_LABELS } from "./presentation/bim-labels";
import { createIfcImportService } from "./application/import-ifc";
import { buildReportText } from "./presentation/report-text";
/**
 * Локальный сервер для генерации ИИ-отчётов
 * Запуск: npm run dev
 */

import "dotenv/config";
import cors from "cors";
import express, { type Request, type Response } from "express";
import path from "node:path";
import { getLocalDevelopmentConfig } from "./infrastructure/local-development";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { initFirebaseAdmin } from "./infrastructure/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { ensureProjectAccess, clearProjectElements, publishProjectBimModel } from "./repositories/bim-repository";
import { reportRequestSchema, ifcImportQuerySchema, bimDeleteQuerySchema, documentUploadQuerySchema } from "./http-contract";
import { API_ROUTES } from "../../src/shared/api-routes";
import { createIfcWorkerPool } from "./services/ifc-worker-pool";
import { createHeavyOperationRunner } from "./services/heavy-operations";
import { withClientCancellation } from "./infrastructure/http-operation";
const ifcWorkers = createIfcWorkerPool();
const importIfc = createIfcImportService({
  parse: (bytes, options, signal) => ifcWorkers.parse(bytes, options, signal),
  save: publishProjectBimModel
});
import { getProfileFeed } from "./services/profile-feed";

const app = express();
const localDevelopment = getLocalDevelopmentConfig();
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
const heavyOperations = createHeavyOperationRunner({
  retentionMs: Math.max(60000, ...Object.values(HEAVY_OPERATION_LIMITS).map(limit => Number.isFinite(limit.windowMs) ? limit.windowMs : 30000))
});

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

function withHeavyOperationLock<T>(req: Request, res: Response, options: Parameters<typeof heavyOperations.run>[0], operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  return withClientCancellation(req, res, signal => heavyOperations.run(options, operation, signal));
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
    crossOriginResourcePolicy: { policy: "cross-origin" },
    ...(localDevelopment ? { contentSecurityPolicy: { directives: {
      "connect-src": ["'self'", "http://127.0.0.1:8085", "http://127.0.0.1:9099", "http://127.0.0.1:9199", "ws://127.0.0.1:8085"],
      "frame-src": ["'self'", "blob:"], "img-src": ["'self'", "data:", "blob:"],
      "upgrade-insecure-requests": null
    } } } : {})
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

const uploadDocument = createDocumentUploader(firebaseDocumentUploadPorts);
app.post(API_ROUTES.uploadDocument, ifcImportLimiter, requireFirebaseAuth, express.raw({ type: "application/octet-stream", limit: "20mb" }), async (req, res) => {
  // Private documents always require a verified identity, including local AUTH_REQUIRED=false mode.
  if (!req.user?.uid) return res.status(401).json({ ok: false, error: "AUTH_REQUIRED" });
  const parsed = documentUploadQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "DOCUMENT_INVALID_ID" });
  try {
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const result = await withHeavyOperationLock(req, res, { key: `document:${req.user.uid}:${parsed.data.projectId}`, rateWindowMs: 60000, rateMax: 5 },
      () => uploadDocument(parsed.data, req.user.uid, bytes));
    if (res.destroyed) return;
    return res.json(result);
  } catch (error) {
    if (res.destroyed) return;
    const status = Number(error?.status) || (String(error?.message || "").startsWith("PDF_") ? 422 : 500);
    return res.status(status).json({ ok: false, error: status === 500 ? "DOCUMENT_UPLOAD_FAILED" : error.message });
  }
});

app.get(API_ROUTES.downloadDocument, generateReportLimiter, requireFirebaseAuth, async (req, res) => {
  if (!req.user?.uid) return res.status(401).json({ ok: false, error: "AUTH_REQUIRED" });
  const parsed = documentUploadQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "DOCUMENT_INVALID_ID" });
  try {
    const result = await downloadDocument(parsed.data, req.user.uid);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.attachment(result.fileName).type("application/pdf").send(result.bytes);
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({ ok: false, error: status === 500 ? "DOCUMENT_DOWNLOAD_FAILED" : error.message });
  }
});

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

    const reportText = await withHeavyOperationLock(req, res,
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

    if (res.destroyed) return;
    return res.json({
      ok: true,
      text: reportText
    });
  } catch (error) {
    if (res.destroyed) return;
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

      const result = await withHeavyOperationLock(req, res,
        {
          key: buildHeavyOperationKey(["bimMutation", requester, projectId]),
          inFlightMessage: "IFC import is already running for this model.",
          rateWindowMs: HEAVY_OPERATION_LIMITS.ifcImport.windowMs,
          rateMax: HEAVY_OPERATION_LIMITS.ifcImport.max,
          rateMessage: "Too many IFC import requests. Please retry later."
        },
        async signal => {
          const result = await importIfc(projectId, req.body, { sourceModelId, fileName }, signal);
          return { ...result, countsByLabel: Object.fromEntries(Object.entries(result.countsByType).map(([type, count]) => [BIM_DISPLAY_LABELS[type] || type, count])) };

        }
      );

      if (res.destroyed) return;
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
      if (res.destroyed) return;
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

    const deletedCount = await withHeavyOperationLock(req, res,
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

    if (res.destroyed) return;
    return res.json({
      ok: true,
      projectId,
      sourceModelId: sourceModelId || null,
      deletedCount
    });
  } catch (error) {
    if (res.destroyed) return;
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

if (localDevelopment) {
  app.use(express.static(path.resolve(process.env.LOCAL_CLIENT_ROOT || "dist-local"), { dotfiles: "deny", index: "index.html" }));
}

// Запуск сервера
const httpServer = app.listen(PORT, localDevelopment ? "127.0.0.1" : "0.0.0.0", () => {
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

let shutdownPromise: Promise<void> | undefined;
function shutdown() {
  if (!shutdownPromise) shutdownPromise = (async () => {
    const httpClosed = new Promise<void>(resolve => httpServer.close(() => resolve()));
    // Abort queued/parsing work, but await persistence that crossed its commit boundary.
    try {
      await heavyOperations.close();
      await ifcWorkers.close();
    } finally {
      httpServer.closeAllConnections();
      await httpClosed;
    }
  })().catch(error => { console.error("[shutdown] Failed to drain operations:", error); process.exitCode = 1; });
  return shutdownPromise;
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

