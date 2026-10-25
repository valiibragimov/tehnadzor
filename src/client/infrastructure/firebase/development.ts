import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

// Selected only by build:local. Normal builds retain the configured Firebase composition.
if (typeof location !== "undefined" && !["127.0.0.1", "localhost"].includes(location.hostname)) {
  throw new Error("LOCAL_EMULATOR_CONFIG");
}
export const app = initializeApp({ apiKey: "demo-local-key", projectId: "demo-tehnadzor-approbation", authDomain: "localhost", storageBucket: "demo-tehnadzor-approbation.appspot.com" });
export const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
export const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8085);
