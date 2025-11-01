const fs = require('fs');
const path = require('path');

let config = null;

function loadConfig() {
  if (config) return config;
  const p = path.resolve(process.cwd(), 'config', 'config.json');
  const raw = fs.readFileSync(p, 'utf8');
  config = JSON.parse(raw);
  return config;
}

function debugEnabled() {
  try { return !!loadConfig().debug; } catch { return false; }
}

function log(...args) {
  if (debugEnabled()) {
    console.log('[DEBUG]', ...args);
  }
}

module.exports = { loadConfig, log };

