// Media Plan Connector — SPIKE (build step 1).
// One remote MCP server (Streamable HTTP, stateless) with one tool that opens a
// dummy plan in an MCP App, plus the same template as a web page at /p/<token>.
// FICTIONAL DEMO DATA ONLY.
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { renderPlan } from "../ui/template.js";
import { checkConnectorAuth, checkAdmin, safeEqual } from "./auth.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");
const APP_HTML = readFileSync(path.join(ROOT, "dist/plan-app.html"), "utf8");
const PLAN_CSS = readFileSync(path.join(ROOT, "ui/plan.css"), "utf8");
const MARKERS_JS = readFileSync(path.join(ROOT, "ui/markers.js"), "utf8").replace("export function", "function");
const DUMMY_PLAN = JSON.parse(readFileSync(path.join(ROOT, "data/dummy-plan.json"), "utf8"));

const PLAN_UI = "ui://media-plan/plan-v1.html"; // bump the version suffix when the HTML changes (hosts may cache)
const PUBLIC_URL = process.env.PUBLIC_URL || ""; // e.g. https://media-plan-connector.onrender.com
const PLAN_LINK_TOKEN = process.env.PLAN_LINK_TOKEN || ""; // unguessable token for /p/<token>

// In-memory ring buffer of what each host reported about itself (spike only).
const hostReports = [];

function buildServer() {
  const server = new McpServer({ name: "little-lantern-media-plans", version: "0.1.0" });

  registerAppTool(server, "open_plan", {
    title: "Open media plan",
    description:
      "Open a media plan in Little Lantern Media's fixed plan template, shown as an interactive view in the conversation. " +
      "SPIKE: only the dummy brief 'bramble-bots-q4' exists, and its numbers are placeholders. " +
      "Do not restate figures from the plan in your reply; the view shows them with their sources.",
    inputSchema: { brief_id: z.string().describe("Brief ID, e.g. 'bramble-bots-q4'") },
    _meta: { ui: { resourceUri: PLAN_UI } },
  }, async ({ brief_id }) => {
    if (brief_id !== DUMMY_PLAN.brief_id) {
      return { isError: true, content: [{ type: "text", text: `No brief '${brief_id}'. In the spike the only brief is '${DUMMY_PLAN.brief_id}'.` }] };
    }
    const webLink = PUBLIC_URL && PLAN_LINK_TOKEN ? `${PUBLIC_URL}/p/${PLAN_LINK_TOKEN}` : null;
    return {
      content: [{ type: "text", text:
        `Opened plan ${DUMMY_PLAN.plan_id} (${DUMMY_PLAN.client}, ${DUMMY_PLAN.campaign}) in the plan view. ` +
        `This is a spike with dummy numbers.${webLink ? ` Web view: ${webLink}` : ""}` }],
      structuredContent: { plan: DUMMY_PLAN, webLink },
    };
  });

  // Called by the view only (hidden from the model) so we can see, from the
  // server logs, how each Claude surface actually hosts the app.
  registerAppTool(server, "spike_report_host", {
    title: "Spike: report host context",
    description: "Internal diagnostics sent by the plan view. Not for the model.",
    inputSchema: { reason: z.string().max(200), report: z.string().max(20000) },
    _meta: { ui: { resourceUri: PLAN_UI, visibility: ["app"] } },
  }, async ({ reason, report }) => {
    let parsed; try { parsed = JSON.parse(report); } catch { parsed = { raw: report.slice(0, 2000) }; }
    const entry = { received: new Date().toISOString(), reason, ...parsed };
    hostReports.push(entry); if (hostReports.length > 100) hostReports.shift();
    console.log("SPIKE_HOST_REPORT " + JSON.stringify(entry));
    return { content: [{ type: "text", text: "ok" }] };
  });

  registerAppResource(server, "Media plan view", PLAN_UI, { description: "Little Lantern Media plan template" }, async () => ({
    contents: [{
      uri: PLAN_UI,
      mimeType: RESOURCE_MIME_TYPE,
      text: APP_HTML,
      _meta: { ui: {
        csp: { resourceDomains: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"] },
        prefersBorder: true,
      } },
    }],
  }));
  return server;
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true, version: "spike-0.1.0" }));

async function handleMcp(req, res) {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
const notAllowed = (_req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });

// Two ways in, same check (see RUNBOOK "Auth"): header token, or secret path segment.
app.post("/mcp", (req, res, next) => checkConnectorAuth(req, res, next, null), handleMcp);
app.post("/mcp/:token", (req, res, next) => checkConnectorAuth(req, res, next, req.params.token), handleMcp);
app.get(["/mcp", "/mcp/:token"], notAllowed);
app.delete(["/mcp", "/mcp/:token"], notAllowed);

// Read-only web view: same template, same CSS.
app.get("/p/:token", (req, res) => {
  if (!PLAN_LINK_TOKEN || !safeEqual(req.params.token, PLAN_LINK_TOKEN)) return res.status(404).send("Not found");
  res.set("Cache-Control", "no-store").set("X-Robots-Tag", "noindex").type("html").send(`<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${DUMMY_PLAN.client} · ${DUMMY_PLAN.campaign} · Media plan</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Nunito:wght@700;800;900&display=swap">
<style>${PLAN_CSS} body{background:#EDE8DC;} main{max-width:1040px;margin:0 auto;padding:24px 16px;}</style></head>
<body><main>${renderPlan(DUMMY_PLAN)}</main><script>${MARKERS_JS}; wireSourceMarkers(document);</script></body></html>`);
});

// Spike findings: what each host reported (admin password).
app.get("/spike/reports", checkAdmin, (_req, res) => res.json(hostReports));

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, "0.0.0.0", () => console.log(`media-plan-connector (spike) on :${PORT}`));
