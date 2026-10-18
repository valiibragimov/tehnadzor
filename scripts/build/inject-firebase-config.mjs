import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");
const envPath = resolve(projectRoot, ".env");
const firebaseDistPath = resolve(projectRoot, "dist", "firebase.js");

const firebaseEnvKeys = [
  "FIREBASE_WEB_API_KEY",
  "FIREBASE_WEB_AUTH_DOMAIN",
  "FIREBASE_WEB_PROJECT_ID",
  "FIREBASE_WEB_STORAGE_BUCKET",
  "FIREBASE_WEB_MESSAGING_SENDER_ID",
  "FIREBASE_WEB_APP_ID"
];

function parseDotenvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex === -1) return null;

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return key ? [key, value] : null;
}

async function loadDotenv() {
  if (!existsSync(envPath)) return {};

  const env = {};
  const raw = await readFile(envPath, "utf8");
  for (const line of raw.split(/\r?\n/u)) {
    const parsed = parseDotenvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    env[key] = value;
  }
  return env;
}

const dotenv = await loadDotenv();
const restoreLocal = process.argv.includes("--restore-local");
const environment = restoreLocal ? {} : process.env;
if (restoreLocal && firebaseEnvKeys.some(key => !dotenv[key] || /^(?:demo(?:-|\.)|__|your[-_]|replace[-_])/iu.test(dotenv[key]))) {
  console.log("[firebase-config] No complete local configuration to restore.");
  process.exit(0);
}
const missingKeys = firebaseEnvKeys.filter((key) => !(environment[key] || dotenv[key]));

if (!existsSync(envPath) && !environment.FIREBASE_WEB_API_KEY) {
  throw new Error(
    "[firebase-config] Missing Firebase web config. Copy .env.example to .env " +
      "and fill FIREBASE_WEB_* values from Firebase Console, or provide them as environment variables."
  );
}

if (missingKeys.length > 0) {
  throw new Error(
    `[firebase-config] Missing required Firebase web config: ${missingKeys.join(", ")}. ` +
      "Fill .env from .env.example before running the client build."
  );
}

// Synthetic CI configuration must never silently become a working login build.
const testConfig = environment.FIREBASE_CONFIG_MODE === "test";
const projectId = environment.FIREBASE_WEB_PROJECT_ID || dotenv.FIREBASE_WEB_PROJECT_ID;
if (testConfig && !projectId.startsWith("demo-")) {
  throw new Error("[firebase-config] Test configuration requires a demo- project ID.");
}
const placeholderKeys = firebaseEnvKeys.filter((key) =>
  /^(?:demo(?:-|\.)|__|your[-_]|replace[-_])/iu.test(environment[key] || dotenv[key])
);
if (!testConfig && placeholderKeys.length > 0) {
  throw new Error(
    `[firebase-config] Placeholder Firebase web config: ${placeholderKeys.join(", ")}. ` +
    "Use the existing Firebase Console web configuration. Synthetic CI builds require FIREBASE_CONFIG_MODE=test."
  );
}

let firebaseJs = await readFile(firebaseDistPath, "utf8");

const configFields = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
for (const [index, key] of firebaseEnvKeys.entries()) {
  const placeholder = `__${key}__`;
  const value = environment[key] || dotenv[key];
  if (restoreLocal) {
    const field = new RegExp(`(\\b${configFields[index]}\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`);
    firebaseJs = firebaseJs.replace(field, (_match, prefix) => prefix + JSON.stringify(value));
  } else {
    firebaseJs = firebaseJs.replaceAll(JSON.stringify(placeholder), JSON.stringify(value));
  }
}

await writeFile(firebaseDistPath, firebaseJs, "utf8");

console.log(restoreLocal ? "[firebase-config] Local login configuration restored." : "[firebase-config] Firebase web config injected from environment.");
