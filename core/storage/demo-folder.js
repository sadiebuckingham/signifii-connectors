// The demo "client folder": a working copy of the fictional sample folder that
// the connector can read and write, like a real client's OneDrive folder.
// Reset = throw the working copy away and copy the sample folder again.
import { cp, rm, stat } from "node:fs/promises";

export async function ensureWorkingCopy(templateDir, workDir) {
  try { await stat(workDir); } catch { await cp(templateDir, workDir, { recursive: true }); }
  return workDir;
}

export async function resetWorkingCopy(templateDir, workDir) {
  await rm(workDir, { recursive: true, force: true });
  await cp(templateDir, workDir, { recursive: true });
}
