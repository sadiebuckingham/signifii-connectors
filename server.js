// Entry point. CONNECTOR chooses which connectors this service runs
// (comma-separated, e.g. "media-plan" or "media-plan,canva-guides"). Default: media-plan.
import { createApp } from "./core/mcp/server.js";

const names = (process.env.CONNECTOR || "media-plan").split(",").map((s) => s.trim()).filter(Boolean);
const connectors = [];
for (const n of names) connectors.push((await import(`./connectors/${n}/index.js`)).default);
const { app } = createApp(connectors);
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, "0.0.0.0", () => console.log(`signifii connectors [${names.join(", ")}] on :${PORT}`));
