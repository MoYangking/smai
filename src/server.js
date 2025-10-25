const http = require('http');
const { loadConfig } = require('./config');
const Store = require('./store');
const CookieManager = require('./cookieManager');
const { serveAdminPage, sendJSON } = require('./utils');
const { logInfo } = require('./logger');
const {
  handleChat,
  handleList,
  handleRefresh,
  handleGetCookies,
  handleSetCookies,
  handleAddModel,
  handleClearModels
} = require('./routes');
const {
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
} = require('./adminRoutes');

async function main() {
  const cfg = await loadConfig();
  const store = new Store(cfg.dataDir);
  const cookieManager = new CookieManager(cfg.dataDir);

  await store.ensureDir();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;
    const m = req.method.toUpperCase();

    if (m === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type'
      });
      res.end();
      return;
    }

    try {
      if ((p === '/' || p === '/admin') && m === 'GET') {
        serveAdminPage(res);
        return;
      }

      // basic request log
      try {
        if (p !== '/admin/logs') logInfo('HTTP', { method: m, path: p });
      } catch {}

      // OpenAI Compatible API Routes
      if (p === '/v1/chat/completions' && m === 'POST') {
        return await handleChat(req, res, cfg, store, cookieManager);
      }
      if (p === '/v1/models' && m === 'GET') {
        return await handleList(res, store);
      }
      if (p === '/v1/models/refresh' && m === 'POST') {
        return await handleRefresh(res, store);
      }

      // Cookie Management Routes
      if (p === '/admin/cookies' && m === 'GET') {
        return await handleGetCookies(res, store);
      }
      if (p === '/admin/cookies' && m === 'POST') {
        return await handleSetCookies(req, res, store);
      }

      // Cookie Pool Management Routes
      if (p === '/admin/cookie-pool' && m === 'GET') {
        return await handleGetCookiePool(req, res, cookieManager);
      }
      if (p === '/admin/cookie-pool/add' && m === 'POST') {
        return await handleAddToCookiePool(req, res, cookieManager);
      }
      if (p === '/admin/cookie-pool/remove' && m === 'DELETE') {
        return await handleRemoveFromCookiePool(req, res, cookieManager);
      }
      if (p === '/admin/cookie-pool/rotate' && m === 'POST') {
        return await handleRotateCookie(req, res, cookieManager);
      }
      if (p === '/admin/cookie-pool/random' && m === 'POST') {
        return await handleRandomCookie(req, res, cookieManager);
      }
      if (p === '/admin/cookie-pool/clear' && m === 'DELETE') {
        return await handleClearCookiePool(req, res, cookieManager);
      }

      // Model Management Routes
      if (p === '/admin/models/add' && m === 'POST') {
        return await handleAddModel(req, res, store);
      }
      if (p === '/admin/models/clear' && m === 'POST') {
        return await handleClearModels(res, store);
      }

      // Settings and Logs
      if (p === '/admin/config' && m === 'GET') {
        return await handleGetConfig(res, cfg);
      }
      if (p === '/admin/config' && m === 'POST') {
        return await handleUpdateConfig(req, res, cfg);
      }
      if (p === '/admin/logs' && m === 'GET') {
        return await handleGetLogs(req, res);
      }
      if (p === '/admin/logs/clear' && m === 'POST') {
        return await handleClearLogs(res);
      }

      return sendJSON(res, {
        error: 'not_found'
      }, 404);

    } catch (e) {
      console.error('[fatal]', e && (e.stack || e.message || String(e)));
      return sendJSON(res, {
        error: 'internal_error'
      }, 500);
    }
  });

  server.listen(cfg.port, () => {
    console.log(`[server] http://0.0.0.0:${cfg.port}`);
    console.log(`[server] data dir: ${cfg.dataDir}`);
    try {
      logInfo('server_listening', { port: cfg.port, dataDir: cfg.dataDir });
    } catch {}
  });
}

// Export for Vercel
if (process.env.VERCEL) {
  module.exports = async (req, res) => {
    const cfg = await loadConfig();
    const store = new Store(cfg.dataDir);
    const cookieManager = new CookieManager(cfg.dataDir);
    await store.ensureDir();

    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;
    const m = req.method.toUpperCase();

    if (m === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS,DELETE',
        'access-control-allow-headers': 'content-type'
      });
      res.end();
      return;
    }

    try {
      // OpenAI Compatible API Routes
      if (p === '/v1/chat/completions' && m === 'POST') {
        return await handleChat(req, res, cfg, store, cookieManager);
      }
      if (p === '/v1/models' && m === 'GET') {
        return await handleList(res, store);
      }

      // Admin routes (limited for Vercel)
      if (p === '/admin/cookies' && m === 'GET') {
        return await handleGetCookies(res, store);
      }
      if (p === '/admin/cookie-pool' && m === 'GET') {
        return await handleGetCookiePool(req, res, cookieManager);
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    } catch (e) {
      console.error('[vercel error]', e);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal_error' }));
    }
  };
} else {
  main().catch(e => {
    console.error('[startup]', e);
    process.exit(1);
  });
}