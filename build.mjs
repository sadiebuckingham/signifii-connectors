// Builds dist/plan-app.html: one self-contained HTML file (CSS + JS inline),
// served as the MCP App ui:// resource. No CDN scripts, so the CSP only needs
// the Google Fonts origins.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
const js = await build({
  entryPoints: ["ui/app.js"], bundle: true, format: "esm", target: "es2022",
  minify: true, write: false, platform: "browser",
});
const css = readFileSync("ui/plan.css", "utf8");
const script = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

writeFileSync("dist/plan-app.html", `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Media plan</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Nunito:wght@700;800;900&display=swap">
<style>${css}</style></head>
<body><main id="root"></main>
<script type="module">${script}</script>
</body></html>`);
console.log("built dist/plan-app.html", (readFileSync("dist/plan-app.html").length / 1024).toFixed(1) + " KB");
