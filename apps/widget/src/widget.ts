/**
 * Widget chat OKITO embarquable.
 *
 * Usage côté site marchand :
 *   <script
 *     src="https://widget.okito.app/v1/widget.js"
 *     data-tenant-id="2853f3bc-cc57-46c1-959e-a07354feb505"
 *     data-api-url="https://api.okito.app"
 *     data-title="Réserver une table"
 *   ></script>
 *
 * Le script lit ses options sur la balise <script> elle-même, injecte une
 * bulle en bas à droite, et POST sur `${apiUrl}/v1/widget/chat/:tenantId`.
 * Le sessionId est persistant via localStorage.
 */

interface WidgetOptions {
  tenantId: string;
  apiUrl: string;
  title: string;
  greeting: string;
}

interface ChatTurn {
  role: "user" | "bot";
  content: string;
}

const STORAGE_KEY_SESSION = "okito_widget_session";
const STORAGE_KEY_HISTORY = "okito_widget_history";
const MAX_HISTORY = 30;

function readOptions(): WidgetOptions | null {
  const script =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>("script[data-tenant-id]");
  if (!script) return null;
  const tenantId = script.dataset.tenantId ?? "";
  if (!tenantId) return null;
  return {
    tenantId,
    apiUrl: script.dataset.apiUrl ?? "https://api.okito.app",
    title: script.dataset.title ?? "Réserver",
    greeting: script.dataset.greeting ?? "Bonjour ! Comment puis-je vous aider ?",
  };
}

function getSessionId(): string {
  let id = localStorage.getItem(STORAGE_KEY_SESSION);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(STORAGE_KEY_SESSION, id);
  }
  return id;
}

function loadHistory(): ChatTurn[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatTurn[];
  } catch {
    return [];
  }
}

function saveHistory(turns: ChatTurn[]): void {
  const trimmed = turns.slice(-MAX_HISTORY);
  localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(trimmed));
}

function injectStyles(): void {
  if (document.getElementById("okito-widget-styles")) return;
  const style = document.createElement("style");
  style.id = "okito-widget-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
}

const STYLES = `
.okito-widget-bubble {
  position: fixed; bottom: 20px; right: 20px; z-index: 999999;
  width: 56px; height: 56px; border-radius: 28px;
  background: #1c1917; color: white; border: none; cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  font-family: ui-sans-serif, system-ui, sans-serif;
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; transition: transform 0.2s;
}
.okito-widget-bubble:hover { transform: scale(1.05); }
.okito-widget-panel {
  position: fixed; bottom: 90px; right: 20px; z-index: 999999;
  width: 360px; max-width: calc(100vw - 40px);
  height: 520px; max-height: calc(100vh - 120px);
  background: white; border-radius: 16px; overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  display: none; flex-direction: column;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
.okito-widget-panel[data-open="true"] { display: flex; }
.okito-widget-header {
  background: #1c1917; color: white; padding: 14px 16px;
  font-weight: 600; display: flex; justify-content: space-between; align-items: center;
}
.okito-widget-close {
  background: transparent; border: none; color: white; cursor: pointer;
  font-size: 18px; padding: 0; line-height: 1;
}
.okito-widget-messages {
  flex: 1; overflow-y: auto; padding: 12px; background: #fafaf9;
  display: flex; flex-direction: column; gap: 8px;
}
.okito-widget-msg {
  max-width: 80%; padding: 8px 12px; border-radius: 12px;
  font-size: 14px; line-height: 1.4; white-space: pre-wrap;
}
.okito-widget-msg-user { background: #1c1917; color: white; align-self: flex-end; }
.okito-widget-msg-bot { background: white; color: #1c1917; align-self: flex-start; border: 1px solid #e7e5e4; }
.okito-widget-form {
  display: flex; gap: 8px; padding: 12px; background: white; border-top: 1px solid #e7e5e4;
}
.okito-widget-input {
  flex: 1; padding: 8px 10px; border: 1px solid #d6d3d1; border-radius: 8px;
  font-size: 14px; font-family: inherit; outline: none;
}
.okito-widget-input:focus { border-color: #1c1917; }
.okito-widget-send {
  background: #1c1917; color: white; border: none; border-radius: 8px;
  padding: 8px 14px; font-size: 14px; font-weight: 500; cursor: pointer;
}
.okito-widget-send:disabled { opacity: 0.5; cursor: not-allowed; }
.okito-widget-typing { color: #78716c; font-size: 12px; padding: 4px 12px; font-style: italic; }
`;

