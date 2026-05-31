import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";

const CURSOR_COLORS = [
  "#3dff8a",
  "#ff6b9d",
  "#6bc5ff",
  "#ffc857",
  "#b388ff",
  "#ff8a65",
  "#80cbc4",
  "#f48fb1",
];

function hashColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(h) % CURSOR_COLORS.length];
}

function computeDiff(oldText, newText) {
  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
    start++;
  }
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  return { start, deleteCount: oldEnd - start, insert: newText.slice(start, newEnd) };
}

function bindTextarea(textarea, ytext, ydoc) {
  let syncing = false;

  const applyRemote = () => {
    const remote = ytext.toString();
    if (remote === textarea.value) return;
    const selStart = textarea.selectionStart;
    const selEnd = textarea.selectionEnd;
    syncing = true;
    textarea.value = remote;
    const len = remote.length;
    textarea.selectionStart = Math.min(selStart, len);
    textarea.selectionEnd = Math.min(selEnd, len);
    syncing = false;
  };

  ytext.observe(applyRemote);
  applyRemote();

  textarea.addEventListener("input", () => {
    if (syncing) return;
    const oldText = ytext.toString();
    const newText = textarea.value;
    if (oldText === newText) return;
    const { start, deleteCount, insert } = computeDiff(oldText, newText);
    ydoc.transact(() => {
      if (deleteCount > 0) ytext.delete(start, deleteCount);
      if (insert.length > 0) ytext.insert(start, insert);
    });
  });
}

function measureTextareaPosition(textarea, index) {
  const mirror = document.createElement("div");
  const style = getComputedStyle(textarea);
  const props = [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "boxSizing",
    "whiteSpace",
    "wordWrap",
    "overflowWrap",
    "tabSize",
  ];
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.width = `${textarea.clientWidth}px`;
  props.forEach((p) => {
    mirror.style[p] = style[p];
  });

  const text = textarea.value.substring(0, index);
  mirror.textContent = text || "\u200b";
  const span = document.createElement("span");
  span.textContent = textarea.value[index] || ".";
  mirror.appendChild(span);

  document.body.appendChild(mirror);
  const spanRect = span.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  document.body.removeChild(mirror);

  return {
    top: spanRect.top - mirrorRect.top - textarea.scrollTop,
    left: spanRect.left - mirrorRect.left - textarea.scrollLeft,
  };
}

function initCursors(textarea, awareness, localClientId) {
  const layer = document.getElementById("cursor-layer");
  const markers = new Map();

  const render = () => {
    layer.innerHTML = "";
    const states = awareness.getStates();

    states.forEach((state, clientId) => {
      if (clientId === localClientId || !state?.cursor || !state?.user?.name) return;

      const { anchor, head } = state.cursor;
      const pos = measureTextareaPosition(textarea, head);
      const color = state.user.color || "#3dff8a";

      const el = document.createElement("div");
      el.className = "remote-cursor";
      el.style.top = `${pos.top}px`;
      el.style.left = `${pos.left}px`;
      el.style.borderColor = color;

      const label = document.createElement("span");
      label.className = "remote-cursor-label";
      label.style.background = color;
      label.textContent = state.user.name;
      el.appendChild(label);

      if (anchor !== head) {
        const sel = document.createElement("div");
        sel.className = "remote-selection";
        sel.style.background = color;
        const startPos = measureTextareaPosition(textarea, Math.min(anchor, head));
        const endPos = measureTextareaPosition(textarea, Math.max(anchor, head));
        sel.style.top = `${startPos.top}px`;
        sel.style.left = `${startPos.left}px`;
        sel.style.width = `${Math.max(2, endPos.left - startPos.left)}px`;
        sel.style.height = `${endPos.top - startPos.top + 18}px`;
        layer.appendChild(sel);
      }

      layer.appendChild(el);
      markers.set(clientId, el);
    });
  };

  awareness.on("change", render);
  textarea.addEventListener("scroll", render);
  textarea.addEventListener("keyup", render);
  textarea.addEventListener("click", render);
  return render;
}

