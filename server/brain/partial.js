// Pulls one string field (e.g. "code") out of a tool input while it is still
// streaming as partial JSON, so visitors can watch Charlie type her code.
export class FieldStreamer {
  constructor(field) {
    this.re = new RegExp(`(?<!\\\\)"${field}"\\s*:\\s*"`);
    this.buf = '';
    this.pos = -1;
    this.done = false;
  }

  push(chunk) {
    this.buf += chunk;
    if (this.done) return '';
    if (this.pos < 0) {
      const m = this.re.exec(this.buf);
      if (!m) return '';
      this.pos = m.index + m[0].length;
    }
    let out = '';
    let i = this.pos;
    const s = this.buf;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '"') {
        this.done = true;
        i++;
        break;
      }
      if (ch !== '\\') {
        out += ch;
        i++;
        continue;
      }
      if (i + 1 >= s.length) break;
      const e = s[i + 1];
      if (e === 'u') {
        if (i + 6 > s.length) break;
        out += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      out += { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' }[e] ?? e;
      i += 2;
    }
    this.pos = i;
    return out;
  }
}
