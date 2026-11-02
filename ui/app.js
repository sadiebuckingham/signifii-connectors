// MCP App view for the spike. Bundled by build.mjs into a single inline script.
import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from "@modelcontextprotocol/ext-apps";
import { renderPlan, renderSummary } from "./template.js";
import { wireSourceMarkers } from "./markers.js";

const root = document.getElementById("root");
const app = new App(
  { name: "Media Plan (spike)", version: "0.1.0" },
  { availableDisplayModes: ["inline", "fullscreen", "pip"] },
  { autoResize: true },
);

let plan = null;
let showDiag = false;
const events = []; // what happened, in order, for the spike report

function ctx() { return app.getHostContext() || {}; }
function mode() { return ctx().displayMode || "inline"; }

function applyHost(c) {
  if (!c) return;
  if (c.theme) applyDocumentTheme(c.theme);
  if (c.styles?.variables) applyHostStyleVariables(c.styles.variables);
  if (c.styles?.css?.fonts) applyHostFonts(c.styles.css.fonts);
  const s = c.safeAreaInsets;
  if (s) root.style.padding = `${s.top}px ${s.right}px ${s.bottom}px ${s.left}px`;
}

function diagnostics() {
  const c = ctx();
  return {
    at: new Date().toISOString(),
    host: app.getHostVersion?.(),
    hostCapabilities: app.getHostCapabilities?.(),
    displayMode: c.displayMode,
    availableDisplayModes: c.availableDisplayModes,
    platform: c.platform,
    containerDimensions: c.containerDimensions,
    safeAreaInsets: c.safeAreaInsets,
    deviceCapabilities: c.deviceCapabilities,
    theme: c.theme,
    locale: c.locale,
    timeZone: c.timeZone,
    userAgent: c.userAgent,
    hostStyleVariableCount: c.styles?.variables ? Object.keys(c.styles.variables).length : 0,
    hostFontCss: Boolean(c.styles?.css?.fonts),
    navigatorUA: navigator.userAgent,
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    fonts: {
      nunito: document.fonts?.check?.("16px Nunito") ?? null,
      inter: document.fonts?.check?.("16px Inter") ?? null,
    },
    origin: location.origin,
    events: events.slice(-15),
  };
}

async function report(reason) {
  events.push(`${new Date().toISOString().slice(11, 19)} ${reason}`);
  try {
    await app.callServerTool({ name: "spike_report_host", arguments: { reason, report: JSON.stringify(diagnostics()) } });
  } catch (e) {
    events.push("report failed: " + (e?.message || e));
  }
}

function render() {
  if (!plan) { root.innerHTML = '<div class="skeleton" aria-label="Loading plan"></div>'; return; }
  const m = mode();
  const canFull = (ctx().availableDisplayModes || []).includes("fullscreen");
  const bar = `<div class="bar">
      <span class="meta">Mode: ${m}${ctx().platform ? " · " + ctx().platform : ""}</span>
      <span style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" id="diag">${showDiag ? "Hide" : "Show"} diagnostics</button>
        ${m === "fullscreen"
          ? '<button class="btn" id="mode-inline">Back to chat</button>'
          : `<button class="btn primary" id="mode-full" ${canFull ? "" : 'title="Host did not list fullscreen"'}>Open full plan</button>`}
      </span></div>`;
  const diag = showDiag ? `<pre class="diag">${JSON.stringify(diagnostics(), null, 2).replace(/</g, "&lt;")}</pre>` : "";
  const body = m === "fullscreen" ? renderPlan(plan) : renderSummary(plan);
  root.innerHTML = bar + diag + body;

  root.querySelector("#diag").onclick = () => { showDiag = !showDiag; render(); };
  const full = root.querySelector("#mode-full");
  if (full) full.onclick = async () => {
    try {
      const r = await app.requestDisplayMode({ mode: "fullscreen" });
      events.push("requestDisplayMode(fullscreen) -> " + JSON.stringify(r));
    } catch (e) { events.push("requestDisplayMode(fullscreen) threw: " + (e?.message || e)); }
    render(); report("after fullscreen request");
  };
  const inl = root.querySelector("#mode-inline");
  if (inl) inl.onclick = async () => {
    try {
      const r = await app.requestDisplayMode({ mode: "inline" });
      events.push("requestDisplayMode(inline) -> " + JSON.stringify(r));
    } catch (e) { events.push("requestDisplayMode(inline) threw: " + (e?.message || e)); }
    render(); report("after inline request");
  };
}

app.ontoolinput = (p) => { events.push("toolinput " + JSON.stringify(p?.arguments ?? {})); };
app.ontoolresult = (r) => {
  plan = r?.structuredContent?.plan ?? null;
  events.push("toolresult " + (plan ? plan.plan_id : "no plan"));
  render();
  report("tool result received");
};
app.onhostcontextchanged = (c) => {
  applyHost(c);
  events.push("hostcontextchanged " + Object.keys(c || {}).join(","));
  render();
  if (c && ("displayMode" in c || "containerDimensions" in c)) report("host context changed");
};
app.onteardown = async () => { events.push("teardown"); return {}; };

wireSourceMarkers(document);
render();
await app.connect();
applyHost(ctx());
render();
report("connected");
