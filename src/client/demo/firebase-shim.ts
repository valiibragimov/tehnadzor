import { demoAuth } from "./firebase-auth-shim.js";

export const app = Object.freeze({ name: "tehnadzor-demo" });
export const auth = demoAuth;
export const db = Object.freeze({ kind: "local-demo-adapter" });
