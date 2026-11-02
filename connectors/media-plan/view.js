// In-Claude view for the media plan: the shared app shell + this connector's template.
import { startApp } from "../../core/mcp/app-shell/app.js";
import { renderPlan, renderSummary } from "./template/plan.js";

startApp({
  name: "Little Lantern Media Plan",
  fullLabel: "Open full plan",
  reportTool: "report_host_context",
  renderSummary: (d) => renderSummary(d.plan),
  renderFull: (d) => renderPlan(d.plan),
});
