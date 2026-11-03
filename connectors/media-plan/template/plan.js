// The ONE plan template: 8 slides in Little Lantern Media's fixed order.
// Used by the in-Claude view (bundled) and the web page (rendered on the
// server), so the two always match. It only lays out a prepared view model:
// it never calculates or invents a figure.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Source marker: shows file · sheet · cell (or the calculation) on hover or tap.
const src = (s) => (s ? `<button class="src" type="button" data-src="${esc(s)}" aria-label="Where this figure comes from">ⓘ</button>` : "");
const missingText = (what) => `<span class="nv">${esc(what)}</span>`;
const val = (f, empty) => (f && f.text ? `${esc(f.text)}${src(f.src)}` : missingText(empty));

const LANTERN = `<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M12 3v2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><rect x="7" y="5" width="10" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 9c1.6 1.6 1.6 4 0 5.5-1.6-1.5-1.6-3.9 0-5.5z" fill="#F5B731"/><path d="M9 21h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

function slide(n, title, body, vm, cls = "") {
  return `<section class="slide ${cls}" id="slide-${n}" aria-label="${esc(title)}">
  <header class="slide-head"><span class="slide-no">${n}</span><h2>${esc(title)}</h2>${vm.status === "DRAFT" ? '<span class="draft">DRAFT</span>' : ""}</header>
  <div class="slide-body">${body}</div>
  <footer class="slide-foot">${LANTERN}<span>Little Lantern Media</span><span class="fict">FICTIONAL DEMO DATA · ${esc(vm.versionLabel)}</span></footer>
</section>`;
}

const CHECK_ICON = { pass: "✓", warn: "!", fail: "✕", not_run: "–", not_checked: "?", off: "○" };
const CHECK_WORD = { pass: "Pass", warn: "Warning", fail: "Fail", not_run: "Not run yet", not_checked: "Not checked", off: "Off" };

// Checks come only from the rules engine. No result -> "not run", never "pass".
export function renderChecks(run) {
  if (!run || !run.results?.length) {
    return '<ul class="checks"><li class="not_run"><span class="ci">–</span><span><strong>Not run yet.</strong> No checks have run on this plan.</span></li></ul>';
  }
  const items = run.results.filter((c) => c.status !== "off").map((c) => `<li class="${esc(c.status)}"><span class="ci" aria-hidden="true">${CHECK_ICON[c.status] || "?"}</span>
    <span><span class="cw">${CHECK_WORD[c.status] || esc(c.status)}</span> <strong>${esc(c.title)}</strong><br><span class="cm">${esc(c.message || "")}</span>${c.needsTick ? (c.ticked ? ` <em>(ticked by ${esc(c.ticked.by)})</em>` : " <em>(needs planner tick)</em>") : ""}</span></li>`).join("");
  const s = run.summary;
  const ran = new Date(run.ranAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return `<ul class="checks">${items}</ul><p class="checks-sum">${s.pass} pass · ${s.warn} warning · ${s.fail} fail · ${s.notRun} not run · ${s.notChecked} not checked. Checked ${esc(ran)}.${s.canExportFinal ? " Ready for sign-off." : " Can't be signed off yet."}</p>`;
}

export function renderSummary(vm) {
  const s = vm.checkRun?.summary;
  return `<div class="summary">
  <div class="summary-brand">${LANTERN}<span>Media plan</span>${vm.status === "DRAFT" ? '<span class="draft">DRAFT</span>' : ""}</div>
  <h1>${esc(vm.client)} · ${esc(vm.campaign?.text || "Campaign not named yet")}</h1>
  <dl class="kpis">
    <div><dt>Budget</dt><dd>${vm.budget?.text ? esc(vm.budget.text) : "Not known yet"}</dd></div>
    <div><dt>Allocated</dt><dd>${esc(vm.total.budget)}${vm.unallocated ? ` <small>(${esc(vm.unallocated)})</small>` : ""}</dd></div>
    <div><dt>Channels</dt><dd>${vm.lines.length}</dd></div>
    <div><dt>Checks</dt><dd>${s ? `${s.fail} fail · ${s.warn} warn · ${s.notRun} not run` : "Not run"}</dd></div>
  </dl>
  ${vm.missing.length ? `<p class="summary-missing">Still needed: ${vm.missing.map((m) => esc(m.ask)).join(" ")}</p>` : ""}
  <p class="fict">FICTIONAL DEMO DATA · ${esc(vm.versionLabel)}</p>
</div>`;
}

export function renderPlan(vm) {
  const slides = [];

  slides.push(`<section class="slide cover" id="slide-1" aria-label="Cover">
  <div class="cover-inner">
    <div class="cover-brand">${LANTERN}<span>Little Lantern Media</span></div>
    <p class="eyebrow">Media plan${vm.status === "DRAFT" ? " · DRAFT" : ""}</p>
    <h1>${esc(vm.client)}</h1>
    <p class="cover-campaign">${esc(vm.campaign?.text || "")}</p>
    <p class="cover-meta">${vm.window?.text ? esc(vm.window.text) : "Dates not known yet"} · ${esc(vm.versionLabel)}</p>
    <p class="cover-by">Prepared by Little Lantern Media</p>
  </div>
  <footer class="slide-foot"><span class="fict">FICTIONAL DEMO DATA</span></footer>
