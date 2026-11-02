// Media Plan connector: tool wiring only. Engines live in core/ and in the
// plan engine (engine.js). FICTIONAL DEMO DATA ONLY (Little Lantern Media / Bramble Bots).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FsStore } from "../../core/storage/fs-store.js";
import { SourceLibrary } from "../../core/sources/library.js";
import { readingReportsPage } from "../../core/sources/report-html.js";
import { FileDocStore } from "../../core/versions/doc-store.js";
import { PlanError } from "./engine.js";
import { reportError } from "../../core/observability/sentry.js";
import { createService } from "./service.js";
import { config } from "./config.js";
import { renderPlan } from "./template/plan.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");

// "Media Plans" folders on our side: the sample folder in the repo (read-only) for now.
const store = new FsStore(process.env.MEDIA_PLANS_ROOT || path.join(ROOT, "sample-data/media-plan/Media Plans"), { readOnly: true, label: "Demo folders" });
const library = new SourceLibrary(store, config.folders.sharedData);
const docs = new FileDocStore(path.join(process.env.DATA_DIR || path.join(ROOT, ".data"), "media-plans"));
const service = createService({ store, library, docs, publicUrl: process.env.PUBLIC_URL || "" });

// ---------- what Claude reads back after each tool
function planText(r) {
  const vm = r.vm, s = r.checkRun.summary;
  const lines = vm.lines.map((l) => `  - ${l.channel} (${l.category}): ${l.budget}, ${l.share}, ${l.delivery}${l.rateText ? `, rate ${l.rateText}` : ", no rate"}`).join("\n");
  const issues = r.checkRun.results.filter((c) => ["fail", "warn", "not_run", "not_checked"].includes(c.status)).map((c) => `  - [${c.status.toUpperCase()}${c.needsTick && !c.ticked ? ", needs tick" : ""}] ${c.ruleId} ${c.title}: ${c.message}`).join("\n");
  return [
    r.message,
    `Plan ${r.plan.id} v${r.plan.version} · ${vm.client} · budget ${vm.budget?.text || "unknown"} · allocated ${vm.total.budget}${vm.unallocated ? ` (${vm.unallocated})` : ""}`,
    vm.lines.length ? `Channels:\n${lines}` : "No channels yet.",
    `Audience figures: ${vm.figures.length}. Sections written: objective ${vm.objective ? "yes" : "no"}, rationale ${vm.rationale.filter((x) => x.text).length}/${vm.lines.length}.`,
    vm.gaps.length ? `Audience gaps: ${vm.gaps.join(" ")}` : "",
    vm.missing.length ? `Still needed from the planner: ${vm.missing.map((m) => m.ask).join(" ")}` : "",
    `Checks: ${s.pass} pass, ${s.warn} warning, ${s.fail} fail, ${s.notRun} not run, ${s.notChecked} not checked.${issues ? `\n${issues}` : ""}`,
    `Web link: ${r.link}`,
    "Don't restate figures yourself; the plan view shows them with their sources.",
  ].filter(Boolean).join("\n");
}
const view = (r) => ({ vm: { ...r.vm, checkRun: r.checkRun && { ...r.checkRun, rulesSnapshot: undefined } }, planId: r.plan.id, link: r.link });
const ok = (r, withView = true) => ({ content: [{ type: "text", text: planText(r) }], ...(withView ? { structuredContent: view(r) } : { structuredContent: { planId: r.plan.id, version: r.plan.version, checks: r.checkRun.summary } }) });
const err = (e) => {
  if (e instanceof PlanError) return { isError: true, content: [{ type: "text", text: e.message }] };
  reportError(e, { where: "media-plan tool" });
  return { isError: true, content: [{ type: "text", text: `Something went wrong on the server: ${e.message}` }] };
};
const guard = (fn) => async (args) => { try { return await fn(args); } catch (e) { return err(e); } };

// The view may send error reports to Sentry (and nowhere else).
function sentryOrigin() { try { return process.env.SENTRY_DSN ? [new URL(process.env.SENTRY_DSN).origin] : []; } catch { return []; } }

