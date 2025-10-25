class LogBuffer {
  constructor(max = 1000) {
    this.max = Math.max(100, Number(max) || 1000);
    this.arr = [];
  }

  push(level, message, meta) {
    const ts = Date.now();
    const item = { ts, level, message: String(message ?? ''), meta: meta ?? null };
    this.arr.push(item);
    if (this.arr.length > this.max) this.arr.splice(0, this.arr.length - this.max);
    return item;
  }

  getSince(since) {
    const s = Number(since) || 0;
    return this.arr.filter(x => x.ts > s);
  }

  clear() {
    this.arr.length = 0;
  }

  all() {
    return this.arr.slice();
  }
}

const LOGS = new LogBuffer(1000);

function normalizeArg(x) {
  if (x === undefined) return 'undefined';
  if (x === null) return 'null';
  if (typeof x === 'string') return x;
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

function logPush(level, args, meta) {
  try {
    LOGS.push(level, args.map(normalizeArg).join(' '), meta);
  } catch {}
}

function logInfo(msg, meta) {
  try {
    LOGS.push('info', msg, meta);
  } catch {}
}

function logError(msg, meta) {
  try {
    LOGS.push('error', msg, meta);
  } catch {}
}

function dbg(debug, ...a) {
  if (debug) {
    console.log('[DEBUG]', ...a);
    try {
      logPush('debug', a);
    } catch {}
  }
}

module.exports = {
  LogBuffer,
  LOGS,
  dbg,
  logInfo,
  logError,
  logPush
};