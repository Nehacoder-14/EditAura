(function () {
  "use strict";

  if (!window.EditAuraAuth) {
    console.error("[EditAura] auth.js did not load");
    window.location.replace("/");
    return;
  }

  const { requireAuth, logout, hashColor } = window.EditAuraAuth;
  const user = requireAuth("/");
  if (!user) return;

  const grid = document.getElementById("rooms-grid");
  const statusEl = document.getElementById("connection-status");
  const statRooms = document.getElementById("stat-rooms");
  const statOnline = document.getElementById("stat-online");
  const userNameEl = document.getElementById("user-name");
  const userAvatarEl = document.getElementById("user-avatar");
  const btnNew = document.getElementById("btn-new");
  const btnLogout = document.getElementById("btn-logout");
  const btnSwitch = document.getElementById("btn-switch");
  const modalOverlay = document.getElementById("modal-overlay");
  const createForm = document.getElementById("create-form");
  const createError = document.getElementById("create-error");

  userNameEl.textContent = user.username;
  userAvatarEl.textContent = user.avatar;
  userAvatarEl.style.boxShadow = `0 0 0 2px ${user.color}`;

  btnLogout.addEventListener("click", logout);
  btnSwitch.addEventListener("click", logout);

  /** @type {Map<string, { count: number, users: object[] }>} */
  const livePresence = new Map();
  /** @type {object[]} */
  let allWorkspaces = [];

  const socket = io({ transports: ["websocket", "polling"] });

  const userPayload = {
    id: user.id,
    userId: user.id,
    username: user.username,
    joinedAt: user.joinedAt,
    avatar: user.avatar,
    color: user.color,
  };

  function registerOnServer() {
    socket.emit("register-user", userPayload, (res) => {
      if (res?.error) {
        statusEl.textContent = res.error;
        statusEl.className = "connection-status err";
      }
    });
    socket.emit("register_user", userPayload);
  }

  socket.on("connect", () => {
    statusEl.textContent = "Connected — verifying…";
    statusEl.className = "connection-status";

    registerOnServer();

    socket.emit("ping", { ts: Date.now() }, (response) => {
      if (response?.event === "pong") {
        statusEl.textContent = "Live · Socket.IO ready";
        statusEl.className = "connection-status ok";
      }
    });

    loadWorkspaces();
  });

  socket.on("connect_error", () => {
    statusEl.textContent = "Could not reach server";
    statusEl.className = "connection-status err";
  });

  socket.on("disconnect", () => {
    statusEl.textContent = "Disconnected";
    statusEl.className = "connection-status err";
  });

  socket.on("global_online", ({ count, users }) => {
    statOnline.textContent = `${count} online`;
    renderOnlineHints(users);
  });

  socket.on("presence_update", ({ roomId, activeUsers, users }) => {
    if (!roomId) return;
    livePresence.set(roomId, {
      count: activeUsers,
      users: users || [],
    });
    updateCardPresence(roomId);
    refreshGlobalActive();
  });

  socket.on("workspace_created", (workspace) => {
    allWorkspaces = [workspace, ...allWorkspaces.filter((w) => w.id !== workspace.id)];
    renderWorkspaces();
  });

  socket.on("workspace_updated", (workspace) => {
    allWorkspaces = allWorkspaces.map((w) => (w.id === workspace.id ? { ...w, ...workspace } : w));
    renderWorkspaces();
  });

  socket.on("workspace_deleted", ({ id }) => {
    allWorkspaces = allWorkspaces.filter((w) => w.id !== id);
    livePresence.delete(id);
    renderWorkspaces();
  });

  btnNew.addEventListener("click", openModal);
  document.getElementById("btn-cancel").addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    createError.hidden = true;

    const name = document.getElementById("ws-name").value.trim();
    const language = document.getElementById("ws-lang").value;
    const description = document.getElementById("ws-desc").value.trim();

    if (name.length < 2) {
      createError.textContent = "Name must be at least 2 characters.";
      createError.hidden = false;
      return;
    }

    const btn = document.getElementById("btn-create");
    btn.disabled = true;
    btn.textContent = "Creating…";

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          language,
          description,
          createdBy: user.username,
          creatorId: user.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create workspace");

      allWorkspaces = [data.workspace, ...allWorkspaces];
      renderWorkspaces();
      closeModal();
      createForm.reset();
    } catch (err) {
      createError.textContent = err.message;
      createError.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Create workspace";
    }
  });

  async function loadWorkspaces() {
    try {
      const res = await fetch("/api/workspaces");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      allWorkspaces = data.workspaces || [];
      for (const ws of allWorkspaces) {
        if (ws.users?.length) {
          livePresence.set(ws.id, { count: ws.activeUsers || ws.users.length, users: ws.users });
        }
      }
      renderWorkspaces();
    } catch (err) {
      console.error(err);
      grid.innerHTML = `<p class="error-state">Failed to load workspaces. Is the server running?</p>`;
      statusEl.textContent = "API unreachable";
      statusEl.className = "connection-status err";
    }
  }

  function renderWorkspaces() {
    if (!allWorkspaces.length) {
      grid.innerHTML = `<p class="empty-state">No workspaces yet. Create one with <strong>+ New Workspace</strong>.</p>`;
      statRooms.textContent = "0 workspaces";
      return;
    }

    grid.innerHTML = allWorkspaces
      .map((ws, i) => {
        const presence = livePresence.get(ws.id);
        const live = presence?.count ?? ws.activeUsers ?? 0;
        const users = presence?.users ?? ws.users ?? [];
        const isLive = live > 0;

        return `
          <div class="card-wrap card-enter" style="--i:${i}">
            <article
              class="room-card"
              tabindex="0"
              role="button"
              data-room-id="${escapeHtml(ws.id)}"
            >
              <div class="card-inner">
                <div class="card-top">
                  <h2
                    class="card-title"
                    data-editable="true"
                    data-id="${escapeHtml(ws.id)}"
                    title="Double-click to rename"
                  >${escapeHtml(ws.name)}</h2>
                  <span class="lang-tag">${escapeHtml(ws.language)}</span>
                </div>
                <p class="card-meta">
                  by ${escapeHtml(ws.createdBy || "unknown")} · ${formatRelativeTime(ws.createdAt)}
                </p>
                <p class="card-desc">${escapeHtml(ws.description || "")}</p>
                <div class="card-users" data-users-for="${escapeHtml(ws.id)}">
                  ${renderUserAvatars(users)}
                </div>
                <div class="card-footer">
                  <span class="active-count ${isLive ? "live" : ""}" data-count-for="${escapeHtml(ws.id)}">
                    <span class="dot"></span>
                    <span data-count-text>${live} online</span>
                  </span>
                  <span class="join-hint">Enter →</span>
                </div>
              </div>
            </article>
          </div>`;
      })
      .join("");

    initTiltCards();
    bindCardClicks();
    bindRename();
    statRooms.textContent = `${allWorkspaces.length} workspaces`;
    refreshGlobalActive();
  }

  function renderUserAvatars(users) {
    if (!users.length) {
      return `<span class="no-users">No one here yet</span>`;
    }
    const max = 5;
    const shown = users.slice(0, max);
    const extra = users.length - max;
    return `
      <div class="avatar-stack">
        ${shown
          .map(
            (u) =>
              `<span class="mini-avatar" style="--c:${u.color || hashColor(u.username)}" title="${escapeHtml(u.username)}">${u.avatar || "👤"}</span>`
          )
          .join("")}
        ${extra > 0 ? `<span class="mini-avatar more">+${extra}</span>` : ""}
      </div>`;
    `;
  }

  function bindCardClicks() {
    grid.querySelectorAll(".room-card").forEach((card) => {
      const join = (e) => {
        if (e.target.closest("[data-editable]")) return;
        const roomId = card.dataset.roomId;
        window.location.href = `/room/${encodeURIComponent(roomId)}`;
      };
      card.addEventListener("click", join);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          join(e);
        }
      });
    });
  }

  function bindRename() {
    grid.querySelectorAll("[data-editable]").forEach((el) => {
      el.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const id = el.dataset.id;
        const current = el.textContent;
        const input = document.createElement("input");
        input.className = "card-title-input";
        input.value = current;
        el.replaceWith(input);
        input.focus();
        input.select();

        const save = async () => {
          const name = input.value.trim();
          if (name.length < 2 || name === current) {
            renderWorkspaces();
            return;
          }
          try {
            const res = await fetch(`/api/workspaces/${encodeURIComponent(id)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            allWorkspaces = allWorkspaces.map((w) =>
              w.id === id ? { ...w, ...data.workspace } : w
            );
          } catch (err) {
            alert(err.message);
          }
          renderWorkspaces();
        };

        input.addEventListener("blur", save);
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            input.blur();
          }
          if (ev.key === "Escape") renderWorkspaces();
        });
      });
    });
  }

  function updateCardPresence(roomId) {
    const presence = livePresence.get(roomId);
    if (!presence) return;

    const countEl = grid.querySelector(`[data-count-for="${roomId}"]`);
    if (countEl) {
      countEl.querySelector("[data-count-text]").textContent = `${presence.count} online`;
      countEl.classList.toggle("live", presence.count > 0);
    }

    const usersEl = grid.querySelector(`[data-users-for="${roomId}"]`);
    if (usersEl) usersEl.innerHTML = renderUserAvatars(presence.users);
  }

  function refreshGlobalActive() {
    let total = 0;
    livePresence.forEach((p) => {
      total += p.count;
    });
    if (total > 0 && !statOnline.textContent.includes("online")) {
      /* global_online handles platform-wide count */
    }
  }

  function renderOnlineHints(users) {
    /* stat updated via global_online */
  }

  function openModal() {
    modalOverlay.hidden = false;
    document.getElementById("ws-name").focus();
  }

  function closeModal() {
    modalOverlay.hidden = true;
    createError.hidden = true;
  }

  function initTiltCards() {
    const maxTilt = 10;
    grid.querySelectorAll(".room-card").forEach((card) => {
      card.addEventListener("mousemove", (e) => {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        card.style.setProperty("--mx", `${px * 100}%`);
        card.style.setProperty("--my", `${py * 100}%`);
        card.style.transform = `rotateX(${(0.5 - py) * maxTilt * 2}deg) rotateY(${(px - 0.5) * maxTilt * 2}deg) scale(1.02)`;
      });
      card.addEventListener("mouseleave", () => {
        card.style.transform = "";
      });
    });
  }

  function formatRelativeTime(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
