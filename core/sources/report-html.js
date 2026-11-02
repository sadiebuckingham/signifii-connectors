// Reading reports as HTML. Shared by every connector's admin page (and used
// to publish a preview). Pure function of the reports; no data is invented.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const STATUS = {
  "read": { cls: "ok", label: "Read" },
  "read with warnings": { cls: "warn", label: "Read with warnings" },
  "couldn't read": { cls: "bad", label: "Couldn't read" },
  "refused": { cls: "bad", label: "Refused" },
};
const ROLE = { entity: "name", audience: "audience", period: "date", measure: "figure", metric: "metric name", unit: "buying unit", notes: "notes", attribute: "label" };

export const REPORT_CSS = `
/* Layout: one column of file sections, summary strip first. Spreadsheet vocabulary (cell refs, ranges) set in mono. */
:root {
  --paper: #F7F7F4; --surface: #FFFFFF; --ink: #1C2433; --muted: #5E6878; --line: #DADDE3; --accent: #2F5D8A;
  --ok: #2E6B45; --ok-bg: #E4F0E7; --warn: #8A5A00; --warn-bg: #FBF0D9; --bad: #9B2C24; --bad-bg: #F8E3E0; --chip: #EEF1F5;
  --sans: "IBM Plex Sans", system-ui, sans-serif; --mono: "IBM Plex Mono", ui-monospace, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --paper: #14181F; --surface: #1C222B; --ink: #E7EAF0; --muted: #9AA3B2; --line: #313946; --accent: #8DB4DC;
  --ok: #8FCFA2; --ok-bg: #1E3226; --warn: #E8C277; --warn-bg: #3A2F15; --bad: #F0A097; --bad-bg: #3D211E; --chip: #262D38; color-scheme: dark; } }
:root[data-theme="dark"] {
  --paper: #14181F; --surface: #1C222B; --ink: #E7EAF0; --muted: #9AA3B2; --line: #313946; --accent: #8DB4DC;
  --ok: #8FCFA2; --ok-bg: #1E3226; --warn: #E8C277; --warn-bg: #3A2F15; --bad: #F0A097; --bad-bg: #3D211E; --chip: #262D38; color-scheme: dark; }
body { background: var(--paper); color: var(--ink); font: 15px/1.55 var(--sans); }
.wrap { max-width: 980px; margin: 0 auto; padding-block: 28px 64px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 28px; }
h1 { font-size: 28px; line-height: 1.15; margin: 0; text-wrap: balance; }
h2 { font-size: 19px; margin: 0; font-family: var(--mono); font-weight: 600; overflow-wrap: anywhere; }
h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin: 0 0 8px; }
.lede { color: var(--muted); margin: 6px 0 0; max-width: 68ch; }
.mono { font-family: var(--mono); font-size: .92em; }
.strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
.strip a { display: grid; gap: 4px; padding: 12px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; color: inherit; text-decoration: none; min-width: 0; }
.strip a:hover, .strip a:focus-visible { border-color: var(--accent); outline: none; }
.strip .fn { font-family: var(--mono); font-size: 12.5px; overflow-wrap: anywhere; }
.pill { justify-self: start; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 2px 9px; border-radius: 99px; }
.pill::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.pill.ok { color: var(--ok); background: var(--ok-bg); } .pill.warn { color: var(--warn); background: var(--warn-bg); } .pill.bad { color: var(--bad); background: var(--bad-bg); }
.file { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 20px; display: grid; gap: 18px; min-width: 0; scroll-margin-top: 16px; }
.file-head { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
.counts { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; font-variant-numeric: tabular-nums; color: var(--muted); font-size: 13.5px; }
.counts b { color: var(--ink); font-weight: 600; }
.cols2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px; }
.cols2 > * { min-width: 0; }
.table-read { border-top: 1px solid var(--line); padding-top: 12px; display: grid; gap: 8px; }
.table-read:first-of-type { border-top: 0; padding-top: 0; }
.tmeta { font-size: 13.5px; color: var(--muted); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font-size: 12.5px; background: var(--chip); border-radius: 6px; padding: 2px 8px; overflow-wrap: anywhere; }
.chip i { font-style: normal; color: var(--muted); }
.chip.hidden { outline: 1px dashed var(--warn); }
ul.plain { list-style: none; padding: 0; margin: 0; display: grid; gap: 7px; }
ul.plain li { font-size: 14px; }
.check { display: grid; grid-template-columns: 3.2em 1fr; gap: 10px; }
.check .n { font-family: var(--mono); font-variant-numeric: tabular-nums; text-align: right; color: var(--warn); font-weight: 600; }
.ex { display: block; font-family: var(--mono); font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
.issue { padding-left: 12px; border-left: 3px solid var(--warn); }
.issue.bad { border-left-color: var(--bad); }
.none { color: var(--muted); font-size: 14px; margin: 0; }
.fict { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
`;

