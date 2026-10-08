import fs from "fs/promises";
import path from "path";
import { redact } from './redact.js';

const logDir = path.resolve(process.cwd(), "logs");
const logFile = path.join(logDir, "vector-runtime.log");

async function ensureLogDir() {
  await fs.mkdir(logDir, { recursive: true });
}

function formatLine(level, message) {
  return `[${new Date().toISOString()}] [${level}] ${redact(message)}\n`;
}

export async function appendLog(level, message) {
  const line = formatLine(level, message);
  try {
    await ensureLogDir();
    const size = await fs.stat(logFile).then(s => s.size).catch(() => 0);
    if (size > 5*1024*1024) {
      await fs.rename(`${logFile}.2`, `${logFile}.3`).catch(() => {});
      await fs.rename(`${logFile}.1`, `${logFile}.2`).catch(() => {});
      await fs.rename(logFile, `${logFile}.1`).catch(() => {});
    }
    await fs.appendFile(logFile, line, "utf8");
  } catch {
    // Intentionally swallow file log errors to avoid crashing runtime.
  }
}

export async function logInfo(message) {
  console.log(redact(message));
  await appendLog("INFO", message);
}

export async function logWarn(message) {
  console.warn(redact(message));
  await appendLog("WARN", message);
}

export async function logError(message) {
  console.error(redact(message));
  await appendLog("ERROR", message);
}

export function getLogFilePath() {
  return logFile;
}
