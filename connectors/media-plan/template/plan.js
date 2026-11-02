// The ONE plan template. Used by the MCP App (bundled into the ui:// resource)
// and by the web view (/p/<token>, rendered on the server). Same function,
// same CSS, so the two always match.
//
// Every number shown is printed from plan data. The template never computes
// or invents figures except share % and totals, which are pure arithmetic on
// the plan's own budget lines.

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const gbp = (n) => "£" + Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 });

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

// Source marker: a small superscript that shows file/sheet/row on hover or tap.
const src = (s) => (s ? `<button class="src" type="button" data-src="${esc(s)}" aria-label="Source: ${esc(s)}">ⓘ</button>` : "");

const LANTERN = `<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M12 3v2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><rect x="7" y="5" width="10" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 9c1.6 1.6 1.6 4 0 5.5-1.6-1.5-1.6-3.9 0-5.5z" fill="#F5B731"/><path d="M9 21h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

function slide(n, title, body, plan) {
  return `<section class="slide" id="slide-${n}" aria-label="${esc(title)}">
  <header class="slide-head"><span class="slide-no">${n}</span><h2>${esc(title)}</h2>${plan.status === "DRAFT" ? '<span class="draft">DRAFT</span>' : ""}</header>
  <div class="slide-body">${body}</div>
  <footer class="slide-foot">${LANTERN}<span>Little Lantern Media</span><span class="fict">FICTIONAL DEMO DATA</span></footer>
</section>`;
}

const CHECK_ICON = { pass: "✓", warn: "!", fail: "✕", not_run: "–", not_checked: "?", off: "○" };
const CHECK_WORD = { pass: "Pass", warn: "Warning", fail: "Fail", not_run: "Not run yet", not_checked: "Not checked", off: "Off" };

// Checks come only from the rules engine. No result -> "not run", never "pass".
export function renderChecks(run) {
  if (!run || !run.results?.length) {
    return '<ul class="checks"><li class="not_run"><span class="ci">–</span><span><strong>Not run yet.</strong> No checks have run on this plan.</span></li></ul>';
  }
  const items = run.results.map((c) => `<li class="${esc(c.status)}"><span class="ci" aria-hidden="true">${CHECK_ICON[c.status] || "?"}</span>
    <span><span class="cw">${CHECK_WORD[c.status] || esc(c.status)}</span> <strong>${esc(c.title)}</strong><br><span class="cm">${esc(c.message || "")}</span>${c.needsTick ? (c.ticked ? ` <em>(ticked by ${esc(c.ticked.by)})</em>` : " <em>(needs planner tick)</em>") : ""}</span></li>`).join("");
  const s = run.summary;
  const ran = new Date(run.ranAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return `<ul class="checks">${items}</ul><p class="checks-sum">${s.pass} pass · ${s.warn} warning · ${s.fail} fail · ${s.notRun} not run · ${s.notChecked} not checked. Checked ${esc(ran)}.${s.canExportFinal ? "" : " Can't be exported as final yet."}</p>`;
}

export function planTotals(plan) {
  const total = plan.mix.reduce((a, r) => a + r.budget_gbp, 0);
  return { total, rows: plan.mix.map((r) => ({ ...r, share: total ? (r.budget_gbp / total) * 100 : 0 })) };
}

export function renderSummary(plan) {
  const { total } = planTotals(plan);
  return `<div class="summary">
  <div class="summary-brand">${LANTERN}<span>Media plan</span>${plan.status === "DRAFT" ? '<span class="draft">DRAFT</span>' : ""}</div>
  <h1>${esc(plan.client)} · ${esc(plan.campaign)}</h1>
  <dl class="kpis">
    <div><dt>Budget</dt><dd>${gbp(plan.budget_gbp)}</dd></div>
    <div><dt>Window</dt><dd>${fmtDate(plan.window.start)} – ${fmtDate(plan.window.end)}</dd></div>
    <div><dt>Channels</dt><dd>${plan.mix.length}</dd></div>
    <div><dt>Allocated</dt><dd>${gbp(total)}</dd></div>
  </dl>
  <p class="fict">FICTIONAL DEMO DATA · ${esc(plan.version)}</p>
