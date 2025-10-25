function sendJSON(res, data, status = 200, hdr = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    ...hdr
  });
  res.end(JSON.stringify(data));
}

function sendSSEHeaders(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'connection': 'keep-alive',
    'x-accel-buffering': 'no',
    'access-control-allow-origin': '*'
  });
}

async function fetchText(url, init = {}) {
  const r = await fetch(url, {
    ...init,
    headers: {
      'user-agent': 'Mozilla/5.0',
      ...(init.headers || {})
    }
  });
  if (!r.ok) throw new Error(`GET ${url} ${r.status}`);
  return await r.text();
}

async function readBody(req) {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const buf = Buffer.concat(chunks);
  const ct = String(req.headers['content-type'] || '');

  if (ct.includes('application/json')) {
    try {
      return JSON.parse(buf.toString('utf-8'));
    } catch {
      return {};
    }
  }

  if (ct.includes('application/x-www-form-urlencoded')) {
    const p = new URLSearchParams(buf.toString('utf-8'));
    const o = {};
    for (const [k, v] of p.entries()) o[k] = v;
    return o;
  }

  return {};
}

function serveAdminPage(res) {
  const fs = require('fs');
  const path = require('path');

  const adminPath = path.resolve(__dirname, '..', 'public', 'admin.html');
  fs.readFile(adminPath, 'utf-8', (err, html) => {
    if (err) {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'access-control-allow-origin': '*'
      });
      res.end('<!doctype html><meta charset="utf-8"><title>Admin</title><body><h1>Admin 页面未找到</h1><p>请确认 public/admin.html 是否存在。</p></body>');
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'access-control-allow-origin': '*'
    });
    res.end(html);
  });
}

module.exports = {
  sendJSON,
  sendSSEHeaders,
  fetchText,
  readBody,
  serveAdminPage
};