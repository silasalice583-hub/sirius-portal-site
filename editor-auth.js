(function () {
  const body = document.body;
  const editorLabel = body.dataset.editorLabel || "网站编辑器";
  const editorScript = body.dataset.editorScript || "";
  let localMode = false;
  const localTokenKey = "siriusLocalEditorAuthToken";
  let challengeId = "";

  const gate = document.createElement("main");
  gate.className = "editor-auth-gate";
  gate.setAttribute("aria-labelledby", "editorAuthTitle");
  gate.innerHTML = `
    <section class="editor-auth-card">
      <a class="editor-auth-brand" href="index.html">
        <img src="assets/logo-vector-web.png" alt="天狼星之光 logo" />
        <span>天狼星之光</span>
      </a>
      <p class="eyebrow">Private Editor</p>
      <h1 id="editorAuthTitle"></h1>
      <p class="editor-auth-intro">请先验证管理密码。密码正确后，系统会向指定邮箱发送六位数字验证码。</p>
      <form id="editorPasswordForm" class="editor-auth-form">
        <label>管理密码
          <input id="editorPassword" type="password" autocomplete="current-password" required />
        </label>
        <button type="submit">验证密码并发送验证码</button>
      </form>
      <form id="editorCodeForm" class="editor-auth-form" hidden>
        <p id="editorCodeHint" class="editor-auth-code-hint"></p>
        <label>六位验证码
          <input id="editorCode" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required />
        </label>
        <button type="submit">登录并进入编辑器</button>
        <button id="editorAuthRestart" class="secondary-action" type="button">重新验证密码</button>
      </form>
      <p class="editor-auth-status" id="editorAuthStatus" role="status" aria-live="polite">正在检查登录状态…</p>
      <a class="editor-auth-back" href="index.html">返回网站首页</a>
    </section>
  `;
  body.prepend(gate);
  gate.querySelector("#editorAuthTitle").textContent = `${editorLabel}登录`;

  const passwordForm = gate.querySelector("#editorPasswordForm");
  const codeForm = gate.querySelector("#editorCodeForm");
  const passwordInput = gate.querySelector("#editorPassword");
  const codeInput = gate.querySelector("#editorCode");
  const codeHint = gate.querySelector("#editorCodeHint");
  const status = gate.querySelector("#editorAuthStatus");
  const passwordSubmit = passwordForm.querySelector('button[type="submit"]');

  function enableLocalMode() {
    localMode = true;
    window.SIRIUS_USE_SAME_ORIGIN_API = false;
    gate.querySelector(".editor-auth-intro").textContent =
      "本地模式只需输入管理密码，不发送邮件验证码。";
    passwordSubmit.textContent = "验证密码并进入编辑器";
  }

  async function isLocalServer() {
    if (location.protocol === "file:") return false;
    try {
      const response = await fetch(`/api/local-editor-auth/mode?t=${Date.now()}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return false;
      const payload = await response.json();
      return payload.local === true && payload.passwordOnly === true;
    } catch {
      return false;
    }
  }

  async function localAuthRequest(path, options = {}) {
    const token = sessionStorage.getItem(localTokenKey) || "";
    const response = await fetch(path, {
      ...options,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      // The HTTP status below still produces a useful fallback error.
    }
    if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
    return payload;
  }

  function setBusy(form, busy, label) {
    form.querySelectorAll("input, button").forEach((control) => { control.disabled = busy; });
    const submit = form.querySelector('button[type="submit"]');
    if (submit) {
      submit.dataset.defaultLabel ||= submit.textContent;
      submit.textContent = busy ? label : submit.dataset.defaultLabel;
    }
  }

  function loadEditor() {
    body.classList.remove("editor-auth-pending");
    body.classList.add("editor-authenticated");
    gate.remove();
    const header = document.querySelector(".site-editor-actions") || document.querySelector(".site-header .top-nav");
    if (header) {
      const logout = document.createElement("button");
      logout.className = "editor-logout-button";
      logout.type = "button";
      logout.textContent = "退出登录";
      logout.addEventListener("click", async () => {
        if (localMode) {
          await localAuthRequest("/api/local-editor-auth/logout", { method: "POST" }).catch(() => {});
          sessionStorage.removeItem(localTokenKey);
        } else {
          await window.SiriusAPI.logoutEditor().catch(() => {});
        }
        location.reload();
      });
      header.appendChild(logout);
    }
    if (editorScript) {
      const script = document.createElement("script");
      script.src = editorScript;
      script.onerror = () => alert("编辑器脚本加载失败，请刷新页面重试。");
      document.body.appendChild(script);
    }
  }

  function showPasswordStep(message = "请输入管理密码") {
    challengeId = "";
    passwordForm.hidden = false;
    codeForm.hidden = true;
    passwordInput.value = "";
    codeInput.value = "";
    status.textContent = message;
    passwordInput.focus();
  }

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setBusy(passwordForm, true, localMode ? "正在登录…" : "正在发送验证码…");
    status.textContent = localMode ? "正在验证管理密码…" : "正在验证密码并发送邮件…";
    try {
      if (localMode) {
        const result = await localAuthRequest("/api/local-editor-auth/password", {
          method: "POST",
          body: JSON.stringify({ password: passwordInput.value }),
        });
        sessionStorage.setItem(localTokenKey, result.token);
        passwordInput.value = "";
        status.textContent = "验证成功，正在进入编辑器…";
        loadEditor();
        return;
      }
      const result = await window.SiriusAPI.requestEditorCode(passwordInput.value);
      challengeId = result.challengeId;
      passwordInput.value = "";
      passwordForm.hidden = true;
      codeForm.hidden = false;
      codeHint.textContent = `验证码已发送至 ${result.email}，${Math.round((result.expiresIn || 600) / 60)} 分钟内有效。`;
      status.textContent = "请输入邮件中的六位数字验证码";
      codeInput.focus();
    } catch (error) {
      status.textContent = error.message || "验证失败，请稍后重试";
    } finally {
      setBusy(passwordForm, false, "");
    }
  });

  codeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = codeInput.value.trim();
    if (!/^\d{6}$/.test(code)) {
      status.textContent = "请输入六位数字验证码";
      return;
    }
    setBusy(codeForm, true, "正在登录…");
    status.textContent = "正在验证邮件验证码…";
    try {
      await window.SiriusAPI.verifyEditorCode(challengeId, code);
      status.textContent = "验证成功，正在进入编辑器…";
      loadEditor();
    } catch (error) {
      status.textContent = error.message || "验证码验证失败";
      codeInput.select();
    } finally {
      if (document.body.contains(codeForm)) setBusy(codeForm, false, "");
    }
  });

  gate.querySelector("#editorAuthRestart").addEventListener("click", () => showPasswordStep());
  window.addEventListener("sirius-editor-auth-required", () => location.reload());

  async function initializeAuth() {
    if (await isLocalServer()) {
      enableLocalMode();
      try {
        await localAuthRequest("/api/local-editor-auth/session");
        loadEditor();
      } catch {
        sessionStorage.removeItem(localTokenKey);
        showPasswordStep();
      }
      return;
    }

    if (!window.SiriusAPI?.hasApi()) {
      showPasswordStep("请先运行 npm start，再通过服务器显示的本地地址打开编辑器");
      return;
    }

    window.SiriusAPI.verifyEditorSession()
      .then(loadEditor)
      .catch(() => showPasswordStep());
  }

  initializeAuth();
})();
