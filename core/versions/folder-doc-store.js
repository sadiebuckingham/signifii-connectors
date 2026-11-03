// Versioned documents kept as files in the client's own folder, through any
// folder store (demo folder now, OneDrive later). Nothing is kept on our side.
//
// Layout:  <parent>/<doc id>/v0001.json, v0002.json, ...   (one file per version, with a note)
// where <parent> comes from parentOf(doc), e.g. "Clients/Bramble Bots/Plans".
export class FolderDocStore {
  /**
   * @param {object} store              folder store (list/read/write/exists)
   * @param {(doc)=>string} parentOf     folder a document lives in
   * @param {()=>Promise<string[]>} parents  every folder that may hold documents (for listing)
   */
  constructor(store, { parentOf, parents }) { this.store = store; this.parentOf = parentOf; this.parents = parents; }

  async #locate(id) {
    if (!/^[a-z0-9-]+$/i.test(id)) return null;
    for (const p of await this.parents()) if (await this.store.exists(`${p}/${id}`)) return `${p}/${id}`;
    return null;
  }

  async #files(folder) {
    return (await this.store.list(folder)).filter((f) => !f.isFolder && /^v\d{4}\.json$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(id, doc, note = "Created") {
    if (await this.#locate(id)) throw new Error(`"${id}" already exists`);
    return this.#write(`${this.parentOf(doc)}/${id}`, id, doc, note, 1);
  }

  async save(id, doc, note) {
    const folder = await this.#locate(id);
    if (!folder) throw new Error(`No document "${id}"`);
    const files = await this.#files(folder);
    const last = files.length ? Number(files.at(-1).name.slice(1, 5)) : 0;
    return this.#write(folder, id, doc, note, last + 1);
  }

  async #write(folder, id, doc, note, version) {
    const { version: _v, savedAt: _s, folder: _f, ...rest } = doc;
    const saved = { ...rest, id, version, savedAt: new Date().toISOString() };
    await this.store.write(`${folder}/v${String(version).padStart(4, "0")}.json`, Buffer.from(JSON.stringify({ note, doc: saved }, null, 1)));
    return { ...saved, folder };
  }

  async get(id, version) {
    const folder = await this.#locate(id);
    if (!folder) return null;
    const files = await this.#files(folder);
    const f = version ? files.find((x) => Number(x.name.slice(1, 5)) === Number(version)) : files.at(-1);
    if (!f) return null;
    return { ...JSON.parse((await this.store.read(f.path)).toString("utf8")).doc, folder };
  }

  async versions(id) {
    const folder = await this.#locate(id);
    if (!folder) return [];
    const out = [];
    for (const f of await this.#files(folder)) {
      const { note, doc } = JSON.parse((await this.store.read(f.path)).toString("utf8"));
      out.push({ version: doc.version, savedAt: doc.savedAt, note, file: f.path });
    }
    return out;
  }

  async list() {
    const out = [];
    for (const p of await this.parents()) {
      for (const d of (await this.store.list(p)).filter((x) => x.isFolder)) {
        const doc = await this.get(d.name);
        if (doc) out.push(doc);
      }
    }
    return out;
  }

  async restore(id, version, note) {
    const old = await this.get(id, version);
    if (!old) throw new Error(`Version ${version} of "${id}" doesn't exist.`);
    return this.save(id, old, note || `Restored version ${version}`);
  }

  // Write a readable file next to the versions (e.g. the plan as a web page).
  async attach(id, name, buffer) {
    const folder = await this.#locate(id);
    if (folder) await this.store.write(`${folder}/${name}`, buffer);
  }
}
