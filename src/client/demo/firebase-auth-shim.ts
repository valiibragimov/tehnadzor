import { DEMO_USER } from "./runtime-context.js";

export const demoAuth = {
  currentUser: DEMO_USER
};

export function getAuth() {
  return demoAuth;
}

export function onAuthStateChanged(
  _auth: typeof demoAuth,
  callback: (user: typeof DEMO_USER) => void
) {
  queueMicrotask(() => callback(DEMO_USER));
  return () => undefined;
}
