const express = require('express');
const router = express.Router();
const { handleStream, handleNonStream } = require('../services/smitheryStream');
const { loadConfig, log } = require('../utils/logger');

router.post('/v1/chat/completions', async (req, res) => {
  try {
    const openaiReq = req.body || {};
    const stream = !!openaiReq.stream;
    log('[REQ][OpenAI]', JSON.stringify(openaiReq).slice(0, 500) + '...');

    if (stream) {
      const readable = await handleStream(openaiReq);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      const reader = readable.getReader();
      const encoder = new TextEncoder();
      const write = async (chunk) => {
        res.write(Buffer.from(chunk));
      };
      // drain readable into response
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await write(value);
          }
        } catch (e) {
          // ignore
        } finally {
          try { reader.releaseLock(); } catch {}
          try { res.end(); } catch {}
        }
      })();
      return;
    }

    const obj = await handleNonStream(openaiReq);
    res.status(200).json(obj);
  } catch (err) {
    const code = err.statusCode || 500;
    res.status(code).json({ error: err.message || 'internal_error' });
  }
});

module.exports = router;

