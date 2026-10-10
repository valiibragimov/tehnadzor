import fs from "node:fs";
import path from "node:path";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
const LOCAL_SERVICE_ACCOUNT_FILE = "serviceAccount.local.json";

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

export function initFirebaseAdmin(): FirebaseAdminInitResult {
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