</section>`);

  slides.push(slide(2, "The brief", `<dl class="brief">
    <div><dt>Objective</dt><dd>${vm.objective?.text ? `${esc(vm.objective.text)}${src(vm.objective.src)}${vm.objective.fromBrief ? ` <span class="nv">(the brief's own wording; the plan's short version isn't written yet)</span>` : ""}` : missingText("Not written yet")}</dd></div>
    <div><dt>Audience</dt><dd>${val(vm.audienceText, "Not stated in the brief")}</dd></div>
    <div><dt>Budget</dt><dd>${val(vm.budget, "Not stated in the brief: ask the planner")}</dd></div>
    <div><dt>Campaign window</dt><dd>${val(vm.window, "Not stated in the brief: ask the planner")}</dd></div>
  </dl>`, vm));

  slides.push(slide(3, "Who we're reaching", (vm.figures.length ? `<div class="tw"><table class="t">
    <thead><tr><th>Source</th><th>Audience (as reported)</th><th>Measure</th><th>Period</th><th class="num">Figure</th></tr></thead>
    <tbody>${vm.figures.map((f) => `<tr><td>${esc(f.entity)}</td><td>${esc(f.audience)}</td><td>${esc(f.metric)}</td><td>${esc(f.period || "")}</td><td class="num${f.status === "missing" || f.status === "changed" ? " flagged" : ""}">${esc(f.value)}${src(f.src)}</td></tr>`).join("")}</tbody>
  </table></div>` : `<p>${missingText("No audience figures chosen yet.")}</p>`) +
    (vm.gaps.length ? `<ul class="gaps">${vm.gaps.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : "") +
    `<p class="foot-note">Figures are shown exactly as each source reports them. Age bands are never split, scaled or added together.</p>`, vm));

  slides.push(slide(4, "Channel mix", vm.lines.length ? `<div class="tw"><table class="t">
    <thead><tr><th>Channel</th><th class="num">Budget</th><th class="num">Share</th><th class="num">Est. delivery</th></tr></thead>
    <tbody>${vm.lines.map((l) => `<tr><td>${esc(l.channel)}<div class="cell-note">${esc(l.category)}${l.rateText ? ` · ${esc(l.rateText)}${src(l.rateSrc)}` : ""}</div></td><td class="num">${esc(l.budget)}${src(l.budgetSrc)}</td><td class="num">${esc(l.share)}${src(l.shareSrc)}</td><td class="num">${esc(l.delivery)}${src(l.deliverySrc)}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${esc(vm.total.budget)}${src(vm.total.src)}</td><td class="num">${esc(vm.total.share)}</td><td></td></tr>
    ${vm.unallocated ? `<tr class="unalloc"><td colspan="4">${esc(vm.unallocated)}</td></tr>` : ""}</tfoot>
  </table></div>` : `<p>${missingText("No channels yet.")}</p>`, vm));

  slides.push(slide(5, "When", vm.weeks.length && vm.lines.length ? `<div class="tw"><table class="t flight">
    <thead><tr><th>Channel</th>${vm.weeks.map((w) => `<th>${esc(w)}</th>`).join("")}</tr></thead>
    <tbody>${vm.flight.map((r) => `<tr><td>${esc(r.channel)}</td>${r.on ? r.on.map((on) => `<td>${on ? '<span class="on" aria-label="live"></span>' : '<span class="off" aria-label="off"></span>'}</td>`).join("") : `<td colspan="${vm.weeks.length}">${missingText("Weeks not set yet")}</td>`}</tr>`).join("")}</tbody>
  </table></div><p class="foot-note">Weeks commencing (Monday). Campaign window ${esc(vm.window?.text || "")}.</p>` : `<p>${missingText(vm.weeks.length ? "No channels yet." : "Campaign dates not known yet.")}</p>`, vm));

  slides.push(slide(6, "Why these channels", vm.lines.length ? `<ul class="why">${vm.rationale.map((r) => `<li><strong>${esc(r.channel)}</strong><span>${r.text ? esc(r.text) : missingText("Not written yet")}</span></li>`).join("")}</ul>` : `<p>${missingText("No channels yet.")}</p>`, vm));

  slides.push(slide(7, "Sign-off checks", renderChecks(vm.checkRun) + `
  <p class="signoff">Planning Director sign-off: ${vm.signoff ? esc(vm.signoff) : "<em>not signed</em>"} · ${esc(vm.versionLabel)}</p>`, vm, "slide-checks"));

  slides.push(slide(8, "Next steps", `<dl class="brief">
    <div><dt>Approval needed by</dt><dd>${val(vm.approvalBy, "Not stated in the brief")}</dd></div>
    <div><dt>Contact</dt><dd>${val(vm.contact, "Not stated in the brief")}</dd></div>
  </dl>`, vm));

  return `<div class="deck">${slides.join("\n")}</div>`;
}
