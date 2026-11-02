// Source library: reads every file in one folder of a store, keeps the
// values and reading reports in memory, and re-reads from scratch on request.
// Real client files are read on demand and never copied anywhere else.
import { readSource } from "./reader.js";

export class SourceLibrary {
  constructor(store, folder) { this.store = store; this.folder = folder; this.state = null; this.reading = null; }

  async load({ force = false } = {}) {
    if (this.state && !force) return this.state;
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

  async reports() { return (await this.load()).reports; }
  async values() { return (await this.load()).values; }
}
