// Folder store over the signed-in person's OneDrive (Microsoft Graph).
// Same interface as FsStore: list · read · write · exists. Files are read on
// demand and written straight back to OneDrive; nothing is copied to our side.
export class StoreAuthError extends Error {}

export class OneDriveStore {
  constructor(accessToken, { root = "Media Plans", fetchImpl = fetch, label = "OneDrive" } = {}) {
    this.token = accessToken; this.root = root; this.fetch = fetchImpl; this.label = label;
  }
  #url(p, suffix = "") {
    const parts = [this.root, ...String(p || "").split("/")].filter(Boolean).map(encodeURIComponent).join("/");
    return `https://graph.microsoft.com/v1.0/me/drive/root:/${parts}${suffix ? `:${suffix}` : ""}`;
  }
  async #call(url, init = {}) {
    const r = await this.fetch(url, { ...init, headers: { Authorization: `Bearer ${this.token}`, ...(init.headers || {}) } });
    if (r.status === 401) throw new StoreAuthError("Your Microsoft sign-in has expired. Reconnect the connector in Claude.");
    if (r.status === 403) throw new StoreAuthError("Microsoft says this account isn't allowed to use that folder.");
    return r;
  }
  async list(folder = "") {
    const out = [];
    let url = this.#url(folder, "/children?$select=name,folder,file,size,lastModifiedDateTime&$top=200");
    while (url) {
      const r = await this.#call(url);
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(`OneDrive couldn't list "${folder || this.root}" (${r.status}).`);
      const body = await r.json();
      for (const it of body.value || []) {
        if (it.name.startsWith(".") || it.name.startsWith("~$")) continue;
        out.push({ name: it.name, path: [folder, it.name].filter(Boolean).join("/"), isFolder: Boolean(it.folder), size: it.size || 0, modified: it.lastModifiedDateTime });
      }
      url = body["@odata.nextLink"] || null;
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  async read(p) {
    const r = await this.#call(this.#url(p, "/content"));
    if (!r.ok) throw new Error(`OneDrive couldn't open "${p}" (${r.status}).`);
    return Buffer.from(await r.arrayBuffer());
  }
  async exists(p) { const r = await this.#call(this.#url(p)); return r.ok; }
  async write(p, buffer) {
    if (buffer.length > 4 * 1024 * 1024) throw new Error("Files over 4 MB can't be saved yet.");
    const r = await this.#call(this.#url(p, "/content"), { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: buffer });
    if (!r.ok) throw new Error(`OneDrive couldn't save "${p}" (${r.status}).`);
  }
}
