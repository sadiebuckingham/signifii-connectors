// Shared server for every connector: one Express app, each connector's MCP
// endpoint at /mcp/<name> (Streamable HTTP, stateless), its in-Claude view
// as a ui:// resource, and its own web routes. Which connectors run is set by
// the CONNECTOR environment variable (comma-separated), see /server.js.
import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { checkConnectorAuth, checkAdmin } from "../auth/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * A connector module exports:
 *   name, title, version
 *   view: { uri, csp }                      its ui:// resource (built into dist/<name>.html)
 *   setup(ctx) -> Promise<void>             one-time setup (stores, libraries)
 *   tools(reg)                              registers tools via reg.appTool / reg.tool
 *   routes(app, ctx)                        optional web routes (web view, admin)
 */
export function createApp(connectors) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));
  app.get("/healthz", (_req, res) => res.json({ ok: true, connectors: connectors.map((c) => c.name) }));

  const hostReports = [];
  const ctx = { root: ROOT, publicUrl: process.env.PUBLIC_URL || "", checkAdmin, hostReports };

  for (const c of connectors) {
    const html = readFileSync(path.join(ROOT, "dist", `${c.name}.html`), "utf8");

    const buildServer = () => {
      const server = new McpServer({ name: c.title, version: c.version });
      const reg = {
        appTool: (name, config, handler) => registerAppTool(server, name, { ...config, _meta: { ...(config._meta || {}), ui: { resourceUri: c.view.uri, ...(config._meta?.ui || {}) } } }, handler),
        tool: (name, config, handler) => server.registerTool(name, config, handler),
        z,
      };
      c.tools(reg, ctx);
      // App-only diagnostics: how the host displays the view (never shown to the model).
      reg.appTool("report_host_context", {
        title: "Report host context", description: "Internal diagnostics sent by the view. Not for the model.",
        inputSchema: { reason: z.string().max(200), report: z.string().max(20000) }, _meta: { ui: { visibility: ["app"] } },
      }, async ({ reason, report }) => {
        let parsed; try { parsed = JSON.parse(report); } catch { parsed = { raw: report.slice(0, 2000) }; }
        const entry = { connector: c.name, received: new Date().toISOString(), reason, ...parsed };
        hostReports.push(entry); if (hostReports.length > 200) hostReports.shift();
        console.log("HOST_REPORT " + JSON.stringify(entry));
        return { content: [{ type: "text", text: "ok" }] };
      });
      registerAppResource(server, `${c.title} view`, c.view.uri, { description: `${c.title} template` }, async () => ({
        contents: [{ uri: c.view.uri, mimeType: RESOURCE_MIME_TYPE, text: html, _meta: { ui: { csp: c.view.csp || {}, prefersBorder: true } } }],
      }));
      return server;
    };

    const handle = async (req, res) => {
      const server = buildServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => { transport.close(); server.close(); });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (e) {
        console.error(`[${c.name}] MCP error`, e);
        if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
      }
    };
    const notAllowed = (_req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
    const paths = [`/mcp/${c.name}`];
    if (c.legacyPaths) paths.push(...c.legacyPaths); // keeps an already-added connector link working
    for (const p of paths) {
      app.post(p, (req, res, next) => checkConnectorAuth(req, res, next, null), handle);
      app.post(`${p}/:token`, (req, res, next) => checkConnectorAuth(req, res, next, req.params.token), handle);
      app.get([p, `${p}/:token`], notAllowed);
      app.delete([p, `${p}/:token`], notAllowed);
    }
    c.routes?.(app, ctx);
  }

  app.get("/admin/host-reports", checkAdmin, (_req, res) => res.json(hostReports));
  return { app, ctx };
}
