import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

import { logoutUser } from "../auth.js";

interface AuthBootstrapOptions {
  auth: any;
  pendingWelcomeKey: string;
  pendingWelcomeNewUser: string;
  setCurrentUserId: (uid: string | null) => void;
  loadCurrentUserEngineerName: (uid: string) => Promise<unknown>;
  clearCurrentUserContext: () => void;
  loadProjects: () => Promise<unknown> | unknown;
  setCurrentProjectId: (projectId: string | null) => unknown;
  setModulesEnabled: (enabled: boolean) => void;
}

interface StaticBootstrapOptions {
  regulatoryDocs: Record<string, string>;
  showNotification: (message: string, tone?: string) => void;
}

export function showWelcomeAnimation(titleText = "С возвращением!") {
  const welcomeEl = document.getElementById("welcomeAnimation");
  const welcomeTitleEl = welcomeEl?.querySelector(".welcome-title");
  if (!welcomeEl) return;

  if (welcomeTitleEl) {
    welcomeTitleEl.textContent = titleText;
  }

  welcomeEl.classList.remove("hidden", "fade-out");
  welcomeEl.style.opacity = "1";
  welcomeEl.style.transform = "scale(1)";

  setTimeout(() => {
    welcomeEl.classList.add("fade-out");
  }, 1800);

  setTimeout(() => {
    welcomeEl.classList.add("hidden");
    welcomeEl.classList.remove("fade-out");
  }, 2400);
}

export function initAuthBootstrap({
  auth,
  pendingWelcomeKey,
  pendingWelcomeNewUser,
  setCurrentUserId,
  loadCurrentUserEngineerName,
  clearCurrentUserContext,
  loadProjects,
  setCurrentProjectId,
  setModulesEnabled
}: AuthBootstrapOptions) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      setCurrentUserId(user.uid);
      console.log("Пользователь авторизован:", user.uid);
      await loadCurrentUserEngineerName(user.uid);

      const justLoggedIn = sessionStorage.getItem("just_logged_in") === "true";
      const pendingWelcome = localStorage.getItem(pendingWelcomeKey);
      if (justLoggedIn || pendingWelcome === pendingWelcomeNewUser) {
        const welcomeTitle =
          pendingWelcome === pendingWelcomeNewUser ? "Добро пожаловать!" : "С возвращением!";
        showWelcomeAnimation(welcomeTitle);
        sessionStorage.removeItem("just_logged_in");
        localStorage.removeItem(pendingWelcomeKey);
      }

      await loadProjects();
      return;
    }

    setCurrentUserId(null);
    setCurrentProjectId(null);
    clearCurrentUserContext();
    setModulesEnabled(false);

    if (
      window.location.pathname.endsWith("index.html") ||
      window.location.pathname === "/" ||
      window.location.pathname === ""
    ) {
      window.location.href = "login.html";
    }
  });
}

export function initStaticBootstrap({ regulatoryDocs, showNotification }: StaticBootstrapOptions) {
  const bindStaticUi = () => {
    const linkSP70 = document.getElementById("linkSP70") as HTMLAnchorElement | null;
    const linkSP126 = document.getElementById("linkSP126") as HTMLAnchorElement | null;
    const linkGOSTR57997 = document.getElementById("linkGOSTR57997") as HTMLAnchorElement | null;
    const linkSP70Reinf = document.getElementById("linkSP70Reinf") as HTMLAnchorElement | null;

    if (linkSP70) linkSP70.href = regulatoryDocs.SP_70_13330_2012;
    if (linkSP126) linkSP126.href = regulatoryDocs.SP_126_13330_2017;
    if (linkGOSTR57997) linkGOSTR57997.href = regulatoryDocs.GOST_R_57997_2017;
    if (linkSP70Reinf) linkSP70Reinf.href = regulatoryDocs.SP_70_13330_2012;

    const logoutBtn = document.getElementById("btnLogout");
    if (!logoutBtn) return;

    logoutBtn.addEventListener("click", async () => {
      try {
        await logoutUser();
        window.location.href = "login.html";
      } catch (error) {
        console.error("Logout error:", error);
        showNotification("Ошибка выхода. Проверь консоль.", "error");
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindStaticUi, { once: true });
  } else {
    bindStaticUi();
  }
}
