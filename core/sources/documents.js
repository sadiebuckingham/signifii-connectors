// Text from documents (briefs, past plans): PDF, Word, PowerPoint, plain text.
// Every line keeps where it came from (page / slide / paragraph) so anything
// pulled out of it can show its source. Nothing is interpreted here.
import JSZip from "jszip";
import { getDocumentProxy } from "unpdf";

const unxml = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

async function pdfPages(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    const lines = []; let cur = "", lastY = null;
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      const y = it.transform ? Math.round(it.transform[5]) : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && cur.trim()) { lines.push(cur.trim()); cur = ""; }
      cur += it.str;
      if (it.hasEOL) { if (cur.trim()) lines.push(cur.trim()); cur = ""; }
      lastY = y;
    }
    if (cur.trim()) lines.push(cur.trim());
    pages.push({ n, label: `page ${n}`, lines: lines.map((l) => l.replace(/\s+/g, " ")) });
  }
  return pages;
}

async function docxPages(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("Not a Word document");
  const lines = [];
  // tables: one line per row, cells joined with " | "
  const body = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    const rows = [...tbl.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)].map((r) =>
      [...r[0].matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)].map((c) => [...c[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => unxml(t[1])).join("").trim()).join(" | "));
    return rows.map((r) => `<w:p><w:t>${r.replace(/</g, "&lt;")}</w:t></w:p>`).join("");
  });
  for (const p of body.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    const t = [...p[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => unxml(m[1])).join("").replace(/\s+/g, " ").trim();
    if (t) lines.push(t);
  }
  return [{ n: 1, label: "document", lines }];
}

async function pptxPages(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const pages = [];
  for (const f of slides) {
    const xml = await zip.file(f).async("string");
    const lines = [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map((p) => [...p[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => unxml(m[1])).join("").trim()).filter(Boolean);
    const n = Number(f.match(/slide(\d+)/)[1]);
    pages.push({ n, label: `slide ${n}`, lines });
  }
  return pages;
}

export async function readDocument(name, buffer) {
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  try {
    let pages;
    if (ext === "pdf") pages = await pdfPages(buffer);
    else if (ext === "docx") pages = await docxPages(buffer);
    else if (ext === "pptx") pages = await pptxPages(buffer);
    else if (ext === "txt" || ext === "md") pages = [{ n: 1, label: "text", lines: buffer.toString("utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean) }];
    else return { ok: false, file: name, reason: `"${name}" isn't a document type the connector reads (PDF, Word .docx, PowerPoint .pptx, text).` };
    const words = pages.reduce((n, p) => n + p.lines.join(" ").split(/\s+/).filter(Boolean).length, 0);
    if (!words) return { ok: false, file: name, reason: `No text could be read from "${name}". If it's a scanned document, it needs a version with real text.` };
    return { ok: true, file: name, type: ext, pages };
  } catch (e) {
    return { ok: false, file: name, reason: `"${name}" couldn't be opened: ${e.message}` };
  }
}