const DESC_SUFFIX = " Never pass figures you read yourself: pass references (IDs, channel names) and the planner's own percentages or amounts.";

export default {
  name: "media-plan",
  title: "Little Lantern Media Plans",
  version: "0.3.0",
  legacyPaths: ["/mcp"],
  view: { uri: "ui://media-plan/plan-v3.html", csp: { resourceDomains: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"], connectDomains: sentryOrigin() } },

  tools(reg) {
    const { z } = reg;
    const planId = z.string().describe("Plan ID from start_plan or list_clients");
    const money = { amount_gbp: z.number().optional().describe("Amount in pounds, as the planner said it"), share_pct: z.number().optional().describe("Percentage the planner asked for") };

    // ---- finding things
    reg.tool("list_clients", {
      title: "List clients", annotations: { readOnlyHint: true },
      description: "List the agency's clients (folders under Media Plans/Clients), their briefs and their saved plans.",
      inputSchema: {},
    }, guard(async () => {
      const cs = await service.listClients();
      return { content: [{ type: "text", text: cs.map((c) => `${c.client}: briefs ${c.briefs.map((b) => `"${b}"`).join(", ") || "none"}; plans ${c.plans.map((p) => `${p.id} (v${p.version})`).join(", ") || "none"}`).join("\n") || "No clients." }], structuredContent: { clients: cs } };
    }));

    reg.tool("list_sources", {
      title: "List sources", annotations: { readOnlyHint: true },
      description: "List the files in the Shared data folder and how each was read (read / read with warnings / couldn't read / refused), with what needs checking. reread=true re-reads every file from scratch.",
      inputSchema: { reread: z.boolean().optional() },
    }, guard(async ({ reread }) => {
      const st = await library.load({ force: Boolean(reread) });
      const text = st.reports.map((r) => `- ${r.file}: ${r.status.toUpperCase()}. ${r.summary}${(r.checkThese || []).length ? ` Check: ${r.checkThese.map((g) => `${g.count}× ${g.text.split(":")[0]}`).join("; ")}` : ""}`).join("\n");
      return { content: [{ type: "text", text: `Shared data, read ${st.readAt}:\n${text}` }], structuredContent: { readAt: st.readAt, reports: st.reports.map(({ sheets, ...r }) => r) } };
    }));

    reg.tool("get_rates", {
      title: "Get rates", annotations: { readOnlyHint: true },
      description: "Rate card lines from the Shared data folder, each with rate IDs to pass to add_channel, the buying unit, notes that change meaning (VAT, commission, uplifts, unconfirmed), and min spend. Hidden rates are left out unless include_hidden=true (only if the planner asks).",
      inputSchema: { search: z.string().optional().describe("Filter, e.g. 'Pip', 'online video', 'Sprout'"), include_hidden: z.boolean().optional() },
    }, guard(async (a) => {
      const rows = await service.rates(a);
      const text = rows.map((r) => `- ${r.entity} [${r.audienceBasis || "no audience basis"}] ${r.unit || ""}: ${r.rates.map((x) => `${x.metric} ${x.original}${x.hidden ? " (HIDDEN)" : ""} → rate_id "${x.id}"`).join("; ")}${r.minSpend ? `; min spend ${r.minSpend.original}` : ""}${r.notes.length ? `\n    notes: ${r.notes.join(" | ")}` : ""}`).join("\n");
      return { content: [{ type: "text", text: text || "No rates found." }], structuredContent: { rates: rows } };
    }));

    reg.tool("get_audience", {
      title: "Get audience figures", annotations: { readOnlyHint: true },
      description: "Reach/audience figures from the Shared data folder for one age band (e.g. '4-6', '7-9', '4-9') or 'parents'. Returns exact-band figures with IDs for add_audience_figure. If no source has that exact band, it says so plainly (e.g. 'reports 4-9 only. It can't be split to 4-6') and lists wider bands, which may only be used with the planner's agreement. Never estimate, split or average a band yourself.",
      inputSchema: { band: z.string(), search: z.string().optional().describe("Optional filter: channel, file or metric words") },
    }, guard(async (a) => {
      const q = await service.audience(a);
      const rows = q.rows.slice(0, 25).map((r) => `- ${r.entity || ""} · ${r.metric}${r.unit ? ` (${r.unit})` : ""} · ${r.audience} · ${r.period || "period not stated"}: ${r.original} [${r.match}] → value_id "${r.id}"${r.notes.length ? `\n    notes: ${r.notes.join(" | ")}` : ""}`).join("\n");
      const head = q.exactCount ? `${q.exactCount} figure(s) report exactly ${q.band}.` : `No source reports exactly ${q.band}.`;
      return { content: [{ type: "text", text: [head, ...q.messages, rows, q.total > 25 ? `(${q.total - 25} more; narrow with search)` : ""].filter(Boolean).join("\n") }], structuredContent: q };
    }));

    // ---- plans: start and show
    reg.appTool("start_plan", {
      title: "Start a media plan",
      description: "Start a new media plan for a client from the brief in its Briefs folder. Budget, dates and other details are read from the brief by the connector; anything not found is listed so you can ask the planner (then use set_brief_detail). Shows the plan in the agency's fixed template." + DESC_SUFFIX,
      inputSchema: { client: z.string().describe("Client name, e.g. 'Bramble Bots'"), brief_file: z.string().optional().describe("Only if the client has several briefs") },
    }, guard(async (a) => ok(await service.startPlan(a))));

    reg.appTool("open_plan", {
      title: "Open media plan",
      description: "Show a media plan (latest version) in the agency's fixed template, with its sign-off checks. Use after a batch of changes so the planner sees the result. Accepts a plan ID or a client name (opens that client's latest plan).",
      inputSchema: { plan: z.string().describe("Plan ID or client name") },
    }, guard(async ({ plan }) => ok(await service.open(plan))));

    reg.appTool("get_plan_view", {
      title: "Refresh plan view", description: "Used by the plan view to refresh itself.",
      inputSchema: { plan_id: planId }, _meta: { ui: { visibility: ["app"] } },
    }, guard(async ({ plan_id }) => ok(await service.open(plan_id))));

    // ---- changes (each saves a version and reruns the checks)
    const change = (name, title, description, schema, op, { show = false } = {}) => {
      const register = show ? reg.appTool : reg.tool;
      register(name, { title, description: description + DESC_SUFFIX, inputSchema: { plan_id: planId, ...schema } },
        guard(async ({ plan_id, ...args }) => ok(await service.apply(plan_id, op, args), show)));
    };

    change("set_brief_detail", "Set a brief detail", "Record a brief detail the brief didn't state clearly, exactly as the planner gave it in chat (it's shown as 'given by the planner'). key: budget (pounds), window ([start, end] as YYYY-MM-DD), approvalBy (YYYY-MM-DD), client, campaign, objective, audience, contact.",
      { key: z.enum(["budget", "window", "approvalBy", "client", "campaign", "objective", "audience", "contact"]), value: z.union([z.string(), z.number(), z.array(z.string())]), planner_words: z.string().describe("What the planner actually said") }, "set_brief_fact");
    change("add_channel", "Add a channel", `Add a channel line. category is one of: ${config.categories.join(", ")}. rate_id comes from get_rates (the line's delivery is calculated from it). audiences: who the line is aimed at, e.g. ["4-9"] or ["parents"]; needed for the under-13 and every-week checks.`,
      { name: z.string(), category: z.enum(config.categories), rate_id: z.string().optional(), use_hidden: z.boolean().optional(), audiences: z.array(z.string()).optional() }, "add_channel");
    change("remove_channel", "Remove a channel", "Remove a channel line; its budget becomes unallocated.", { channel: z.string() }, "remove_channel");
    change("set_line_audiences", "Set who a line is aimed at", "Set the audiences a channel line is aimed at, e.g. [\"4-9\"], [\"parents\"].", { channel: z.string(), audiences: z.array(z.string()) }, "set_line_audiences");
    change("set_allocation", "Set a channel budget", "Set one channel's budget, as an amount in pounds or a share of the brief budget. Totals and shares are recalculated in code; any gap to the brief budget is shown and checked.", { channel: z.string(), ...money }, "set_allocation", { show: true });
    change("move_budget", "Move budget between channels", "Move budget from one channel to another. The total stays exactly the same. For a percentage, basis says what it's a percentage of: of_total_budget or of_from_line (ask the planner if unclear).",
      { from: z.string(), to: z.string(), ...money, basis: z.enum(["of_total_budget", "of_from_line"]).optional() }, "move_budget", { show: true });
    change("set_flighting", "Set flighting", 'Set the weeks a channel is live: "all", week numbers (1 = first campaign week) or w/c dates (YYYY-MM-DD). Weeks outside the campaign window are refused.',
      { channel: z.string(), weeks: z.union([z.literal("all"), z.array(z.union([z.number(), z.string()]))]) }, "set_flighting");
    change("add_audience_figure", "Add an audience figure", "Add a reach/audience figure to the plan by its value_id from get_audience. for_band: the target band it's for. A wider band (e.g. 4-9 for 4-6) is only allowed with accept_wider=true after the planner agrees; it's then labelled with its real band.",
      { value_id: z.string(), for_band: z.string().optional(), accept_wider: z.boolean().optional() }, "add_audience_figure");
    change("remove_audience_figure", "Remove an audience figure", "Remove an audience figure from the plan.", { value_id: z.string() }, "remove_audience_figure");
    change("set_target_bands", "Set target audiences", "Set the plan's target age bands / audiences, e.g. [\"4-6\", \"7-9\", \"parents\"]. Bands with no exact data are listed as gaps on the audience slide.", { bands: z.array(z.string()) }, "set_target_bands");
    change("write_section", "Write a section", `Write words for a fixed slot: "objective" (max ${config.limits.objective} characters, from the brief's objective) or "rationale:<channel>" (max ${config.limits.rationale}). Rejected if too long, if it has a figure that isn't in the plan, if it has placeholders, or if it says what children think or feel.`,
      { slot: z.string(), text: z.string() }, "write_section");

    reg.tool("compare_options", {
      title: "Compare options",
      description: "Compare the current plan with 2-3 alternative splits side by side, without changing the plan. Each scenario lists allocations ({channel, amount_gbp | share_pct}) and/or moves ({from, to, amount_gbp | share_pct, basis}). Everything is calculated in code, including checks." + DESC_SUFFIX,
      inputSchema: { plan_id: planId, scenarios: z.array(z.object({ name: z.string(), allocations: z.array(z.object({ channel: z.string(), ...money })).optional(), moves: z.array(z.object({ from: z.string(), to: z.string(), ...money, basis: z.enum(["of_total_budget", "of_from_line"]).optional() })).optional() })).min(1).max(3) },
    }, guard(async ({ plan_id, scenarios }) => {
      const rows = await service.compare(plan_id, scenarios);
      const channels = [...new Set(rows.flatMap((r) => r.lines.map((l) => l.channel)))];
      const head = `| Channel | ${rows.map((r) => r.name).join(" | ")} |\n|---|${rows.map(() => "---").join("|")}|`;
      const body = channels.map((c) => `| ${c} | ${rows.map((r) => { const l = r.lines.find((x) => x.channel === c); return l ? `${l.budget} (${l.share}) · ${l.delivery}` : "–"; }).join(" | ")} |`).join("\n");
      const foot = `| Total | ${rows.map((r) => `${r.total}${r.unallocated !== "£0" ? ` (unallocated ${r.unallocated})` : ""}`).join(" | ")} |\n| Checks | ${rows.map((r) => `${r.checks.fail} fail, ${r.checks.warn} warn, ${r.checks.notRun} not run`).join(" | ")} |`;
      return { content: [{ type: "text", text: `${head}\n${body}\n${foot}\n\nNothing was changed. To apply one, use set_allocation or move_budget.\nFails: ${rows.map((r) => `${r.name}: ${r.fails.join("; ") || "none"}`).join(" / ")}` }], structuredContent: { scenarios: rows } };
    }));

    reg.tool("check_plan", {
      title: "Run sign-off checks", annotations: { readOnlyHint: true },
      description: "Run all sign-off checks on the plan now and list each result: pass, warning (needs a planner tick), fail, not run yet (data missing) or not checked (unknown rule).",
      inputSchema: { plan_id: planId },
    }, guard(async ({ plan_id }) => ok(await service.open(plan_id), false)));

    reg.tool("tick_warning", {
      title: "Tick a warning",
      description: "Record that a named person has reviewed a warning (e.g. the under-13 targeting check). Only when the planner says so, with their name. A tick lapses if the warning's wording changes.",
      inputSchema: { plan_id: planId, rule_id: z.string(), name: z.string() },
    }, guard(async ({ plan_id, ...a }) => ok(await service.tick(plan_id, a), false)));

    reg.tool("plan_versions", {
      title: "Plan versions", annotations: { readOnlyHint: true },
      description: "List a plan's saved versions with what changed in each.",
      inputSchema: { plan_id: planId },
    }, guard(async ({ plan_id }) => {
      const vs = await service.versions(plan_id);
      return { content: [{ type: "text", text: vs.map((v) => `v${v.version} ${v.savedAt.slice(0, 16).replace("T", " ")}: ${v.note}`).join("\n") }], structuredContent: { versions: vs.map(({ file, ...v }) => v) } };
    }));

    reg.tool("restore_version", {
      title: "Restore a version",
      description: "Restore an earlier version of a plan. It's saved as a new version; nothing is lost.",
      inputSchema: { plan_id: planId, version: z.number() },
    }, guard(async ({ plan_id, version }) => ok(await service.restore(plan_id, version), false)));

    reg.tool("get_plan_link", {
      title: "Get web link", annotations: { readOnlyHint: true },
      description: "The plan's read-only web link (same template), for people who don't use Claude.",
      inputSchema: { plan_id: planId },
    }, guard(async ({ plan_id }) => { const p = await service.getPlan(plan_id); return { content: [{ type: "text", text: service.link(p) }], structuredContent: { link: service.link(p) } }; }));
  },

  routes(app, ctx) {
    const css = readFileSync(path.join(ROOT, "core/mcp/app-shell/shell.css"), "utf8") + readFileSync(path.join(here, "template/plan.css"), "utf8");
    const markers = readFileSync(path.join(ROOT, "core/mcp/app-shell/markers.js"), "utf8").replace("export function", "function");
    app.get(["/p/:token", "/p/media-plan/:token"], async (req, res) => {
      const plan = await service.byToken(req.params.token);
      if (!plan) return res.status(404).type("text").send("This plan link doesn't exist or has been switched off.");
      const r = await service.present(plan, null);
      res.set("Cache-Control", "no-store").set("X-Robots-Tag", "noindex").type("html").send(`<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${r.vm.client} · ${r.vm.campaign?.text || "Media plan"}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Nunito:wght@700;800;900&display=swap">
<style>${css} body{background:#EDE8DC;} main{max-width:1040px;margin:0 auto;padding:24px 16px;}</style></head>
<body><main>${renderPlan(r.vm)}</main><script>${markers}; wireSourceMarkers(document);</script></body></html>`);
    });

    app.get("/admin/media-plan/sources", ctx.checkAdmin, async (req, res) => {
      const state = await library.load({ force: req.query.reread === "1" });
      res.set("Cache-Control", "no-store").type("html").send(readingReportsPage(state, { title: "Shared data reading report", heading: "Shared data: reading report", folderLabel: `Media Plans/${config.folders.sharedData}` }));
    });
    app.get("/admin/media-plan/sources.json", ctx.checkAdmin, async (req, res) => res.json(await library.load({ force: req.query.reread === "1" })));
  },

  // for tests
  _service: service, _docs: docs,
};
