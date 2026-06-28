/**
 * Widget chat OKITO embarquable.
 *
 * Usage côté site marchand (intégration minimale) :
 *   <script
 *     src="https://widget.okito.app/v1/widget.js"
 *     data-tenant-id="2853f3bc-cc57-46c1-959e-a07354feb505"
 *     data-api-url="https://api.okito.app"
 *   ></script>
 *
 * Au chargement, le widget appelle GET /v1/widget/config/:tenantId pour
 * récupérer le branding configuré côté dashboard OKITO (couleurs, logo,
 * greeting, title, position). Les attributs data-* sur le <script> servent
 * d'override local (utile pour preview ou A/B test).
 *
 * Le sessionId est persistant via localStorage.
 */

interface WidgetBranding {
  primaryColor?: string;
  accentTextColor?: string;
  logoUrl?: string;
  greeting?: string;
  title?: string;
  position?: "bottom-right" | "bottom-left";
}

interface RemoteConfig {
  tenantId: string;
  name: string;
  industry?: string;
  branding?: WidgetBranding;
}

interface WidgetOptions {
  tenantId: string;
  apiUrl: string;
  /** Overrides explicites via data-* — gagnent contre le remote. */
  overrides: Partial<WidgetBranding & { title: string; greeting: string }>;
}

interface ChatTurn {
  role: "user" | "bot";
  content: string;
}

const STORAGE_KEY_SESSION = "okito_widget_session";
const STORAGE_KEY_HISTORY = "okito_widget_history";
const MAX_HISTORY = 30;

const DEFAULTS = {
  primaryColor: "#1c1917",
  accentTextColor: "#ffffff",
  greeting: "Bonjour ! Comment puis-je vous aider ?",
  title: "Réserver",
  position: "bottom-right" as const,
};

