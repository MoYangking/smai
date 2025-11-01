const fs = require('fs');
const path = require('path');
const { loadConfig, log } = require('./logger');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function dataPath(...parts) {
  const cfg = loadConfig();
  const base = path.resolve(process.cwd(), cfg.dataDir || 'data');
  ensureDir(base);
  return path.join(base, ...parts);
}

function readJson(file, fallback) {
  const p = dataPath(file);
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}

function writeJson(file, obj) {
  const p = dataPath(file);
  const tmp = `${p}.tmp`;
  const raw = JSON.stringify(obj, null, 2);
  fs.writeFileSync(tmp, raw);
  fs.renameSync(tmp, p);
}

function deleteFile(file) {
  const p = dataPath(file);
  try { fs.unlinkSync(p); } catch {}
}

module.exports = { dataPath, readJson, writeJson, deleteFile };