function fileSection(r, i) {
  const st = STATUS[r.status] || { cls: "bad", label: r.status };
  const c = r.counts || {};
  const tables = (r.sheets || []).flatMap((s) => s.tables.map((t) => ({ ...t, sheet: s.sheet })));
  const tablesHtml = tables.map((t) => `<div class="table-read">
      <div><b>${esc(t.sheet)}</b> <span class="mono">${esc(t.range)}</span> · ${t.rows} row${t.rows === 1 ? "" : "s"}${t.layout === "label_value" ? " · label/value list" : ""}</div>
      <div class="tmeta">${[t.title && `Title: ${esc(t.title)}`, t.period && `Period: ${esc(t.period.from)}${t.period.to ? ` to ${esc(t.period.to)}` : ""} <span class="mono">(${esc(t.period.original)})</span>`, t.unit && `Unit: ${esc(t.unit)}`, t.groups?.length && `Groups carried down: ${t.groups.map(esc).join(", ")}`].filter(Boolean).join(" · ") || ""}</div>
      ${t.columns?.length ? `<div class="chips">${t.columns.map((col) => `<span class="chip${col.hidden ? " hidden" : ""}">${esc(col.label)} <i>${ROLE[col.role] || esc(col.role)}${col.percent ? ", %" : ""}${col.hidden ? ", hidden" : ""}</i></span>`).join("")}</div>` : ""}
      ${t.decisions?.length ? `<ul class="plain">${t.decisions.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
    </div>`).join("");
  const checks = (r.checkThese || []).map((g) => `<li class="check"><span class="n">${g.count}</span><span>${esc(g.text)}${g.details?.length ? `<span class="ex">${g.details.map(esc).join(" · ")}</span>` : ""}<span class="ex">${g.examples.map(esc).join(" · ")}</span></span></li>`).join("");
  const issues = (r.issues || []).map((x) => `<li class="issue${x.level === "fail" ? " bad" : ""}"><span class="mono">${esc(x.sheet ? `${x.sheet}!` : "")}${esc(x.ref)}</span> ${esc(x.text)}</li>`).join("");
  const skipped = (r.skipped || []).map((x) => `<li><span class="mono">${esc(x.sheet)}!${esc(x.ref)}</span> ${esc(x.text)}</li>`).join("");
  const notes = tables.flatMap((t) => (t.notes || []).map((n) => ({ ...n, sheet: t.sheet }))).filter((n) => !/^notes?:?$/i.test(n.text.trim()));
  const notesHtml = notes.map((n) => `<li><span class="mono">${esc(n.sheet)}!${esc(n.ref)}</span> ${esc(n.text)}</li>`).join("");

  return `<section class="file" id="file-${i + 1}" aria-labelledby="fh-${i + 1}">
    <div class="file-head"><h2 id="fh-${i + 1}">${esc(r.file)}</h2><span class="pill ${st.cls}">${st.label}</span></div>
    <p class="lede" style="margin:0">${esc(r.summary)}</p>
    ${c.values != null ? `<p class="counts"><span><b>${c.values}</b> values</span><span><b>${c.numbers}</b> numbers</span><span><b>${c.ranges}</b> ranges</span><span><b>${c.noValue}</b> no value</span><span><b>${c.hidden}</b> hidden</span><span><b>${c.modelled}</b> modelled</span><span><b>${c.needsReview}</b> need review</span></p>` : ""}
    ${tables.length ? `<div><h3>What was read</h3>${tablesHtml}</div>` : ""}
    <div class="cols2">
      <div><h3>Check these</h3>${checks ? `<ul class="plain">${checks}</ul>` : '<p class="none">Nothing unusual.</p>'}</div>
      <div><h3>Couldn't read / needs review</h3>${issues ? `<ul class="plain">${issues}</ul>` : '<p class="none">Nothing. Every value was read cleanly or flagged under "Check these".</p>'}
        <h3 style="margin-top:16px">Skipped on purpose</h3>${skipped ? `<ul class="plain">${skipped}</ul>` : '<p class="none">Nothing skipped.</p>'}</div>
    </div>
    ${notesHtml ? `<div><h3>Notes kept from the file</h3><ul class="plain">${notesHtml}</ul></div>` : ""}
  </section>`;
}

export function renderReadingReports(state, { heading = "Reading report", folderLabel } = {}) {
  const reports = state.reports || [];
  const when = new Date(state.readAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });
  const tally = (s) => reports.filter((r) => r.status === s).length;
  return `<div class="wrap">
  <header>
    <p class="fict">FICTIONAL DEMO DATA</p>
    <h1>${esc(heading)}</h1>
    <p class="lede">${reports.length} file${reports.length === 1 ? "" : "s"} in <span class="mono">${esc(folderLabel || state.folder)}</span>, read ${esc(when)}. ${tally("read")} read cleanly, ${tally("read with warnings")} read with warnings, ${tally("couldn't read")} couldn't be read, ${tally("refused")} refused. Nothing below was guessed: anything uncertain is listed under “Check these” or “Couldn't read”.</p>
  </header>
  <nav class="strip" aria-label="Files">${reports.map((r, i) => { const st = STATUS[r.status] || { cls: "bad", label: r.status }; return `<a href="#file-${i + 1}"><span class="fn">${esc(r.file)}</span><span class="pill ${st.cls}">${st.label}</span></a>`; }).join("")}</nav>
  ${reports.map(fileSection).join("\n")}
</div>`;
}

export function readingReportsPage(state, opts = {}) {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title || "Source reading report")}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>body{margin:0}${REPORT_CSS}</style></head><body>${renderReadingReports(state, opts)}</body></html>`;
}
