export const DEMO_STORAGE_NAMESPACE = "tehnadzor-demo:v2:";
export const DEMO_DATABASE_KEY = `${DEMO_STORAGE_NAMESPACE}database`;
export const DEMO_PROJECT_ID = "demo-project";
export const DEMO_USER_ID = "demo-user";

export const DEMO_USER = Object.freeze({
  uid: DEMO_USER_ID,
  email: "demo@local.invalid",
  displayName: "Демо-инженер",
  photoURL: null
});

export function isDemoRuntime() {
  return true;
}
