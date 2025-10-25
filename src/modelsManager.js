const { fetchText } = require('./utils');

function findModelsArrayByContent(js) {
  if (!js || js.indexOf('[') < 0) return null;
  const n = js.length;
  let i = 0,
    sc = 0;
  const MAX = 2000;

  while (i < n && sc < MAX) {
    sc++;
    const st = js.indexOf('[', i);
    if (st === -1) break;

    let j = st,
      br = 0,
      ins = false,
      ch = '',
      esc = false;

    while (j < n) {
      const c = js[j];
      if (ins) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === ch) ins = false;
        j++;
        continue;
      } else {
        if (c === '"' || c === "'" || c === '`') {
          ins = true;
          ch = c;
        } else if (c === '[') br++;
        else if (c === ']') {
          br--;
          if (br === 0) {
            const seg = js.slice(st, j + 1);
            if (seg.includes('supportsReasoning') && seg.includes('value') && seg.includes('label') && seg.includes('provider') && seg.includes('premium')) return seg;
            i = j + 1;
            break;
          }
        }
        j++;
      }
    }
    if (i <= st) i = st + 1;
  }
  return null;
}

function parseModelsJS(s) {
  s = s.replace(/!0/g, 'true').replace(/!1/g, 'false');
  s = s.replace(/([\{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  return JSON.parse(s);
}

function modelsToOpenAIList(list, REASONING_SUFFIX_TO_LEVEL) {
  const data = [];
  for (const m of list || []) {
    const id = m.value || m.id;
    const p = (m.provider || 'smithery').toLowerCase();
    if (!id) continue;

    data.push({
      id,
      object: 'model',
      owned_by: p
    });

    if (m.supportsReasoning) {
      for (const s of Object.keys(REASONING_SUFFIX_TO_LEVEL)) {
        data.push({
          id: `${id}${s}`,
          object: 'model',
          owned_by: p
        });
      }
    }
  }

  return {
    object: 'list',
    data
  };
}

function fallbackModelsList() {
  return {
    object: 'list',
    data: [{
      id: 'claude-sonnet-4.5',
      object: 'model',
      owned_by: 'smithery'
    }, {
      id: 'gpt-5',
      object: 'model',
      owned_by: 'smithery'
    }]
  };
}

async function refreshModelsStore(store, REASONING_SUFFIX_TO_LEVEL) {
  const pg = 'https://smithery.ai/playground';
  const html = await fetchText(pg);
  const srcs = [...html.matchAll(/<script src=\"([^\"]+)\"/g)].map(m => new URL(m[1], pg).toString());

  for (const u of srcs) {
    try {
      const js = await fetchText(u);
      const arr = findModelsArrayByContent(js);
      if (!arr) continue;
      const models = parseModelsJS(arr);
      const result = modelsToOpenAIList(models, REASONING_SUFFIX_TO_LEVEL);
      await store.writeModels(result);
      return result;
    } catch {}
  }

  return fallbackModelsList();
}

module.exports = {
  refreshModelsStore,
  modelsToOpenAIList,
  fallbackModelsList
};