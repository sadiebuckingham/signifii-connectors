// Media plan service: the one place tools and web pages go through.
// Every change is saved as a new version (with a note) and the checks rerun.
import path from "node:path";
import { readDocument } from "../../core/sources/documents.js";
import { readRulesSheet } from "../../core/checks/rules-sheet.js";
import { newId, newToken } from "../../core/versions/doc-store.js";
import { readBriefFacts } from "./brief.js";
import { ruleTypeOf } from "./rules.js";
import { runPlanChecks } from "./checks.js";
import { viewModel } from "./view-model.js";
import { config } from "./config.js";
import * as E from "./engine.js";

const OPS = {
  set_brief_fact: E.setFact, add_channel: E.addChannel, remove_channel: E.removeChannel, set_line_audiences: E.setLineAudiences,
  set_allocation: E.setAllocation, move_budget: E.moveBudget, set_flighting: E.setFlighting,
  add_audience_figure: E.addAudienceFigure, remove_audience_figure: E.removeAudienceFigure, set_target_bands: E.setTargetBands,
  write_section: E.writeSection,
};

export function createService({ store, library, docs, publicUrl = "" }) {
  const clientsFolder = config.folders.clients;

  async function rules() {
    const p = config.folders.rulesFile;
    if (!(await store.exists(p))) return { rules: [], problems: [`No ${p} found, so only the built-in checks run.`] };
    return readRulesSheet(await store.read(p), path.posix.basename(p), ruleTypeOf);
  }
  async function ctx() {
    const values = await library.values();
    return { values, valuesById: new Map(values.map((v) => [E.valueId(v), v])) };
  }
  const link = (plan) => (publicUrl ? `${publicUrl}/p/${plan.linkToken}` : `/p/${plan.linkToken}`);

  async function present(plan, message) {
    const { rules: sheetRules, problems } = await rules();
    const checkRun = runPlanChecks(plan, sheetRules);
    const { values } = await ctx();
    const vm = viewModel(plan, { checkRun, values });
    return { plan, vm, checkRun, message, rulesProblems: problems, link: link(plan) };
  }

  async function clientFolders() {
    return (await store.list(clientsFolder)).filter((f) => f.isFolder);
  }
  async function findClient(name) {
    const all = await clientFolders();
    const s = E.slug(name);
    const hit = all.find((f) => E.slug(f.name) === s) || all.filter((f) => E.slug(f.name).includes(s) || s.includes(E.slug(f.name)));
    const one = Array.isArray(hit) ? (hit.length === 1 ? hit[0] : null) : hit;
    if (!one) throw new E.PlanError(Array.isArray(hit) && hit.length > 1 ? `"${name}" matches more than one client: ${hit.map((h) => h.name).join(", ")}.` : `No client folder called "${name}". Clients: ${all.map((f) => f.name).join(", ") || "none"}.`);
    return one;
  }

  return {
    async listClients() {
      const out = [];
      for (const c of await clientFolders()) {
        const briefs = (await store.list(`${c.path}/Briefs`)).filter((f) => !f.isFolder);
        const plans = (await docs.list()).filter((p) => p.client === c.name);
        out.push({ client: c.name, briefs: briefs.map((b) => b.name), plans: plans.map((p) => ({ id: p.id, version: p.version, savedAt: p.savedAt })) });
      }
      return out;
    },

    async startPlan({ client, brief_file }) {
      const c = await findClient(client);
      const briefs = (await store.list(`${c.path}/Briefs`)).filter((f) => !f.isFolder);
      if (!briefs.length) throw new E.PlanError(`${c.name} has no brief in its Briefs folder. Add one (PDF, Word or PowerPoint), or give the brief details in chat.`);
      let b = brief_file ? briefs.find((x) => x.name.toLowerCase().includes(String(brief_file).toLowerCase())) : briefs.length === 1 ? briefs[0] : null;
      if (!b) throw new E.PlanError(`${c.name} has ${briefs.length} briefs: ${briefs.map((x) => `"${x.name}"`).join(", ")}. Ask which one, then pass brief_file.`);
      const doc = await readDocument(b.name, await store.read(b.path));
      if (!doc.ok) throw new E.PlanError(doc.reason);
      doc.path = b.path;
      const { facts, missing } = readBriefFacts(doc);
      const id = `${E.slug(c.name)}-${newId()}`;
      let plan = E.createPlan({ id, client: c.name, briefDoc: doc, facts, missing, linkToken: newToken() });
      plan = await docs.create(id, plan, `Started from ${b.name}`);
      const found = Object.keys(facts);
      return present(plan, `Started plan ${id} for ${c.name} from "${b.name}". Read from the brief: ${found.join(", ") || "nothing"}.${missing.length ? ` Still needed (ask the planner): ${missing.map((m) => `${m.ask} (${m.why})`).join(" ")}` : ""}`);
    },

    async getPlan(id) {
      const p = await docs.get(id);
      if (!p) throw new E.PlanError(`No plan "${id}". Use list_clients to see plans.`);
      return p;
    },

    async resolve(idOrClient) {
      const direct = await docs.get(idOrClient).catch(() => null);
      if (direct) return direct;
      const mine = (await docs.list()).filter((p) => E.slug(p.client) === E.slug(idOrClient)).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      if (!mine.length) throw new E.PlanError(`No plan "${idOrClient}". Start one with start_plan, or use list_clients.`);
      return mine[0];
    },

    async open(idOrClient) { return present(await this.resolve(idOrClient), null); },

    async apply(planId, op, args, note) {
      const fn = OPS[op];
      if (!fn) throw new Error(`Unknown operation ${op}`);
      const plan = await this.getPlan(planId);
      const c = await ctx();
      const { plan: next, message } = fn(plan, args, c);
      const saved = await docs.save(planId, next, note || message);
      return present(saved, message);
    },

    async tick(planId, { rule_id, name }) {
      const plan = await this.getPlan(planId);
      const { checkRun } = await present(plan, null);
      const r = checkRun.results.find((x) => x.ruleId === rule_id);
      if (!r) throw new E.PlanError(`No check "${rule_id}".`);
      if (r.status !== "warn") throw new E.PlanError(`Check ${rule_id} is "${r.status}", not a warning, so it can't be ticked.`);
      const { plan: next, message } = E.tickWarning(plan, { rule_id, name }, r.message);
      return present(await docs.save(planId, next, `Warning ${rule_id} ticked by ${name}`), message);
    },

    async rates({ search, include_hidden = false } = {}) {
      const { values } = await ctx();
      const rows = new Map();
      for (const v of values) {
        // A rate card row states how it's bought (a buying-unit column). Campaign exports
        // with actual costs ("Avg. CPM", "View rate") aren't rate cards and aren't offered.
        const rowHasUnit = values.some((x) => x.file === v.file && x.sheet === v.sheet && x.table === v.table && x.ref.replace(/^[A-Z]+/, "") === v.ref.replace(/^[A-Z]+/, "") && x.buyingUnit);
        if (!rowHasUnit || v.kind === "percent") continue;
        const isRate = Boolean(v.buyingUnit);
        const isMin = /\bmin(imum)?\s*spend\b/i.test(v.metric);
        if (!isRate && !isMin) continue;
        const k = `${v.file}::${v.sheet}::${v.ref.replace(/^[A-Z]+/, "")}`;
        if (search && !`${v.entity} ${v.audience?.labels?.join(" ")} ${v.unit} ${v.file}`.toLowerCase().includes(String(search).toLowerCase())) continue;
        const r = rows.get(k) || { entity: v.entity, audienceBasis: v.audience?.labels?.join(" / ") || null, unit: v.unit, file: v.file, sheet: v.sheet, row: Number(v.ref.replace(/^[A-Z]+/, "")), rates: [], minSpend: null, notes: new Set() };
        if (isMin) r.minSpend = { id: E.valueId(v), original: v.original };
        else if (!v.hidden || include_hidden) r.rates.push({ id: E.valueId(v), metric: v.metric, original: v.original, kind: v.kind, hidden: v.hidden, unit: v.unit });
        for (const q of v.qualifiers || []) r.notes.add(q.text);
        for (const n of v.notes || []) r.notes.add(n.text);
        rows.set(k, r);
      }
      return [...rows.values()].filter((r) => r.rates.length).map((r) => ({ ...r, notes: [...r.notes] }));
    },

    async audience({ band, search }) { const { values } = await ctx(); return E.queryAudience(values, { band, search }); },

    async compare(planId, scenarios) {
      const base = await this.getPlan(planId);
      const { rules: sheetRules } = await rules();
      const c = await ctx();
      const summarise = (name, plan) => {
        const d = E.derive(plan);
        const run = runPlanChecks(plan, sheetRules);
        return { name, lines: d.lines.map((l) => ({ channel: l.channel, budget: E.fmtGBP(l.budgetP), share: `${l.share.toFixed(1)}%`, delivery: l.delivery.text })),
          total: E.fmtGBP(d.totalP), unallocated: d.unallocatedP ? E.fmtGBP(d.unallocatedP) : "£0",
          checks: run.summary, fails: run.results.filter((r) => r.status === "fail").map((r) => `${r.ruleId}: ${r.message}`) };
      };
      const out = [summarise("Current plan", base)];
      for (const s of scenarios) {
        let p = structuredClone(base);
        for (const a of s.allocations || []) p = E.setAllocation(p, a, c).plan;
        for (const m of s.moves || []) p = E.moveBudget(p, m, c).plan;
        out.push(summarise(s.name, p));
      }
      return out;
    },

    async versions(planId) { await this.getPlan(planId); return docs.versions(planId); },
    async restore(planId, version) { const p = await docs.restore(planId, version, `Restored version ${version}`); return present(p, `Restored version ${version} as a new version ${p.version}.`); },
    async byToken(token) { return (await docs.list()).find((p) => p.linkToken === token) || null; },
    present, link,
  };
}