class OkitoWidget {
  private open = false;
  private turns: ChatTurn[] = [];
  private bubble!: HTMLButtonElement;
  private panel!: HTMLDivElement;
  private messages!: HTMLDivElement;
  private input!: HTMLInputElement;
  private sendBtn!: HTMLButtonElement;
  private sending = false;

  constructor(private readonly opts: WidgetOptions) {
    this.turns = loadHistory();
  }

  mount(): void {
    injectStyles();

    this.bubble = document.createElement("button");
    this.bubble.className = "okito-widget-bubble";
    this.bubble.textContent = "💬";
    this.bubble.setAttribute("aria-label", "Ouvrir le chat de réservation");
    this.bubble.addEventListener("click", () => this.toggle());
    document.body.appendChild(this.bubble);

    this.panel = document.createElement("div");
    this.panel.className = "okito-widget-panel";
    this.panel.innerHTML = `
      <div class="okito-widget-header">
        <span>${escapeHtml(this.opts.title)}</span>
        <button class="okito-widget-close" aria-label="Fermer">✕</button>
      </div>
      <div class="okito-widget-messages"></div>
      <form class="okito-widget-form">
        <input class="okito-widget-input" type="text" placeholder="Votre message..." autocomplete="off" />
        <button class="okito-widget-send" type="submit">Envoyer</button>
      </form>
    `;
    document.body.appendChild(this.panel);

    this.messages = this.panel.querySelector(".okito-widget-messages") as HTMLDivElement;
    this.input = this.panel.querySelector(".okito-widget-input") as HTMLInputElement;
    this.sendBtn = this.panel.querySelector(".okito-widget-send") as HTMLButtonElement;
    const form = this.panel.querySelector(".okito-widget-form") as HTMLFormElement;
    const closeBtn = this.panel.querySelector(".okito-widget-close") as HTMLButtonElement;

    closeBtn.addEventListener("click", () => this.toggle());
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.send();
    });

    if (this.turns.length === 0) {
      this.turns.push({ role: "bot", content: this.opts.greeting });
    }
    this.renderMessages();
  }

  private toggle(): void {
    this.open = !this.open;
    this.panel.setAttribute("data-open", String(this.open));
    if (this.open) this.input.focus();
  }

  private async send(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || this.sending) return;
    this.input.value = "";
    this.sending = true;
    this.sendBtn.disabled = true;

    this.turns.push({ role: "user", content: text });
    this.renderMessages();

    const typing = document.createElement("div");
    typing.className = "okito-widget-typing";
    typing.textContent = "...";
    this.messages.appendChild(typing);
    this.messages.scrollTop = this.messages.scrollHeight;

    try {
      const res = await fetch(`${this.opts.apiUrl}/v1/widget/chat/${this.opts.tenantId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: getSessionId(), message: text }),
      });
      typing.remove();
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        this.turns.push({
          role: "bot",
          content: `Désolé, une erreur s'est produite (${body.error?.message ?? res.status}).`,
        });
      } else {
        const data = (await res.json()) as { reply: string };
        this.turns.push({ role: "bot", content: data.reply });
      }
    } catch (err) {
      typing.remove();
      this.turns.push({
        role: "bot",
        content:
          err instanceof Error ? `Erreur réseau : ${err.message}` : "Erreur réseau inconnue.",
      });
    } finally {
      saveHistory(this.turns);
      this.renderMessages();
      this.sending = false;
      this.sendBtn.disabled = false;
      this.input.focus();
    }
  }

  private renderMessages(): void {
    this.messages.innerHTML = "";
    for (const t of this.turns) {
      const div = document.createElement("div");
      div.className = `okito-widget-msg okito-widget-msg-${t.role}`;
      div.textContent = t.content;
      this.messages.appendChild(div);
    }
    this.messages.scrollTop = this.messages.scrollHeight;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function init(): void {
  const opts = readOptions();
  if (!opts) {
    console.warn("[okito-widget] data-tenant-id manquant sur la balise <script>.");
    return;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => new OkitoWidget(opts).mount(), {
      once: true,
    });
  } else {
    new OkitoWidget(opts).mount();
  }
}

init();
