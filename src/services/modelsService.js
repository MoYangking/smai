const { readJson, writeJson, deleteFile } = require('../utils/fileStore');
const { log } = require('../utils/logger');

const FILE = 'models.json';

function fallbackModelsList() {
  return { object: 'list', data: [
    { id: 'claude-sonnet-4.5', object: 'model', owned_by: 'smithery' },
    { id: 'gpt-5', object: 'model', owned_by: 'smithery' },
  ]};
}

function findModelsArrayByContent(jsText) {
  if (!jsText || jsText.indexOf('[') < 0) return null;
  const n = jsText.length;
  let i = 0; let scans = 0; const MAX_SCANS = 2000;
  while (i < n && scans < MAX_SCANS) {
    scans++;
    const start = jsText.indexOf('[', i);
    if (start === -1) break;
    let j = start; let bracket = 0; let inStr = false; let strCh = ''; let esc = false;
    while (j < n) {
      const ch = jsText[j];
      if (inStr) {
        if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === strCh) inStr = false;
        j++; continue;
      } else {
        if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strCh = ch; }
        else if (ch === '[') bracket++;
        else if (ch === ']') { bracket--; if (bracket === 0) {
          const seg = jsText.slice(start, j + 1);
          if (seg.includes('supportsReasoning') && seg.includes('value') && seg.includes('label') && seg.includes('provider') && seg.includes('premium')) {
            return seg;
          }
          i = j + 1; break;
        } }
        j++;
      }
    }
    if (i <= start) i = start + 1;
  }
  return null;
}

function parseModelsJS(modelsJs) {
  let s = modelsJs.replace(/!0/g, 'true').replace(/!1/g, 'false');
  s = s.replace(/([\{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  return JSON.parse(s);
}

function modelsToOpenAIList(modelsList) {
  const REASONING_SUFFIX_TO_LEVEL = {
    '-minimal': 'minimal',
    '-low': 'low',
    '-medium': 'medium',
    '-high': 'high',
  };
  const data = [];
  for (const m of modelsList || []) {
    const mid = m.value || m.id;
    const provider = (m.provider || 'smithery').toLowerCase();
    if (!mid) continue;
    data.push({ id: mid, object: 'model', owned_by: provider });
    if (m.supportsReasoning) {
      for (const suffix of Object.keys(REASONING_SUFFIX_TO_LEVEL)) {
        data.push({ id: `${mid}${suffix}`, object: 'model', owned_by: provider });
      }
    }
  }
  return { object: 'list', data };
}

async function refreshModels() {
  const playground = 'https://smithery.ai/playground';
  const html = await fetch(playground).then(r => r.text());
  const scriptSrcs = [...html.matchAll(/<script src=\"([^\"]+)\"/g)].map(m => new URL(m[1], playground).toString());
  for (let i = 0; i < scriptSrcs.length; i++) {
    const u = scriptSrcs[i];
    try {
      const js = await fetch(u).then(r => r.text());
      const arr = findModelsArrayByContent(js);
      if (!arr) continue;
      const models = parseModelsJS(arr);
      const result = modelsToOpenAIList(models);
      writeJson(FILE, result);
      return result;
    } catch (e) {
      // try next
      log('[models.refresh.tryNext]', u);
    }
  }
  const fb = fallbackModelsList();
  writeJson(FILE, fb);
  return fb;
}

function readModels() {
  return readJson(FILE, fallbackModelsList());
}

function writeModels(obj) {
  writeJson(FILE, obj);
}

function clearModels() {
  deleteFile(FILE);
}

module.exports = { readModels, writeModels, clearModels, refreshModels, fallbackModelsList };

