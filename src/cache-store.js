import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
export async function loadCache(filePath) {
  try { const parsed = JSON.parse(await readFile(filePath, "utf8")); return parsed && typeof parsed === "object" ? parsed : null; }
  catch { return null; }
}
export async function saveCache(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.tmp`;
  await writeFile(temporary, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, filePath);
}
