// Runs one of Charlie's modules (a skill or a build) in its own process, so a
// crash, hang or runaway loop in code she wrote can't take the harness down.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.once('message', async ({ file, mode, input, ctx }) => {
  const send = (msg) => new Promise((resolve) => {
    try {
      process.send(msg, resolve);
    } catch {
      // Not structured-cloneable (functions, sockets...): fall back to text.
      process.send({ ok: msg.ok, result: safeString(msg.result), error: msg.error }, resolve);
    }
  });
  try {
    const mod = await import(pathToFileURL(file).href);
    const fn = typeof mod.default === 'function' ? mod.default : mod[mode === 'build' ? 'build' : 'run'];
    if (typeof fn !== 'function') throw new Error(`${path.basename(file)} must "export default" a function`);
    let result = mode === 'build' ? await fn(ctx) : await fn(input ?? {}, ctx);
    if (mode === 'build') {
      const cap = (ctx.maxPoints ?? 30000) + 1;
      if (Array.isArray(result) && result.length > cap) result = result.slice(0, cap);
      else if (Array.isArray(result?.points) && result.points.length > cap) result = { ...result, points: result.points.slice(0, cap) };
    } else if (typeof result !== 'string') {
      // Keep huge results from flooding the harness; the tool result is clipped anyway.
      const text = safeString(result) ?? 'null';
      if (text.length > 200_000) result = `${text.slice(0, 200_000)}\n…[cut]`;
    }
    await send({ ok: true, result });
  } catch (err) {
    await send({ ok: false, error: err?.stack || String(err) });
  }
  process.exit(0);
});

function safeString(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
