import { Hono } from "hono";

export interface PlaygroundConfig {
  defaultTenantId?: string;
  vapiPublicKey?: string;
  vapiAssistantId?: string;
}

const PLAYGROUND_HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OKITO — Playground chat</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f7f7f8; color: #111; display: flex; justify-content: center; }
  main { width: 100%; max-width: 720px; padding: 24px 16px 16px; display: flex; flex-direction: column; height: 100vh; }
  header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
  h1 { font-size: 18px; margin: 0; }
  .tag { font-size: 12px; color: #666; }
  .config { background: #fff; border: 1px solid #e3e3e6; border-radius: 12px; padding: 12px; margin-bottom: 12px; font-size: 13px; }
  .config label { display: block; margin-bottom: 6px; color: #444; }
  .config input { width: 100%; padding: 6px 8px; border: 1px solid #d4d4d8; border-radius: 6px; font: inherit; }
  .config-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  #log { flex: 1; overflow-y: auto; background: #fff; border: 1px solid #e3e3e6; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
  .msg { max-width: 85%; padding: 8px 12px; border-radius: 14px; line-height: 1.4; white-space: pre-wrap; word-wrap: break-word; font-size: 14px; }
  .msg.user { background: #2563eb; color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }
  .msg.bot { background: #f1f1f4; color: #111; align-self: flex-start; border-bottom-left-radius: 4px; }
  .msg.error { background: #fee2e2; color: #991b1b; align-self: stretch; font-size: 12px; }
  .meta { font-size: 11px; color: #888; margin-top: 2px; }
  .voice-bar { background: #fff; border: 1px solid #e3e3e6; border-radius: 12px; padding: 10px 14px; margin-bottom: 12px; display: flex; align-items: center; gap: 12px; }
  .voice-btn { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border: 0; border-radius: 999px; font: inherit; cursor: pointer; transition: background 0.2s, transform 0.05s; }
  .voice-btn.idle { background: #111; color: #fff; }
  .voice-btn.idle:hover { background: #333; }
  .voice-btn.connecting { background: #f59e0b; color: #fff; cursor: wait; }
  .voice-btn.active { background: #dc2626; color: #fff; }
  .voice-btn.active::before { content: ""; display: inline-block; width: 8px; height: 8px; background: #fff; border-radius: 50%; animation: pulse 1.2s ease-in-out infinite; }
  .voice-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .voice-icon { font-size: 16px; line-height: 1; }
  .voice-status { font-size: 12px; color: #666; flex: 1; text-align: right; }
  .voice-status.error { color: #dc2626; }
  @keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }
  form { display: flex; gap: 8px; padding: 12px 0 0; }
  textarea { flex: 1; padding: 10px 12px; border: 1px solid #d4d4d8; border-radius: 10px; font: inherit; resize: none; min-height: 44px; max-height: 120px; }
  button { padding: 10px 16px; background: #111; color: #fff; border: 0; border-radius: 10px; font: inherit; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .empty { color: #999; font-size: 13px; text-align: center; padding: 24px 0; }
</style>
</head>
<body>
<main>
  <header>
    <h1>OKITO playground</h1>
    <span class="tag">chat /v1/chat &nbsp;·&nbsp; voix Vapi</span>
  </header>

  <div class="voice-bar" id="voiceBar">
    <button id="voiceBtn" class="voice-btn idle" type="button">
      <span class="voice-icon">🎙️</span>
      <span class="voice-label" id="voiceLabel">Parler au bot</span>
    </button>
    <span id="voiceStatus" class="voice-status">prêt</span>
  </div>

  <div class="config">
    <div class="config-row">
      <div>
        <label for="tenantId">Tenant ID (X-Tenant-Id)</label>
        <input id="tenantId" value="" placeholder="UUID du tenant" />
      </div>
      <div>
        <label for="sessionKey">Session key</label>
        <input id="sessionKey" value="" placeholder="auto" />
      </div>
    </div>
  </div>

  <div id="log">
    <div class="empty" id="empty">Tape un message pour démarrer la conversation.<br/>Ex: « Bonjour, je veux réserver pour 2 demain à 20h »</div>
  </div>

  <form id="form">
    <textarea id="input" placeholder="Écris ton message…" autocomplete="off"></textarea>
    <button type="submit" id="send">Envoyer</button>
  </form>
</main>

<script type="module">
  const VAPI_PUBLIC_KEY = "__VAPI_PUBLIC_KEY__";
  const VAPI_ASSISTANT_ID = "__VAPI_ASSISTANT_ID__";

  const voiceBtn = document.getElementById("voiceBtn");
  const voiceLabel = document.getElementById("voiceLabel");
  const voiceStatus = document.getElementById("voiceStatus");

  function setVoiceState(state, label, status, isError) {
    voiceBtn.className = "voice-btn " + state;
    voiceLabel.textContent = label;
    voiceStatus.textContent = status;
    voiceStatus.className = "voice-status" + (isError ? " error" : "");
  }

  if (!VAPI_PUBLIC_KEY || VAPI_PUBLIC_KEY.startsWith("__")) {
    voiceBtn.disabled = true;
    setVoiceState("idle", "Voix indispo", "VAPI_PUBLIC_KEY manquante dans .env", true);
  } else if (!VAPI_ASSISTANT_ID || VAPI_ASSISTANT_ID.startsWith("__")) {
    voiceBtn.disabled = true;
    setVoiceState("idle", "Voix indispo", "VAPI_ASSISTANT_ID manquant dans .env", true);
  } else {
    let vapi = null;
    let active = false;

    async function startVoice() {
      try {
        setVoiceState("connecting", "Connexion…", "init Vapi");
        if (!vapi) {
          const mod = await import("https://esm.sh/@vapi-ai/web");
          const Vapi = mod.default;
          vapi = new Vapi(VAPI_PUBLIC_KEY);

          vapi.on("call-start", () => {
            active = true;
            setVoiceState("active", "Raccrocher", "en appel — parle dans le micro");
          });
          vapi.on("call-end", () => {
            active = false;
            setVoiceState("idle", "Parler au bot", "appel terminé");
          });
          vapi.on("speech-start", () => {
            voiceStatus.textContent = "bot parle…";
          });
          vapi.on("speech-end", () => {
            voiceStatus.textContent = "ton tour";
          });
          vapi.on("error", (e) => {
            console.error("vapi error:", e);
            active = false;
            const msg = (e && (e.errorMsg || e.message)) ? (e.errorMsg || e.message) : "erreur Vapi";
            setVoiceState("idle", "Parler au bot", msg, true);
          });
          vapi.on("message", (m) => {
            if (m.type === "transcript" && m.transcriptType === "final") {
              addMsg(m.role === "user" ? "user" : "bot", "🎙️ " + m.transcript);
            }
          });
        }
        await vapi.start(VAPI_ASSISTANT_ID);
      } catch (e) {
        console.error(e);
        setVoiceState("idle", "Parler au bot", String(e?.message || e), true);
      }
    }

    function stopVoice() {
      try { vapi?.stop(); } catch (e) { console.error(e); }
    }

    voiceBtn.addEventListener("click", () => {
      if (active) stopVoice(); else startVoice();
    });
  }

  const DEFAULT_TENANT = "__TENANT_ID__";
  const tenantInput = document.getElementById("tenantId");
  const sessionInput = document.getElementById("sessionKey");
  const log = document.getElementById("log");
  const empty = document.getElementById("empty");
  const form = document.getElementById("form");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("send");

  tenantInput.value = localStorage.getItem("okito.tenantId") || DEFAULT_TENANT;
  sessionInput.value = localStorage.getItem("okito.sessionKey") || "web-" + Math.random().toString(36).slice(2, 10);

  tenantInput.addEventListener("change", () => localStorage.setItem("okito.tenantId", tenantInput.value.trim()));
  sessionInput.addEventListener("change", () => localStorage.setItem("okito.sessionKey", sessionInput.value.trim()));

  function addMsg(role, text, meta) {
    if (empty.parentNode) empty.remove();
    const div = document.createElement("div");
    div.className = "msg " + role;
    div.textContent = text;
    log.appendChild(div);
    if (meta) {
      const m = document.createElement("div");
      m.className = "meta";
      m.textContent = meta;
      log.appendChild(m);
    }
    log.scrollTop = log.scrollHeight;
  }

  async function send(message) {
    const tenantId = tenantInput.value.trim();
    const sessionKey = sessionInput.value.trim() || "web-" + Date.now();
    sessionInput.value = sessionKey;

    addMsg("user", message);
    sendBtn.disabled = true;
    sendBtn.textContent = "…";

    try {
      const res = await fetch("/v1/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Id": tenantId,
        },
        body: JSON.stringify({
          channel: "web_widget",
          sessionKey,
          message,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addMsg("error", "Erreur " + res.status + " : " + (data?.error?.message || res.statusText));
      } else {
        addMsg("bot", data.reply || "(pas de réponse)", "status: " + (data.status || "?") + " · conv: " + (data.conversationId || "?").slice(0, 8));
      }
    } catch (e) {
      addMsg("error", "Erreur réseau : " + (e && e.message ? e.message : String(e)));
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = "Envoyer";
      input.focus();
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    send(text);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  input.focus();
</script>
</body>
</html>`;

export function playgroundRoute(config: PlaygroundConfig | string | undefined) {
  const cfg: PlaygroundConfig =
    typeof config === "string" ? { defaultTenantId: config } : (config ?? {});
  const app = new Hono();
  const html = PLAYGROUND_HTML.replace("__TENANT_ID__", cfg.defaultTenantId ?? "")
    .replace("__VAPI_PUBLIC_KEY__", cfg.vapiPublicKey ?? "")
    .replace("__VAPI_ASSISTANT_ID__", cfg.vapiAssistantId ?? "");
  app.get("/", (c) => c.html(html));
  return app;
}
