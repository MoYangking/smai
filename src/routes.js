const { sendJSON, readBody } = require('./utils');
const { openaiToSmithery } = require('./openaiConverter');
const { streamUpstreamToOpenAISSE, smitheryToOpenAINonStream } = require('./sseHandler');
const { refreshModelsStore, fallbackModelsList } = require('./modelsManager');
const { REASONING_SUFFIX_TO_LEVEL } = require('./openaiConverter');
const { dbg } = require('./logger');

async function handleChat(req, res, cfg, store, cookieManager) {
  const openaiReq = await readBody(req);
  const stream = !!openaiReq.stream;
  const model = openaiReq.model || 'claude-sonnet-4.5';
  const smitheryReq = openaiToSmithery(openaiReq);

  dbg(cfg.debug, '[REQ][OpenAI]', JSON.stringify(openaiReq).slice(0, 500) + '...');
  dbg(cfg.debug, '[REQ][Smithery]', JSON.stringify(smitheryReq).slice(0, 500) + '...');

  const headers = {
    'content-type': 'application/json',
    'accept': 'text/event-stream',
    'origin': 'https://smithery.ai',
    'referer': 'https://smithery.ai/playground'
  };

  const ck = await store.readCookies();
  if (ck) headers.cookie = ck;

  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    try {
      const upstream = await fetch('https://smithery.ai/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify(smitheryReq)
      });

      if (!upstream.ok) {
        throw new Error(`upstream_status_${upstream.status}`);
      }

      if (stream) {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          'connection': 'keep-alive',
          'x-accel-buffering': 'no',
          'access-control-allow-origin': '*'
        });
        await streamUpstreamToOpenAISSE(upstream, model, res, cfg);
      } else {
        const obj = await smitheryToOpenAINonStream(upstream, model);
        sendJSON(res, obj);
      }
      return;

    } catch (error) {
      attempt++;
      dbg(cfg.debug, `[CHAT] Attempt ${attempt} failed:`, error.message);

      if (attempt >= maxAttempts) {
        return sendJSON(res, {
          error: `all_attempts_failed: ${error.message}`
        }, 502);
      }

      // 尝试轮换cookie
      const rotationResult = await cookieManager.autoRotate(ck);
      if (rotationResult.success) {
        dbg(cfg.debug, `[CHAT] Rotated to cookie index ${rotationResult.index}`);
        headers.cookie = rotationResult.cookie;
      } else {
        dbg(cfg.debug, `[CHAT] No more cookies available for rotation`);
        return sendJSON(res, {
          error: `no_available_cookies: ${error.message}`
        }, 502);
      }
    }
  }
}

async function handleList(res, store) {
  const cached = await store.readModels();
  if (cached && Array.isArray(cached.data)) {
    sendJSON(res, cached);
  } else {
    sendJSON(res, fallbackModelsList());
  }
}

async function handleRefresh(res, store) {
  const data = await refreshModelsStore(store, REASONING_SUFFIX_TO_LEVEL);
  sendJSON(res, data);
}

async function handleGetCookies(res, store) {
  const v = await store.readCookies();
  sendJSON(res, {
    cookies: v || ''
  });
}

async function handleSetCookies(req, res, store) {
  const b = await readBody(req);
  const ok = await store.writeCookies((b.cookies || '').toString());
  sendJSON(res, {
    ok
  });
}

async function handleAddModel(req, res, store) {
  const b = await readBody(req);
  const items = [];

  if (b.models && Array.isArray(b.models)) items.push(...b.models);
  if (b.id) items.push({
    id: b.id,
    owned_by: b.owned_by || 'custom',
    supportsReasoning: !!b.supportsReasoning
  });

  if (items.length === 0) {
    return sendJSON(res, {
      ok: false,
      error: 'no_models'
    }, 400);
  }

  let cur = await store.readModels();
  if (!cur || !Array.isArray(cur.data)) {
    cur = {
      object: 'list',
      data: []
    };
  }

  const ex = new Set(cur.data.map(x => x.id));
  for (const it of items) {
    const id = it.id && String(it.id);
    const owned = (it.owned_by && String(it.owned_by)) || 'custom';
    const sup = !!it.supportsReasoning;

    if (!id) continue;

    if (!ex.has(id)) {
      cur.data.push({
        id,
        object: 'model',
        owned_by: owned
      });
      ex.add(id);
    }

    if (sup) {
      for (const s of Object.keys(REASONING_SUFFIX_TO_LEVEL)) {
        const vid = `${id}${s}`;
        if (!ex.has(vid)) {
          cur.data.push({
            id: vid,
            object: 'model',
            owned_by: owned
          });
          ex.add(vid);
        }
      }
    }
  }

  const ok = await store.writeModels(cur);
  sendJSON(res, {
    ok,
    count: cur.data.length
  });
}

async function handleClearModels(res, store) {
  const ok = await store.deleteModels();
  sendJSON(res, {
    ok
  });
}

module.exports = {
  handleChat,
  handleList,
  handleRefresh,
  handleGetCookies,
  handleSetCookies,
  handleAddModel,
  handleClearModels
};