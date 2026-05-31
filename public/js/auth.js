(function (global) {
  "use strict";

  const STORAGE_KEY = "editaura_user";
  const LEGACY_KEY = "editaura-user";
  const EMOJIS = ["🧑‍💻", "🦊", "🐙", "🚀", "⚡", "🎨", "🔮", "🌿", "🎯", "🛸", "🐱", "🦉"];
  const COLORS = [
    "#3dff8a",
    "#ff6b9d",
    "#6bc5ff",
    "#ffc857",
    "#b388ff",
    "#ff8a65",
    "#80cbc4",
    "#f48fb1",
  ];

  function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "u_" + Math.random().toString(36).slice(2, 12);
  }

  function hashColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    return COLORS[Math.abs(h) % COLORS.length];
  }

  /** Normalize stored shapes (legacy + current) into one format. */
  function normalize(raw) {
    if (!raw || typeof raw !== "object") return null;

    const id = raw.id || raw.userId;
    const username = String(raw.username || "").trim();
    if (!id || username.length < 2) return null;

    return {
      id: String(id),
      userId: String(id),
      username,
      joinedAt: raw.joinedAt || raw.joined_at || new Date().toISOString(),
      avatar: raw.avatar || EMOJIS[0],
      color: raw.color || hashColor(username),
    };
  }

  function migrateLegacy() {
    try {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (!legacy) return;
      const user = normalize(JSON.parse(legacy));
      if (user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      }
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      localStorage.removeItem(LEGACY_KEY);
    }
  }

  function getUser() {
    migrateLegacy();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return normalize(JSON.parse(raw));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function saveUser({ username, avatar, color }) {
    const name = String(username || "").trim();
    if (name.length < 2) {
      throw new Error("Username must be at least 2 characters");
    }

    const user = {
      id: generateId(),
      username: name,
      joinedAt: new Date().toISOString(),
      avatar: avatar || EMOJIS[0],
      color: color || hashColor(name),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    return { ...user, userId: user.id };
  }

  function setUser(partial) {
    const current = getUser();
    const name = String(partial.username ?? current?.username ?? "").trim();
    if (name.length < 2) throw new Error("Username must be at least 2 characters");

    const user = {
      id: partial.id || current?.id || generateId(),
      username: name,
      joinedAt: current?.joinedAt || new Date().toISOString(),
      avatar: partial.avatar ?? current?.avatar ?? EMOJIS[0],
      color: partial.color ?? current?.color ?? hashColor(name),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    return { ...user, userId: user.id };
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
    window.location.href = "/";
  }

  function requireAuth(redirectTo) {
    const user = getUser();
    if (!user) {
      window.location.replace(redirectTo || "/");
      return null;
    }
    return user;
  }

  global.EditAuraAuth = {
    STORAGE_KEY,
    EMOJIS,
    COLORS,
    getUser,
    saveUser,
    setUser,
    logout,
    requireAuth,
    generateId,
    hashColor,
  };
})(window);
