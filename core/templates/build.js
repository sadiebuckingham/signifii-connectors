// Builds each connector's in-Claude view into one self-contained HTML file
// (CSS + JS inline, no CDN scripts): dist/<connector>.html.
// Usage: node core/templates/build.js [connector ...]   (default: all with a view.js)
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SHELL_CSS = readFileSync(path.join(ROOT, "core/mcp/app-shell/shell.css"), "utf8");

export async function buildView(name) {
  const dir = path.join(ROOT, "connectors", name);
  const cfg = JSON.parse(readFileSync(path.join(dir, "view.json"), "utf8"));
  const js = await build({ entryPoints: [path.join(dir, "view.js")], bundle: true, format: "esm", target: "es2022", minify: true, write: false, platform: "browser",
    // Sentry DSN (not a secret: it only allows sending error reports) baked in at build time
    define: { __SENTRY_DSN__: JSON.stringify(process.env.SENTRY_DSN || ""), __RELEASE__: JSON.stringify(process.env.RENDER_GIT_COMMIT || "") } });
  const css = SHELL_CSS + "\n" + cfg.css.map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");
  const script = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const fonts = (cfg.fontsCss || []).map((u) => `<link rel="stylesheet" href="${u}">`).join("");
  const html = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${cfg.title}</title>${fonts}
<style>${css}</style></head>
<body><main id="root"></main>
<script type="module">${script}</script>
</body></html>`;
  mkdirSync(path.join(ROOT, "dist"), { recursive: true });
  writeFileSync(path.join(ROOT, "dist", `${name}.html`), html);
  return { name, kb: (html.length / 1024).toFixed(1) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const names = process.argv.slice(2).length ? process.argv.slice(2)
    : readdirSync(path.join(ROOT, "connectors")).filter((n) => existsSync(path.join(ROOT, "connectors", n, "view.js")));
  for (const n of names) { const r = await buildView(n); console.log(`built dist/${r.name}.html ${r.kb} KB`); }
}
