const path = require('path');
const fsp = require('fs/promises');

const CONFIG_PATH = path.resolve(__dirname, '..', 'config.json');
const DEFAULT_CONFIG = {
  port: 8787,
  debug: false,
  heartbeatMs: 15000,
  flushIntervalMs: 40,
  autoResumeMax: 1,
  dataDir: path.resolve(__dirname, '..', 'data')
};

async function loadConfig() {
  try {
    const text = await fsp.readFile(CONFIG_PATH, 'utf-8');
    const json = JSON.parse(text);
    return {
      ...DEFAULT_CONFIG,
      ...json,
      dataDir: path.resolve(__dirname, '..', json.dataDir || DEFAULT_CONFIG.dataDir)
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function updateAndPersistConfig(cfg, patch) {
  try {
    const curText = await fsp.readFile(CONFIG_PATH, 'utf-8').catch(() => '{}');
    let curObj = {};
    try {
      curObj = JSON.parse(curText || '{}');
    } catch {
      curObj = {};
    }
    const merged = { ...curObj, ...patch };
    await fsp.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
    Object.assign(cfg, patch);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  loadConfig,
  updateAndPersistConfig,
  DEFAULT_CONFIG
};