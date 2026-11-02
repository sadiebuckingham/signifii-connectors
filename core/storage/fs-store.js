// Folder store: the one way connectors read and write files.
// Backends share one interface so the rest of the code doesn't care where
// files live:  list(folder) · read(path) · write(path, buffer) · exists(path)
//   FsStore        a folder on disk (sample data, local dev)
//   (next) PgStore  folders kept in Postgres ("our side", survives deploys)
//   (Thu) OneDriveStore  a OneDrive folder via Microsoft Graph, after sign-in
import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

export class FsStore {
  constructor(root, { readOnly = false, label = "local folder" } = {}) { this.root = path.resolve(root); this.readOnly = readOnly; this.label = label; }
  #abs(p) {
    const abs = path.resolve(this.root, "." + path.posix.join("/", String(p || "")));
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) throw new Error("Path outside the store");
    return abs;
  }
  async list(folder = "") {
    let entries;
    try { entries = await readdir(this.#abs(folder), { withFileTypes: true }); } catch (e) { if (e.code === "ENOENT") return []; throw e; }
    const out = [];
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name.startsWith("~$")) continue;
      const p = path.posix.join(folder, e.name);
      const s = await stat(this.#abs(p));
      out.push({ name: e.name, path: p, isFolder: e.isDirectory(), size: s.size, modified: s.mtime.toISOString() });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  async read(p) { return readFile(this.#abs(p)); }
  async exists(p) { try { await stat(this.#abs(p)); return true; } catch { return false; } }
  async write(p, buffer) {
    if (this.readOnly) throw new Error(`${this.label} is read-only`);
    await mkdir(path.dirname(this.#abs(p)), { recursive: true });
    await writeFile(this.#abs(p), buffer);
  }
}
