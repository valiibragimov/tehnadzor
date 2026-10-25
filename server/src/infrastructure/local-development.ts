export function getLocalDevelopmentConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.LOCAL_FIREBASE_EMULATORS !== "true") return null;
  const projectId = String(env.FIREBASE_PROJECT_ID || "");
  const loopback = (value: string | undefined) => {
    const match = /^(127\.0\.0\.1|localhost):([0-9]+)$/u.exec(value || "");
    return !!match && Number(match[2]) > 0 && Number(match[2]) <= 65535;
  };
  if (!/^demo-[a-z0-9-]+$/u.test(projectId) || env.AUTH_REQUIRED === "false" ||
      !loopback(env.FIRESTORE_EMULATOR_HOST) || !loopback(env.FIREBASE_AUTH_EMULATOR_HOST) ||
      !loopback(env.FIREBASE_STORAGE_EMULATOR_HOST) ||
      env.FIREBASE_STORAGE_BUCKET !== `${projectId}.appspot.com`) {
    throw new Error("LOCAL_EMULATOR_CONFIG: authenticated demo project and loopback Auth, Firestore and Storage are required");
  }
  return { projectId };
}
