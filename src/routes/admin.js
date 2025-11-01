const express = require('express');
const path = require('path');
const router = express.Router();
const { getCookiesList, addCookie, deleteCookie } = require('../utils/cookies');

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

router.post('/admin/cookies/add', (req, res) => {
  const { cookie } = req.body || {};
  const result = addCookie(cookie);
  res.json(result);
});

router.post('/admin/cookies/delete', (req, res) => {
  const { index } = req.body || {};
  const result = deleteCookie(index);
  res.json(result);
});

router.post('/admin/cookies/detect', async (req, res) => {
  try {
    const list = getCookiesList();
    if (!list.length) {
      return res.json({ ok: false, message: '无Cookie可检测' });
    }
    const port = process.env.PORT || 3000;
    const resp = await fetch(`http://localhost:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer test' },
      body: JSON.stringify({
        model: 'gemini-2.0-flash-exp',
        messages: [{ role: 'user', content: 'ok' }],
        max_tokens: 5
      })
    });
    const data = await resp.json();
    const valid = data.choices?.[0]?.message?.content ? true : false;
    res.json({ ok: true, message: valid ? `检测成功，共${list.length}个Cookie有效` : '检测失败，Cookie可能无效' });
  } catch (e) {
    res.json({ ok: false, message: '检测出错: ' + e.message });
  }
});

module.exports = router;