async function boot() {
  const pathMatch = window.location.pathname.match(/\/room\/([^/]+)/);
  const params = new URLSearchParams(window.location.search);
  const roomId =
    (pathMatch && decodeURIComponent(pathMatch[1])) ||
    params.get("room") ||
    window.__ROOM_ID__;
  if (!roomId) {
    document.body.innerHTML = "<p class='error-state'>Missing room id.</p>";
    return;
  }

  const auth = globalThis.EditAuraAuth;
  if (!auth?.getUser()) {
    window.location.href = "/";
    return;
  }
  const user = auth.getUser();

  const configRes = await fetch("/api/config");
  const config = configRes.ok ? await configRes.json() : { yjsWsUrl: "ws://localhost:1234" };

  const socket = io({ transports: ["websocket", "polling"] });

  const ydoc = new Y.Doc();
  const ytext = ydoc.getText("source");
  const meta = ydoc.getMap("meta");

  const indexeddb = new IndexeddbPersistence(roomId, ydoc);
  const wsProvider = new WebsocketProvider(config.yjsWsUrl, roomId, ydoc, {
    connect: true,
    maxBackoffTime: 5000,
  });

  const awareness = wsProvider.awareness;
  awareness.setLocalStateField("user", {
    name: user.username,
    color: user.color,
    avatar: user.avatar,
  });

  const textarea = document.getElementById("editor");
  const syncBadge = document.getElementById("sync-status");
  const usersList = document.getElementById("users-list");
  const roomTitle = document.getElementById("room-title");
  const roomLang = document.getElementById("room-lang");

  bindTextarea(textarea, ytext, ydoc);

  const pushCursor = () => {
    awareness.setLocalStateField("cursor", {
      anchor: textarea.selectionStart,
      head: textarea.selectionEnd,
    });
  };

  textarea.addEventListener("keyup", pushCursor);
  textarea.addEventListener("click", pushCursor);
  textarea.addEventListener("select", pushCursor);

  const renderCursors = initCursors(textarea, awareness, awareness.clientID);
  pushCursor();
  renderCursors();

  /** @type {Map<string, { name: string, color: string }>} */
  const socketUsers = new Map();

  function renderUsers() {
    const awarenessUsers = [];
    awareness.getStates().forEach((state) => {
      if (state?.user?.name) awarenessUsers.push(state.user);
    });

    const merged = new Map();
    socketUsers.forEach((u, id) => merged.set(id, u));
    awarenessUsers.forEach((u) => merged.set(u.name, u));

    usersList.innerHTML = [...merged.values()]
      .map(
        (u) =>
          `<li><span class="user-dot" style="background:${u.color || hashColor(u.name)}">${u.avatar || "👤"}</span>${escapeHtml(u.name)}</li>`
      )
      .join("");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  awareness.on("change", () => {
    pushCursor();
    renderCursors();
    renderUsers();
  });

  wsProvider.on("status", ({ status }) => {
    syncBadge.textContent =
      status === "connected"
        ? "Synced"
        : status === "connecting"
          ? "Connecting…"
          : "Offline — reconnecting";
    syncBadge.className = `sync-badge ${status === "connected" ? "ok" : "warn"}`;
  });

  indexeddb.on("synced", () => {
    if (!ytext.length && meta.get("language")) {
      // local cache empty; server seed will arrive via websocket
    }
  });

  function joinWorkspace() {
    socket.emit("join_room", { roomId }, (res) => {
      if (res?.error) {
        syncBadge.textContent = res.error;
        syncBadge.className = "sync-badge err";
        return;
      }
      if (res?.ok && res.workspace) {
        roomTitle.textContent = res.workspace.name;
        roomLang.textContent = res.workspace.language;
        meta.set("language", res.workspace.language);
      }
      renderUsers();
    });
  }

  const socketUser = {
    id: user.id,
    userId: user.id,
    username: user.username,
    joinedAt: user.joinedAt,
    avatar: user.avatar,
    color: user.color,
  };

  function registerAndJoin() {
    socket.emit("register-user", socketUser, (res) => {
      if (res?.error) {
        syncBadge.textContent = res.error;
        syncBadge.className = "sync-badge err";
        return;
      }
      joinWorkspace();
    });
  }

  socket.on("connect", registerAndJoin);
  if (socket.connected) registerAndJoin();

  socket.on("room_users", ({ roomId: rid, users }) => {
    if (rid !== roomId) return;
    socketUsers.clear();
    users.forEach((u) => {
      socketUsers.set(u.userId || u.socketId, {
        name: u.username,
        color: u.color || hashColor(u.username),
        avatar: u.avatar,
      });
    });
    renderUsers();
  });

  socket.on("presence_update", ({ roomId: rid, activeUsers }) => {
    if (rid === roomId) {
      document.getElementById("active-count").textContent = `${activeUsers} active`;
    }
  });

  window.addEventListener("beforeunload", () => {
    socket.emit("leave_room", { roomId });
    wsProvider.destroy();
    indexeddb.destroy();
    ydoc.destroy();
  });

  document.getElementById("btn-leave")?.addEventListener("click", () => {
    window.location.href = "/dashboard";
  });

  try {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(roomId)}`);
    if (res.ok) {
      const { workspace } = await res.json();
      roomTitle.textContent = workspace.name;
      roomLang.textContent = workspace.language;
    }
  } catch {
    /* optional */
  }
}

boot().catch((err) => {
  console.error(err);
  document.getElementById("sync-status").textContent = "Failed to start editor";
});
