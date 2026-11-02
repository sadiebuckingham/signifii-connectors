// Reads audience meaning out of a label ("Boys 4-9", "Parents of children 5-9
// (interest)", "35+", "All 4-12", "HWC (Housewives w/ children)", "female").
// It only describes what the label says. It never maps one band onto another.

const GENDER_WORDS = [
  [/\b(boys?|males?|men|man)\b/i, "male"],
  [/\b(girls?|females?|women|woman)\b/i, "female"],
  [/\b(other\s*\/\s*unknown|other|non[- ]binary)\b/i, "other_or_unknown"],
];

// Audience types that are not age bands of the people counted.
const TYPE_WORDS = [
  [/\bparent(s|al)?\b|\bmums?\b|\bmoms?\b|\bdads?\b|\bhwc\b|housewi(fe|ves)|\bhomemakers?\b|\bcarers?\b|\bguardians?\b|\bgrandparents?\b/i, "parents"],
  [/\bhouseholds?\b/i, "households"],
  [/\bshoppers?\b|\bbuyers?\b|\bpurchasers?\b/i, "shoppers"],
  [/\bsubscribers?\b/i, "subscribers"],
  [/\baccounts?\b/i, "accounts"],
  [/\bchild(ren)?\b|\bkids?\b|\bboys\b|\bgirls\b/i, "children"],
  [/\badults?\b/i, "adults"],
];

// Words after which an age range describes someone else (their child), not
// the people counted: "Parents of children 5-9", "Adults 16-34 w/ child 0-15".
const QUALIFIER = /\b(of|with|w\/)\s+(a\s+)?(child|children|kids?)\b.*$/i;

export function parseAudience(label) {
  const out = { label: String(label ?? "").trim(), age: null, gender: null, type: null, qualifier: null, unknown: false };
  let s = out.label;
  if (!s) return out;
  if (/^unknown$/i.test(s)) { out.unknown = true; out.gender = null; return out; }

  const q = s.match(QUALIFIER);
  if (q) { out.qualifier = q[0].trim(); s = s.slice(0, q.index).trim(); }

  for (const [re, t] of TYPE_WORDS) if (re.test(out.label)) { out.type = t; break; }
  // a qualifier means the type is about the people, e.g. parents/adults; children words in the qualifier don't count
  if (q && out.type === "children") {
    out.type = null;
    for (const [re, t] of TYPE_WORDS) if (t !== "children" && re.test(s)) { out.type = t; break; }
  }
  for (const [re, g] of GENDER_WORDS) if (re.test(s)) { out.gender = g; break; }

  let m = s.match(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\b/);
  if (m && Number(m[1]) <= Number(m[2])) out.age = { from: Number(m[1]), to: Number(m[2]), label: `${m[1]}-${m[2]}`, all: /\ball\b/i.test(s) };
  else if ((m = s.match(/(\d{1,2})\s*\+/))) out.age = { from: Number(m[1]), to: null, label: `${m[1]}+` };
  else if ((m = s.match(/(?:under|<)\s*(\d{1,2})\b/i))) out.age = { from: 0, to: Number(m[1]) - 1, label: `under ${m[1]}` };
  if (/\(.*self[- ]declared.*\)/i.test(out.label)) out.selfDeclared = true;
  if (/\(interest\)|\(behaviou?r\)/i.test(out.label)) out.basis = out.label.match(/\((interest|behaviou?r)\)/i)[1].toLowerCase();
  return out;
}

export const hasAudienceMeaning = (a) => Boolean(a && (a.age || a.gender || a.type || a.unknown));

// Two bands overlap if they share any year.
export function bandsOverlap(a, b) {
  if (!a || !b) return false;
  const aTo = a.to ?? 200, bTo = b.to ?? 200;
  return a.from <= bTo && b.from <= aTo && !(a.from === b.from && aTo === bTo);
}

// The planning rule: a source band can be used for a canonical band only if it
// matches exactly. Returns { exact, wider, narrower }.
export function compareBand(source, canonical) {
  if (!source || !canonical) return { exact: false, wider: false, narrower: false };
  const sTo = source.to ?? 200, cTo = canonical.to ?? 200;
  const exact = source.from === canonical.from && sTo === cTo;
  const wider = !exact && source.from <= canonical.from && sTo >= cTo;
  const narrower = !exact && source.from >= canonical.from && sTo <= cTo;
  return { exact, wider, narrower };
}
