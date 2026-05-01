interface UserProfileSnapshot {
  exists: () => boolean;
  data: () => Record<string, unknown> | undefined;
}

interface ProfileRuntimeOptions {
  headerProfileButton?: Element | null;
  headerProfileAvatar?: HTMLImageElement | null;
  getUserDocSnapshot: (uid: string) => Promise<UserProfileSnapshot>;
}

function formatEngineerName(firstName: unknown, lastName: unknown) {
  const first = String(firstName || "").trim();
  const last = String(lastName || "").trim();
  if (last && first) return `${last} ${first}`;
  return last || first || "";
}

export function createProfileRuntime({
  headerProfileButton,
  headerProfileAvatar,
  getUserDocSnapshot
}: ProfileRuntimeOptions) {
  let currentEngineerName = "";

  const publishEngineerName = (value: string) => {
    currentEngineerName = value;
    globalThis.currentUserEngineerName = value;
  };

  const setHeaderProfileAvatar = (dataUrl = "") => {
    const normalized = String(dataUrl || "").trim();
    if (headerProfileAvatar) {
      headerProfileAvatar.src = normalized;
      headerProfileAvatar.hidden = !normalized;
    }
    if (headerProfileButton) {
      headerProfileButton.classList.toggle("has-avatar", !!normalized);
    }
  };

  const clearCurrentUserContext = () => {
    publishEngineerName("");
    setHeaderProfileAvatar("");
  };

  const loadCurrentUserEngineerName = async (uid: string | null | undefined) => {
    if (!uid) {
      clearCurrentUserContext();
      return;
    }

    try {
      const snap = await getUserDocSnapshot(uid);
      if (!snap.exists()) {
        clearCurrentUserContext();
        return;
      }

      const data = snap.data() || {};
      publishEngineerName(formatEngineerName(data.firstName, data.lastName));
      setHeaderProfileAvatar(String(data.avatarDataUrl || ""));
    } catch (error) {
      console.warn("loadCurrentUserEngineerName error", error);
      clearCurrentUserContext();
    }
  };

  return {
    clearCurrentUserContext,
    getCurrentEngineerName: () => currentEngineerName,
    getEngineerValue: (fallback = "") => currentEngineerName || fallback || "",
    loadCurrentUserEngineerName
  };
}
