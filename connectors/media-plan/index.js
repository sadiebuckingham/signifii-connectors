// Media Plan connector: wiring only. Engines live in core/.
// FICTIONAL DEMO DATA ONLY (Little Lantern Media / Bramble Bots).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FsStore } from "../../core/storage/fs-store.js";
import { SourceLibrary } from "../../core/sources/library.js";
import { readingReportsPage } from "../../core/sources/report-html.js";
import { readRulesSheet } from "../../core/checks/rules-sheet.js";
import { runChecks } from "../../core/checks/engine.js";
import { safeEqual } from "../../core/auth/index.js";
import { evaluators, ruleTypeOf } from "./rules.js";
import { config } from "./config.js";
import { renderPlan } from "./template/plan.js";
import { spikePlanModel } from "./spike.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// "Media Plans" folder on our side. For now the sample folder in the repo (read-only);
// Postgres-backed folders arrive with saving (Wednesday), OneDrive on Thursday.
const store = new FsStore(process.env.MEDIA_PLANS_ROOT || path.join(here, "../../sample-data/media-plan/Media Plans"), { readOnly: true, label: "Demo folders" });
const library = new SourceLibrary(store, config.folders.sharedData);

async function loadRules() {
  const p = config.folders.rulesFile;
  if (!(await store.exists(p))) return { rules: [], problems: [`No ${p} found.`] };
  return readRulesSheet(await store.read(p), path.posix.basename(p), ruleTypeOf);
}

async function spikePlan() {
  const dummy = JSON.parse(readFileSync(path.join(here, "spike-dummy-plan.json"), "utf8"));
  const { rules, problems } = await loadRules();
  const checkRun = runChecks({ rules, evaluators, subject: spikePlanModel(dummy) });
  return { ...dummy, checkRun, rulesProblems: problems };
}

function sourcesText(state) {
  const lines = state.reports.map((r) => {
    const c = r.counts || {};
    const flags = (r.checkThese || []).map((g) => `${g.count}× ${g.text.split(":")[0]}`).join("; ");
    return `- ${r.file}: ${r.status.toUpperCase()}. ${r.summary}${c.values != null ? ` (${c.noValue} no-value, ${c.hidden} hidden, ${c.needsReview} need review)` : ""}${flags ? `\n  Check: ${flags}` : ""}`;
  });
  return `Shared data folder "${state.folder}", read ${state.readAt}:\n${lines.join("\n")}`;
}

export default {
  name: "media-plan",
  title: "Little Lantern Media Plans",
  version: "0.2.0",
  legacyPaths: ["/mcp"], // the spike's original address keeps working until the move to signifii-demos
  view: { uri: "ui://media-plan/plan-v2.html", csp: { resourceDomains: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"] } },

  tools(reg) {
    const { z } = reg;
    reg.appTool("open_plan", {
      title: "Open media plan",
      description: "Open a media plan in Little Lantern Media's fixed plan template, shown in the conversation. " +
        "Currently only the spike plan 'bramble-bots-q4' exists, with placeholder numbers; its sign-off checks are run for real against the agency's rules sheet. " +
        "Do not restate figures from the plan in your reply; the view shows them with their sources.",
      inputSchema: { brief_id: z.string().describe("Brief ID, e.g. 'bramble-bots-q4'") },
    }, async ({ brief_id }) => {
      if (brief_id !== "bramble-bots-q4") return { isError: true, content: [{ type: "text", text: `No brief '${brief_id}'. The only plan so far is 'bramble-bots-q4'.` }] };
      const plan = await spikePlan();
      const s = plan.checkRun.summary;
      return {
        content: [{ type: "text", text: `Opened plan ${plan.plan_id} (dummy numbers). Sign-off checks: ${s.pass} pass, ${s.warn} warning, ${s.fail} fail, ${s.notRun} not run, ${s.notChecked} not checked.` }],
        structuredContent: { plan },
      };
    });

    reg.tool("list_sources", {
      title: "List sources",
      description: "List the files in the agency's Shared data folder and how each was read: status (read / read with warnings / couldn't read / refused), counts, and what needs checking. Use reread=true after files change.",
      inputSchema: { reread: z.boolean().optional().describe("Re-read every file from scratch") },
      annotations: { readOnlyHint: true },
    }, async ({ reread }) => {
      const state = await library.load({ force: Boolean(reread) });
      return { content: [{ type: "text", text: sourcesText(state) }], structuredContent: { readAt: state.readAt, folder: state.folder, reports: state.reports.map(({ sheets, ...r }) => r) } };
    });
  },

  routes(app, ctx) {
    const token = process.env.PLAN_LINK_TOKEN || "";
    const css = readFileSync(path.join(here, "template/plan.css"), "utf8") + readFileSync(path.join(ctx.root, "core/mcp/app-shell/shell.css"), "utf8");
    const markers = readFileSync(path.join(ctx.root, "core/mcp/app-shell/markers.js"), "utf8").replace("export function", "function");
    const planPage = async (req, res) => {
      if (!token || !safeEqual(req.params.token, token)) return res.status(404).send("Not found");
      const plan = await spikePlan();
      res.set("Cache-Control", "no-store").set("X-Robots-Tag", "noindex").type("html").send(`<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${plan.client} · ${plan.campaign} · Media plan</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Nunito:wght@700;800;900&display=swap">
<style>${css} body{background:#EDE8DC;} main{max-width:1040px;margin:0 auto;padding:24px 16px;}</style></head>
<body><main>${renderPlan(plan)}</main><script>${markers}; wireSourceMarkers(document);</script></body></html>`);
    };
    app.get("/p/:token", planPage);
    app.get("/p/media-plan/:token", planPage);

    app.get("/admin/media-plan/sources", ctx.checkAdmin, async (req, res) => {
      const state = await library.load({ force: req.query.reread === "1" });
      res.set("Cache-Control", "no-store").type("html").send(readingReportsPage(state, { title: "Shared data reading report", heading: "Shared data: reading report", folderLabel: `Media Plans/${config.folders.sharedData}` }));
    });
    app.get("/admin/media-plan/sources.json", ctx.checkAdmin, async (req, res) => res.json(await library.load({ force: req.query.reread === "1" })));
  },
};
