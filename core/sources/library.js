// Source library: reads every file in one folder of a store and keeps the
// values and reading reports in memory for a short time only (maxAgeMs), then
// reads the folder again. Nothing is copied anywhere else.
import { readSource } from "./reader.js";

export class SourceLibrary {
  constructor(store, folder, { maxAgeMs = 2 * 60 * 1000 } = {}) { this.store = store; this.folder = folder; this.maxAgeMs = maxAgeMs; this.state = null; this.reading = null; }

  async load({ force = false } = {}) {
    const fresh = this.state && Date.now() - Date.parse(this.state.readAt) < this.maxAgeMs;
    if (fresh && !force) return this.state;
    if (this.reading) return this.reading;
    this.reading = (async () => {
      const files = (await this.store.list(this.folder)).filter((f) => !f.isFolder);
      const reports = [], values = [];
      for (const f of files) {
        try {
          const r = await readSource(f.name, await this.store.read(f.path), { uploadedAt: f.modified });
          r.report.path = f.path;
          reports.push(r.report);
          values.push(...r.values);
        } catch (e) {
          reports.push({ file: f.name, path: f.path, status: "couldn't read", summary: `Unexpected error while reading: ${e.message}`, sheets: [], issues: [], skipped: [], counts: {} });
        }
      }
      this.state = { readAt: new Date().toISOString(), folder: this.folder, reports, values };
      this.reading = null;
      return this.state;
    })();
    return this.reading;
  }

  forget() { this.state = null; }
  async reports() { return (await this.load()).reports; }
  async values() { return (await this.load()).values; }
}