function readOptions(): WidgetOptions | null {
  const script =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>("script[data-tenant-id]");
  if (!script) return null;
  const tenantId = script.dataset.tenantId ?? "";
  if (!tenantId) return null;

  const overrides: WidgetOptions["overrides"] = {};
  if (script.dataset.title) overrides.title = script.dataset.title;
  if (script.dataset.greeting) overrides.greeting = script.dataset.greeting;
  if (script.dataset.primaryColor) overrides.primaryColor = script.dataset.primaryColor;
  if (script.dataset.logoUrl) overrides.logoUrl = script.dataset.logoUrl;
  if (script.dataset.position === "bottom-left" || script.dataset.position === "bottom-right") {
    overrides.position = script.dataset.position;
  }

  return {
    tenantId,
    apiUrl: script.dataset.apiUrl ?? "https://api.okito.app",
    overrides,
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

async function fetchRemoteConfig(apiUrl: string, tenantId: string): Promise<RemoteConfig | null> {
  try {
    const res = await fetch(`${apiUrl}/v1/widget/config/${tenantId}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as RemoteConfig;
  } catch {
    return null;
  }
}

function injectStyles(): void {
  if (document.getElementById("okito-widget-styles")) return;
  const style = document.createElement("style");
  style.id = "okito-widget-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
}

/**
 * Toutes les couleurs sont parametrables via CSS variables — le widget les
 * définit sur le <html> au mount(). Fallback sur les défauts si non set.
 */
const STYLES = `
.okito-widget-bubble {
  position: fixed; bottom: 20px; z-index: 999999;
  width: 56px; height: 56px; border-radius: 28px;
  background: var(--okito-primary, #1c1917);
  color: var(--okito-accent-text, #ffffff);
  border: none; cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  font-family: ui-sans-serif, system-ui, sans-serif;
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; transition: transform 0.2s;
}
.okito-widget-bubble[data-position="bottom-right"] { right: 20px; }
.okito-widget-bubble[data-position="bottom-left"]  { left: 20px; }
.okito-widget-bubble:hover { transform: scale(1.05); }
.okito-widget-panel {
  position: fixed; bottom: 90px; z-index: 999999;
  width: 360px; max-width: calc(100vw - 40px);
  height: 520px; max-height: calc(100vh - 120px);
  background: white; border-radius: 16px; overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  display: none; flex-direction: column;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
.okito-widget-panel[data-position="bottom-right"] { right: 20px; }
.okito-widget-panel[data-position="bottom-left"]  { left: 20px; }
.okito-widget-panel[data-open="true"] { display: flex; }
.okito-widget-header {
  background: var(--okito-primary, #1c1917);
  color: var(--okito-accent-text, #ffffff);
  padding: 14px 16px;
  font-weight: 600; display: flex; justify-content: space-between; align-items: center;
  gap: 12px;
}
.okito-widget-header-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.okito-widget-header-logo { width: 28px; height: 28px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
.okito-widget-header-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.okito-widget-close {
  background: transparent; border: none; color: inherit; cursor: pointer;
  font-size: 18px; padding: 0; line-height: 1; opacity: 0.85;
}
.okito-widget-close:hover { opacity: 1; }
.okito-widget-messages {
  flex: 1; overflow-y: auto; padding: 12px; background: #fafaf9;
  display: flex; flex-direction: column; gap: 8px;
}
.okito-widget-msg {
  max-width: 80%; padding: 8px 12px; border-radius: 12px;
  font-size: 14px; line-height: 1.4; white-space: pre-wrap;
}
.okito-widget-msg-user {
  background: var(--okito-primary, #1c1917);
  color: var(--okito-accent-text, #ffffff);
  align-self: flex-end;
}
.okito-widget-msg-bot { background: white; color: #1c1917; align-self: flex-start; border: 1px solid #e7e5e4; }
.okito-widget-form {
  display: flex; gap: 8px; padding: 12px; background: white; border-top: 1px solid #e7e5e4;
}
.okito-widget-input {
  flex: 1; padding: 8px 10px; border: 1px solid #d6d3d1; border-radius: 8px;
  font-size: 14px; font-family: inherit; outline: none;
}
.okito-widget-input:focus { border-color: var(--okito-primary, #1c1917); }
.okito-widget-send {
  background: var(--okito-primary, #1c1917);
  color: var(--okito-accent-text, #ffffff);
  border: none; border-radius: 8px;
  padding: 8px 14px; font-size: 14px; font-weight: 500; cursor: pointer;
}
.okito-widget-send:disabled { opacity: 0.5; cursor: not-allowed; }
.okito-widget-typing { color: #78716c; font-size: 12px; padding: 4px 12px; font-style: italic; }
`;

interface ResolvedBranding {
  primaryColor: string;
  accentTextColor: string;
  logoUrl?: string;
  greeting: string;
  title: string;
  position: "bottom-right" | "bottom-left";
}

function resolveBranding(
  opts: WidgetOptions,
  remote: RemoteConfig | null,
  remoteName: string | undefined,
): ResolvedBranding {
  const r = remote?.branding ?? {};
  const o = opts.overrides;
  return {
    primaryColor: o.primaryColor ?? r.primaryColor ?? DEFAULTS.primaryColor,
    accentTextColor: o.accentTextColor ?? r.accentTextColor ?? DEFAULTS.accentTextColor,
    logoUrl: o.logoUrl ?? r.logoUrl,
    greeting: o.greeting ?? r.greeting ?? DEFAULTS.greeting,
    title: o.title ?? r.title ?? remoteName ?? DEFAULTS.title,
    position: o.position ?? r.position ?? DEFAULTS.position,
  };
}

class OkitoWidget {
  private open = false;
  private turns: ChatTurn[] = [];
  private bubble!: HTMLButtonElement;
  private panel!: HTMLDivElement;
  private messages!: HTMLDivElement;
  private input!: HTMLInputElement;
  private sendBtn!: HTMLButtonElement;
  private sending = false;

  constructor(
    private readonly opts: WidgetOptions,
    private readonly brand: ResolvedBranding,
  ) {
    this.turns = loadHistory();
  }

  mount(): void {
    injectStyles();
    // Pose les CSS variables au niveau du <html> — couvre tous les éléments injectés.
    document.documentElement.style.setProperty("--okito-primary", this.brand.primaryColor);
    document.documentElement.style.setProperty("--okito-accent-text", this.brand.accentTextColor);

    this.bubble = document.createElement("button");
    this.bubble.className = "okito-widget-bubble";
    this.bubble.dataset.position = this.brand.position;
    this.bubble.textContent = "💬";
    this.bubble.setAttribute("aria-label", "Ouvrir le chat de réservation");
    this.bubble.addEventListener("click", () => this.toggle());
    document.body.appendChild(this.bubble);

    this.panel = document.createElement("div");
    this.panel.className = "okito-widget-panel";
    this.panel.dataset.position = this.brand.position;

    const logoHtml = this.brand.logoUrl
      ? `<img class="okito-widget-header-logo" src="${escapeAttr(this.brand.logoUrl)}" alt="" />`
      : "";

    this.panel.innerHTML = `
      <div class="okito-widget-header">
        <div class="okito-widget-header-brand">
          ${logoHtml}
          <span class="okito-widget-header-title">${escapeHtml(this.brand.title)}</span>
        </div>
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
      this.turns.push({ role: "bot", content: this.brand.greeting });
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

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

async function bootstrap(opts: WidgetOptions): Promise<void> {
  const remote = await fetchRemoteConfig(opts.apiUrl, opts.tenantId);
  const brand = resolveBranding(opts, remote, remote?.name);
  new OkitoWidget(opts, brand).mount();
}

function init(): void {
  const opts = readOptions();
  if (!opts) {
    console.warn("[okito-widget] data-tenant-id manquant sur la balise <script>.");
    return;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => bootstrap(opts), { once: true });
  } else {
    bootstrap(opts);
  }
}

init();
