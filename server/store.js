import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return typeof fallback === 'function' ? fallback() : structuredClone(fallback);
  }
}

// Write-then-rename so a crash never leaves half a file behind.
export function writeJSON(file, value) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

// A JSON file that is loaded once and flushed shortly after each change.
export class JSONStore {
  constructor(file, fallback) {
    this.file = file;
    this.data = readJSON(file, fallback);
    this.timer = null;
  }

  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 250);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    writeJSON(this.file, this.data);
  }
}

export function today(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function clip(text, max) {
  text = String(text ?? '');
  return text.length > max ? `${text.slice(0, max)}\n…[${text.length - max} more characters cut]` : text;
}
