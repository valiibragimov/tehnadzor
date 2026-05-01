import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "__FIREBASE_WEB_API_KEY__",
  authDomain: "__FIREBASE_WEB_AUTH_DOMAIN__",
  projectId: "__FIREBASE_WEB_PROJECT_ID__",
  storageBucket: "__FIREBASE_WEB_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_WEB_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_WEB_APP_ID__"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export let db;

try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (err) {
  console.warn("[Firestore] IndexedDB persistence error:", err);
  db = getFirestore(app);
}
