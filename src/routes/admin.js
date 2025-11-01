const express = require('express');
const path = require('path');
const router = express.Router();
const { getCookiesList, setCookies } = require('../utils/cookies');

router.get('/', (req, res) => {
  res.redirect('/admin');
});

router.get('/admin', (req, res) => {
  const p = path.resolve(process.cwd(), 'public', 'admin.html');
  res.sendFile(p);
});

router.get('/admin/cookies', (req, res) => {
  const list = getCookiesList();
  res.json({ cookies: list });
});

router.post('/admin/cookies', (req, res) => {
  const body = req.body || {};
  const result = setCookies(body.cookies || '');
  res.json(result);
});

// Test cookies against smithery.ai using gemini-2.5-flash-lite
router.post('/admin/cookies/test', async (req, res) => {
  try {
    const body = req.body || {};
    let list = [];
    if (Array.isArray(body.cookies)) list = body.cookies.filter(Boolean).map(String).map(s => s.trim()).filter(Boolean);
    else if (typeof body.cookies === 'string' && body.cookies.trim()) list = body.cookies.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!list.length) list = getCookiesList();

    // Build a minimal smithery request targeting gemini-2.5-flash-lite
    const smitheryReq = {
      model: 'gemini-2.5-flash-lite',
      systemPrompt: 'You are a simple probe that replies with OK.',
      messages: [
        { id: Math.random().toString(16).slice(2, 10), role: 'user', parts: [{ type: 'text', text: 'Say OK' }] },
      ],
    };

    async function probe(cookieHeader) {
      try {
        const headers = {
          'content-type': 'application/json',
          'accept': 'text/event-stream',
          'origin': 'https://smithery.ai',
          'referer': 'https://smithery.ai/playground',
          'cookie': cookieHeader,
        };
        const resp = await fetch('https://smithery.ai/api/chat', { method: 'POST', headers, body: JSON.stringify(smitheryReq) });
        // Consider any 2xx as success
        return { ok: resp.ok, status: resp.status };
      } catch (e) {
        return { ok: false, status: 0 };
      }
    }

    // Probe sequentially to avoid burst failures
    const results = [];
    for (const ck of list) {
      if (!ck) continue;
      let out;
      try {
        out = await probe(ck);
      } catch {
        out = { ok: false, status: 0 };
      }
      results.push({ cookie: ck, ok: !!out.ok, status: out.status });
    }

    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'probe_failed' });
  }
});

module.exports = router;

