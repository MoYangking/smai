const { sendJSON, readBody } = require('./utils');
const { LOGS, logInfo, logError } = require('./logger');
const { updateAndPersistConfig } = require('./config');

async function handleGetLogs(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const since = url.searchParams.get('since');
    const limit = Number(url.searchParams.get('limit') || 0);
    let out = LOGS.getSince(since);
    if (limit && Number.isFinite(limit) && limit > 0) out = out.slice(-limit);
    return sendJSON(res, { logs: out, now: Date.now() });
  } catch (e) {
    logError('logs_read_failed', { error: e && (e.message || String(e)) });
    return sendJSON(res, { error: 'bad_request' }, 400);
  }
}

async function handleClearLogs(res) {
  try {
    LOGS.clear();
  } catch {}
  return sendJSON(res, { ok: true });
}

async function handleGetConfig(res, cfg) {
  return sendJSON(res, {
    debug: !!cfg.debug,
    heartbeatMs: Number(cfg.heartbeatMs || 15000),
    flushIntervalMs: Number(cfg.flushIntervalMs || 40),
    autoResumeMax: Number(cfg.autoResumeMax || 1),
    port: Number(cfg.port || 8787),
    dataDir: cfg.dataDir
  });
}

async function handleUpdateConfig(req, res, cfg) {
  const b = await readBody(req);
  const patch = {};

  if (b.debug !== undefined) {
    const v = b.debug;
    patch.debug = (v === true || v === 'true' || v === 1 || v === '1');
  }

  if (b.heartbeatMs !== undefined) {
    const n = Number(b.heartbeatMs);
    if (Number.isFinite(n) && n >= 500) patch.heartbeatMs = n;
  }

  if (b.flushIntervalMs !== undefined) {
    const n = Number(b.flushIntervalMs);
    if (Number.isFinite(n) && n >= 10 && n <= 200) patch.flushIntervalMs = n;
  }

  if (b.autoResumeMax !== undefined) {
    const n = Number(b.autoResumeMax);
    if (Number.isFinite(n) && n >= 1 && n <= 5) patch.autoResumeMax = n;
  }

  const result = await updateAndPersistConfig(cfg, patch);
  if (!result.success) {
    return sendJSON(res, { error: result.error }, 500);
  }

  logInfo('config_updated', { patch });

  return sendJSON(res, {
    ok: true,
    config: {
      debug: !!cfg.debug,
      heartbeatMs: Number(cfg.heartbeatMs || 15000),
      flushIntervalMs: Number(cfg.flushIntervalMs || 40),
      autoResumeMax: Number(cfg.autoResumeMax || 1),
      port: Number(cfg.port || 8787),
      dataDir: cfg.dataDir
    }
  });
}

// Cookie Pool Management Routes
async function handleGetCookiePool(req, res, cookieManager) {
  try {
    const status = await cookieManager.getPoolStatus();
    return sendJSON(res, status);
  } catch (e) {
    logError('cookie_pool_read_failed', { error: e && (e.message || String(e)) });
    return sendJSON(res, { error: 'bad_request' }, 400);
  }
}

async function handleAddToCookiePool(req, res, cookieManager) {
  try {
    const body = await readBody(req);
    const cookies = body.cookies;

    if (!cookies) {
      return sendJSON(res, { error: 'cookies_required' }, 400);
    }

    const count = await cookieManager.addToCookiePool(cookies);
    return sendJSON(res, {
      ok: true,
      message: `Added ${Array.isArray(cookies) ? cookies.length : 1} cookie(s) to pool`,
      total: count
    });
  } catch (e) {
    logError('cookie_pool_add_failed', { error: e && (e.message || String(e)) });
    return sendJSON(res, { error: 'internal_error' }, 500);
  }
}

async function handleRemoveFromCookiePool(req, res, cookieManager) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const cookie = url.searchParams.get('cookie');

    if (!cookie) {
      return sendJSON(res, { error: 'cookie_parameter_required' }, 400);
    }

    const count = await cookieManager.removeFromCookiePool(cookie);
    return sendJSON(res, {
      ok: true,
      message: 'Cookie removed from pool',
      total: count
    });
  } catch (e) {
    logError('cookie_pool_remove_failed', { error: e && (e.message || String(e)) });
    return sendJSON(res, { error: 'internal_error' }, 500);
  }
}

async function handleRotateCookie(req, res, cookieManager) {
  try {
    const result = await cookieManager.rotateCookie();
    if (!result.success) {
      return sendJSON(res, { error: result.message }, 400);
    }

    return sendJSON(res, {
      ok: true,
      message: 'Cookie rotated successfully',
      ...result
    });
  } catch (e) {
    logError('cookie_rotation_failed', { error: e && (e.message || String(e)) });
    return sendJSON(res, { error: 'internal_error' }, 500);
  }
}

async function handleRandomCookie(req, res, cookieManager) {
  try {
    const result = await cookieManager.randomCookie();
    if (!result.success) {
      return sendJSON(res, { error: result.message }, 400);
    }

    return sendJSON(res, {
      ok: true,
      message: 'Random cookie selected successfully',
      ...result
    });
  } catch (e) {
    logError('random_cookie_selection_failed', { error: e && (e.message || String(e)) });
    return sendJSON(res, { error: 'internal_error' }, 500);
  }
}

async function handleClearCookiePool(req, res, cookieManager) {
  try {
    await cookieManager.clearCookiePool();
    return sendJSON(res, {
      ok: true,
      message: 'Cookie pool cleared'
    });
  } catch (e) {
    logError('cookie_pool_clear_failed', { error: e && (e.message || String(e)) });
    return sendJSON(res, { error: 'internal_error' }, 500);
  }
}

module.exports = {
  handleGetLogs,
  handleClearLogs,
  handleGetConfig,
  handleUpdateConfig,
  handleGetCookiePool,
  handleAddToCookiePool,
  handleRemoveFromCookiePool,
  handleRotateCookie,
  handleRandomCookie,
  handleClearCookiePool
};