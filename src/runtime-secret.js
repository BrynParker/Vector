import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function runtimeSecret(configured, dataPath) {
  if (configured && configured.length >= 32 && !/^replace|^your-/i.test(configured)) return configured;
  const file = path.join(path.dirname(path.resolve(dataPath)), '.session-key');
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try { return readFileSync(file, 'utf8').trim(); }
  catch {
    const secret = randomBytes(48).toString('hex');
    try { writeFileSync(file, secret, { flag: 'wx', mode: 0o600 }); return secret; }
    catch (error) { if (error.code === 'EEXIST') return readFileSync(file, 'utf8').trim(); throw error; }
  }
}
