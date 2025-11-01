const express = require('express');
const router = express.Router();
const { readModels, refreshModels, clearModels, writeModels } = require('../services/modelsService');

router.get('/v1/models', async (req, res) => {
  try {
    const data = readModels();
    res.status(200).json(data);
  } catch (e) {
    res.status(200).json({ object: 'list', data: [] });
  }
});

router.post('/v1/models/refresh', async (req, res) => {
  try {
    const data = await refreshModels();
    res.status(200).json(data);
  } catch (e) {
    res.status(200).json(readModels());
  }
});

router.post('/admin/models/add', async (req, res) => {
  try {
    const body = req.body || {};
    const items = [];
    if (Array.isArray(body.models)) items.push(...body.models);
    if (body.id) items.push({ id: body.id, owned_by: body.owned_by || 'custom', supportsReasoning: !!body.supportsReasoning });
    if (items.length === 0) return res.status(400).json({ ok: false, error: 'no_models' });

    let current = readModels();
    if (!current || !Array.isArray(current.data)) current = { object: 'list', data: [] };
    const existing = new Set(current.data.map(x => x.id));
    const REASONING_SUFFIX_TO_LEVEL = { '-minimal': 1, '-low': 1, '-medium': 1, '-high': 1 };

    for (const it of items) {
      const id = it.id && String(it.id);
      const owned = (it.owned_by && String(it.owned_by)) || 'custom';
      const sup = !!it.supportsReasoning;
      if (!id) continue;
      if (!existing.has(id)) { current.data.push({ id, object: 'model', owned_by: owned }); existing.add(id); }
      if (sup) {
        for (const suffix of Object.keys(REASONING_SUFFIX_TO_LEVEL)) {
          const vid = `${id}${suffix}`; if (!existing.has(vid)) { current.data.push({ id: vid, object: 'model', owned_by: owned }); existing.add(vid); }
        }
      }
    }

    writeModels(current);
    res.json({ ok: true, count: current.data.length });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

router.post('/admin/models/clear', async (req, res) => {
  try { clearModels(); res.json({ ok: true }); } catch { res.json({ ok: false }); }
});

module.exports = router;

