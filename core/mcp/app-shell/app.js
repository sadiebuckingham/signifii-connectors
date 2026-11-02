// The MCP App shell shared by every connector: connects to Claude, applies the
// host's theme, shows a compact card inline and the full document fullscreen,
// and reports how the host is displaying it (diagnostics, admin only).
// A connector supplies only its render functions.
import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from "@modelcontextprotocol/ext-apps";
import { wireSourceMarkers } from "./markers.js";
import * as Sentry from "@sentry/browser";

// Browser error reporting: only when a DSN was set at build time. No personal data.
const SENTRY_DSN = typeof __SENTRY_DSN__ !== "undefined" ? __SENTRY_DSN__ : "";
if (SENTRY_DSN) Sentry.init({ dsn: SENTRY_DSN, release: typeof __RELEASE__ !== "undefined" ? __RELEASE__ || undefined : undefined, environment: "demo", sendDefaultPii: false, tracesSampleRate: 0, integrations: (d) => d.filter((i) => i.name !== "Breadcrumbs") });

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * @param {object} o
 * @param {string} o.name                       app name shown to the host
 * @param {(data:any)=>string} o.renderSummary  inline card HTML
 * @param {(data:any)=>string} o.renderFull     fullscreen HTML
 * @param {string} o.fullLabel                  button text, e.g. "Open full plan"
 * @param {string} [o.reportTool]               app-only tool that receives host diagnostics
 * @param {(data:any)=>{name:string,arguments:object}|null} [o.refresh]  tool call that returns fresh data
 */
export async function startApp(o) {
  const root = document.getElementById("root");
  const app = new App({ name: o.name, version: "0.2.0" }, { availableDisplayModes: ["inline", "fullscreen"] }, { autoResize: true });
  let data = null, error = null, showDiag = false;
  const events = [];
  const ctx = () => app.getHostContext() || {};
  const mode = () => ctx().displayMode || "inline";

  function applyHost(c) {
    if (!c) return;
    if (c.theme) applyDocumentTheme(c.theme);
    if (c.styles?.variables) applyHostStyleVariables(c.styles.variables);
    if (c.styles?.css?.fonts) applyHostFonts(c.styles.css.fonts);
  }

  function diagnostics() {
    const c = ctx();
    return {
      at: new Date().toISOString(), host: app.getHostVersion?.(), displayMode: c.displayMode,
      availableDisplayModes: c.availableDisplayModes, platform: c.platform, containerDimensions: c.containerDimensions,
      safeAreaInsets: c.safeAreaInsets, deviceCapabilities: c.deviceCapabilities, theme: c.theme, locale: c.locale,
      userAgent: c.userAgent, viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      fonts: { nunito: document.fonts?.check?.("16px Nunito") ?? null, inter: document.fonts?.check?.("16px Inter") ?? null, ready: document.fonts?.status },
      events: events.slice(-15),
    };
  }
  async function report(reason) {
    events.push(`${new Date().toISOString().slice(11, 19)} ${reason}`);
    if (!o.reportTool) return;
    try { await app.callServerTool({ name: o.reportTool, arguments: { reason, report: JSON.stringify(diagnostics()) } }); } catch { /* diagnostics are best-effort */ }
  }

  async function refresh() {
    const call = o.refresh?.(data);
    if (!call) return;
    try {
      const r = await app.callServerTool(call);
      if (!r?.isError && r?.structuredContent) { data = r.structuredContent; events.push("refreshed"); }
    } catch (e) { events.push("refresh failed: " + (e?.message || e)); }
    render();
  }

  async function setMode(m) {
    if (m === "fullscreen") refresh();
    try { const r = await app.requestDisplayMode({ mode: m }); events.push(`requestDisplayMode(${m}) -> ${JSON.stringify(r)}`); }
    catch (e) { events.push(`requestDisplayMode(${m}) threw: ${e?.message || e}`); }
    render(); report(`after ${m} request`);
  }

  function render() {
    if (error) { root.innerHTML = `<div class="app-error" role="alert">${esc(error)}</div>`; return; }
    if (!data) { root.innerHTML = '<div class="skeleton" aria-label="Loading"></div>'; return; }
    const m = mode(), s = safe();
    const bar = `<div class="bar">
      <span class="meta">${m === "fullscreen" ? "" : ""}</span>
      <span class="bar-actions">
        ${showDiag ? '<button class="btn" id="diag">Hide diagnostics</button>' : ""}
        ${o.refresh ? '<button class="btn" id="refresh" title="Show the latest version">Refresh</button>' : ""}
        ${m === "fullscreen" ? '<button class="btn" id="mode-inline">Back to chat</button>' : `<button class="btn primary" id="mode-full">${esc(o.fullLabel)}</button>`}
      </span></div>`;
    const diag = showDiag ? `<pre class="diag">${esc(JSON.stringify(diagnostics(), null, 2))}</pre>` : "";
    root.innerHTML = (m === "fullscreen" ? bar + diag + o.renderFull(data) : o.renderSummary(data) + bar + diag);
    root.style.padding = m === "fullscreen" ? `${s.top}px ${s.right}px ${s.bottom}px ${s.left}px` : "";
    root.querySelector("#mode-full")?.addEventListener("click", () => setMode("fullscreen"));
    root.querySelector("#mode-inline")?.addEventListener("click", () => setMode("inline"));
    root.querySelector("#refresh")?.addEventListener("click", refresh);
    root.querySelector("#diag")?.addEventListener("click", () => { showDiag = false; render(); });
  }
  const safe = () => ctx().safeAreaInsets || { top: 0, right: 0, bottom: 0, left: 0 };

  // Alt+Shift+D toggles diagnostics (for us, not for planners)
  addEventListener("keydown", (e) => { if (e.altKey && e.shiftKey && e.code === "KeyD") { showDiag = !showDiag; render(); } });

  app.ontoolinput = (p) => events.push("toolinput " + JSON.stringify(p?.arguments ?? {}));
  app.ontoolresult = (r) => {
    if (r?.isError) { error = r.content?.[0]?.text || "The tool returned an error."; data = null; }
    else { data = r?.structuredContent ?? null; error = data ? null : "No data came back from the tool."; }
    render(); report("tool result received");
  };
  app.onhostcontextchanged = (c) => { applyHost(c); render(); if (c && ("displayMode" in c)) report("display mode changed"); };
  app.onteardown = async () => ({});

  wireSourceMarkers(document);
  render();
  await app.connect();
  applyHost(ctx());
  render();
  report("connected");
}