</div>`;
}

export function renderPlan(plan) {
  const { total, rows } = planTotals(plan);
  const slides = [];

  slides.push(`<section class="slide cover" id="slide-1" aria-label="Cover">
  <div class="cover-inner">
    <div class="cover-brand">${LANTERN}<span>Little Lantern Media</span></div>
    <p class="eyebrow">Media plan${plan.status === "DRAFT" ? " · DRAFT" : ""}</p>
    <h1>${esc(plan.client)}</h1>
    <p class="cover-campaign">${esc(plan.campaign)}</p>
    <p class="cover-meta">${fmtDate(plan.window.start)} – ${fmtDate(plan.window.end)} · ${esc(plan.version)}</p>
    <p class="cover-by">Prepared by Little Lantern Media</p>
  </div>
  <footer class="slide-foot"><span class="fict">FICTIONAL DEMO DATA</span></footer>
</section>`);

  slides.push(slide(2, "The brief", `<dl class="brief">
    <div><dt>Objective</dt><dd>${esc(plan.objective)}</dd></div>
    <div><dt>Audience</dt><dd>${esc(plan.audience)}</dd></div>
    <div><dt>Budget</dt><dd class="num">${gbp(plan.budget_gbp)}</dd></div>
    <div><dt>Campaign window</dt><dd>${fmtDate(plan.window.start)} – ${fmtDate(plan.window.end)}</dd></div>
  </dl>`, plan));

  const rc = plan.reach.columns;
  slides.push(slide(3, "Who we're reaching", `<table class="t">
    <thead><tr><th>Channel</th>${rc.map((c) => `<th class="num">${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${plan.reach.rows.map((r) => `<tr><td>${esc(r.channel)}${r.note ? `<div class="cell-note">${esc(r.note)}</div>` : ""}</td>${r.values.map((v) => `<td class="num">${v == null ? '<span class="nv">not reported</span>' : esc(v) + src(r.src)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table><p class="foot-note">${esc(plan.reach.note)}</p>`, plan));

  slides.push(slide(4, "Channel mix", `<table class="t">
    <thead><tr><th>Channel</th><th class="num">Budget</th><th class="num">Share</th><th class="num">Est. impressions</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${esc(r.channel)}</td><td class="num">${gbp(r.budget_gbp)}${src(r.src)}</td><td class="num">${r.share.toFixed(1)}%</td><td class="num">${esc(r.impressions)}${src(r.src)}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${gbp(total)}</td><td class="num">${total ? "100.0%" : "–"}</td><td></td></tr></tfoot>
  </table>`, plan));

  const w = plan.flighting.weeks;
  slides.push(slide(5, "When", `<table class="t flight">
    <thead><tr><th>Channel</th>${w.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead>
    <tbody>${plan.flighting.rows.map((r) => `<tr><td>${esc(r.channel)}</td>${r.on.map((on) => `<td>${on ? '<span class="on" aria-label="live"></span>' : '<span class="off" aria-label="off"></span>'}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>`, plan));

  slides.push(slide(6, "Why these channels", `<ul class="why">${plan.rationale.map((r) => `<li><strong>${esc(r.channel)}</strong><span>${esc(r.text)}</span></li>`).join("")}</ul>`, plan));

  slides.push(slide(7, "Sign-off checks", renderChecks(plan.checkRun) + `
  <p class="signoff">Planning Director sign-off: ${plan.signoff?.director ? esc(plan.signoff.director) + ", " + fmtDate(plan.signoff.date) : "<em>not signed</em>"} · ${esc(plan.version)}</p>`, plan));

  slides.push(slide(8, "Next steps", `<dl class="brief">
    <div><dt>Approval needed by</dt><dd>${fmtDate(plan.next_steps.approval_by)}</dd></div>
    <div><dt>Contact</dt><dd>${esc(plan.next_steps.contact)}</dd></div>
  </dl>`, plan));

  return `<div class="deck">${slides.join("\n")}</div>`;
}
