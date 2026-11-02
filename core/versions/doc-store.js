// Versioned documents (plans, guides…). Every save is a new version with a
// note saying what changed; earlier versions can be listed and restored.
// Backend now: JSON files in DATA_DIR. Postgres plugs in behind the same
// interface (Wednesday) so saved work survives redeploys.
import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const newId = (prefix = "") => prefix + crypto.randomBytes(6).toString("base64url").replace(/[-_]/g, "").slice(0, 8).toLowerCase();
export const newToken = () => crypto.randomBytes(18).toString("base64url");

export class FileDocStore {
  constructor(dir) { this.dir = path.resolve(dir); }
  #folder(id) { if (!/^[a-z0-9-]+$/i.test(id)) throw new Error("Bad id"); return path.join(this.dir, id); }

  async create(id, doc, note = "Created") { return this.save(id, doc, note, { create: true }); }

  async save(id, doc, note, { create = false } = {}) {
    const dir = this.#folder(id);
    await mkdir(dir, { recursive: true });
    const versions = await this.versions(id);
    if (create && versions.length) throw new Error(`"${id}" already exists`);
    const version = (versions.at(-1)?.version || 0) + 1;
    const saved = { ...doc, id, version, savedAt: new Date().toISOString() };
    await writeFile(path.join(dir, `v${String(version).padStart(4, "0")}.json`), JSON.stringify({ note, doc: saved }));
    return saved;
  }

  async get(id, version) {
    const vs = await this.versions(id);
    if (!vs.length) return null;
    const v = version ? vs.find((x) => x.version === Number(version)) : vs.at(-1);
    if (!v) return null;
    return JSON.parse(await readFile(path.join(this.#folder(id), v.file), "utf8")).doc;
  }

  async versions(id) {
    let files;
    try { files = (await readdir(this.#folder(id))).filter((f) => /^v\d+\.json$/.test(f)).sort(); } catch { return []; }
    const out = [];
    for (const file of files) {
      const { note, doc } = JSON.parse(await readFile(path.join(this.#folder(id), file), "utf8"));
      out.push({ version: doc.version, savedAt: doc.savedAt, note, file });
    }
    return out;
  }

  async list() {
    let ids; try { ids = await readdir(this.dir); } catch { return []; }
    const out = [];
    for (const id of ids) { const d = await this.get(id); if (d) out.push(d); }
    return out;
  }

  async restore(id, version, note) {
    const old = await this.get(id, version);
    if (!old) throw new Error(`Version ${version} of "${id}" doesn't exist.`);
    const { version: _v, savedAt: _s, ...rest } = old;
    return this.save(id, rest, note || `Restored version ${version}`);
  }

  async removeAll() { await rm(this.dir, { recursive: true, force: true }); }
}
