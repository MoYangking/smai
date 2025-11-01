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

module.exports = router;

