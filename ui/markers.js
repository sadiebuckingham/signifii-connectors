// Source markers: hover (pointer) or tap (touch) shows where a number came from.
export function wireSourceMarkers(doc) {
  let pop = null;
  const hide = () => { pop?.remove(); pop = null; };
  const show = (btn) => {
    hide();
    pop = doc.createElement("div");
    pop.className = "src-pop";
    pop.textContent = btn.dataset.src;
    doc.body.appendChild(pop);
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(r.left - w / 2, doc.documentElement.clientWidth - w - 8)) + "px";
    pop.style.top = r.bottom + 6 + "px";
  };
  doc.addEventListener("mouseover", (e) => { const b = e.target.closest?.(".src"); if (b) show(b); });
  doc.addEventListener("mouseout", (e) => { if (e.target.closest?.(".src")) hide(); });
  doc.addEventListener("click", (e) => { const b = e.target.closest?.(".src"); if (b) { e.preventDefault(); show(b); } else hide(); });
}
