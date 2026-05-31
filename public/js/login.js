(function () {
  "use strict";

  function showError(msg) {
    const el = document.getElementById("username-error");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  if (!window.EditAuraAuth) {
    showError("Auth module failed to load. Refresh the page.");
    return;
  }

  const { getUser, saveUser, EMOJIS, hashColor } = window.EditAuraAuth;

  if (getUser()) {
    window.location.replace("/dashboard");
    return;
  }

  const form = document.getElementById("login-form");
  const usernameInput = document.getElementById("username");
  const usernameError = document.getElementById("username-error");
  const emojiGrid = document.getElementById("emoji-grid");
  const submitBtn = document.getElementById("btn-enter");

  let selectedAvatar = EMOJIS[0];

  EMOJIS.forEach((emoji, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-btn" + (i === 0 ? " selected" : "");
    btn.textContent = emoji;
    btn.addEventListener("click", () => {
      selectedAvatar = emoji;
      emojiGrid.querySelectorAll(".emoji-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
    emojiGrid.appendChild(btn);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    usernameError.hidden = true;

    const username = usernameInput.value.trim();
    if (username.length < 2) {
      showError("Username must be at least 2 characters.");
      usernameInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";

    try {
      saveUser({
        username,
        avatar: selectedAvatar,
        color: hashColor(username),
      });
      window.location.href = "/dashboard";
    } catch (err) {
      showError(err.message || "Could not save your profile.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Continue to dashboard";
    }
  });
})();
