// Usage: node test/run-host.mjs <baseUrl> <outDir>
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync } from "node:fs";
const [base, out] = process.argv.slice(2);
const bundle = readFileSync(new URL("./.host.bundle.js", import.meta.url), "utf8");
const browser = await chromium.launch();
for (const [name, width, theme] of [["desktop", 700, "light"], ["mobile", 360, "dark"]]) {
  const page = await browser.newPage({ viewport: { width: width === 700 ? 1200 : 400, height: 900 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route(base + "/__host", (r) => r.fulfill({ contentType: "text/html",
    body: `<!doctype html><body style="margin:16px;background:${theme === "dark" ? "#262624" : "#fff"}"><script>window.HOST_WIDTH=${width};window.HOST_THEME="${theme}"</script><script type="module">${bundle.replace(/<\/script/g, "<\\/script")}</script></body>` }));
  await page.goto(base + "/__host");
  await page.waitForFunction(() => window.ready, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}-inline.png`, fullPage: true });
  const frame = page.frames()[1];
  await frame.click("#mode-full");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}-fullscreen.png`, fullPage: true });
  console.log(name, JSON.stringify({ log: await page.evaluate(() => window.log), meta: await page.evaluate(() => window.resourceMeta), errors }));
}
await browser.close();
