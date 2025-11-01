const { encodeSSE, parseSSEStream } = require('../utils/sse');
const { openaiToSmithery, smitheryToOpenAINonStream } = require('./openaiMap');
const { pickCookieRoundRobin } = require('../utils/cookies');
const { loadConfig, log } = require('../utils/logger');

function sseTextDelta(chunkId, created, model, text) {
  return encodeSSE({
    id: chunkId,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta: { content: text || '' }, finish_reason: null }],
  });
}

function sseStopChunk(chunkId, created, model, usage) {
  const out = {
    id: chunkId,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  };
  if (usage) out.usage = usage;
  return encodeSSE(out);
}

function sseToolCallDelta(chunkId, created, model, index, callId, name, argumentsDelta) {
  const tc = { index, type: 'function', function: { name: name || '', arguments: argumentsDelta || '' } };
  if (callId) tc.id = callId;
  return encodeSSE({
    id: chunkId,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta: { tool_calls: [tc] }, finish_reason: null }],
  });
}

async function fetchUpstream(smitheryReq) {
  const headers = {
    'content-type': 'application/json',
    'accept': 'text/event-stream',
    'origin': 'https://smithery.ai',
    'referer': 'https://smithery.ai/playground',
  };
  const cookieHeader = pickCookieRoundRobin();
  if (cookieHeader) headers['cookie'] = cookieHeader;
  const resp = await fetch('https://smithery.ai/api/chat', {
    method: 'POST', headers, body: JSON.stringify(smitheryReq)
  });
  return resp;
}

function streamOnce(originalOpenAIReq, model) {
  const cfg = loadConfig();
  const chunkId = `chatcmpl-${(globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2)).slice(0, 8)}`;
  const created = Math.floor(Date.now() / 1000);
  const controller = new TransformStream();
  const writer = controller.writable.getWriter();
  const encoder = new TextEncoder();

  let lastWriteAt = Date.now();
  let closed = false;
  let thinkOpen = false;
  let usageInfo = null;

  const FLUSH_INTERVAL_MS = (() => {
    const v = Number(cfg.flushIntervalMs);
    return Number.isFinite(v) && v >= 10 && v <= 200 ? v : 40;
  })();

  let pendingOut = '';
  let flushTimerId = null;
  function scheduleFlush() {
    if (closed) return;
    if (flushTimerId) return;
    flushTimerId = setTimeout(async () => {
      flushTimerId = null;
      if (!pendingOut) return;
      await safeWrite(sseTextDelta(chunkId, created, model, pendingOut));
      pendingOut = '';
    }, FLUSH_INTERVAL_MS);
  }

  const HEARTBEAT_MS = (() => {
    const n = Number(cfg.heartbeatMs);
    return Number.isFinite(n) && n >= 1000 ? n : 15000;
  })();

  async function safeWrite(str) {
    if (closed) return;
    try {
      await writer.ready;
      await writer.write(encoder.encode(str));
      lastWriteAt = Date.now();
    } catch {
      closed = true;
      try { clearInterval(heartbeatTimer); } catch {}
      try { writer.close(); } catch {}
    }
  }

  const heartbeatTimer = setInterval(() => {
    if (closed) return;
    if (Date.now() - lastWriteAt >= HEARTBEAT_MS - 100) {
      safeWrite(`: ping ${new Date().toISOString()}\n\n`);
    }
  }, HEARTBEAT_MS);

  // Initial padding to flush proxies
  safeWrite(`:${' '.repeat(2048)}\n\n`);

  function maybeCloseThinkIntoPending() {
    if (thinkOpen) {
      thinkOpen = false;
      pendingOut += '</think>';
    }
  }

  const toolIdToIndex = new Map(); let toolIndex = 0;

  (async () => {
    try {
      const smitheryReq = openaiToSmithery(originalOpenAIReq);
      const upstream = await fetchUpstream(smitheryReq);
      if (!upstream.ok) {
        // Upstream error: return empty stop chunk for compatibility
        await safeWrite(sseStopChunk(chunkId, created, model));
        await safeWrite('data: [DONE]\n\n');
        return;
      }

      await parseSSEStream(upstream.body, async (evt) => {
        if (evt.__done__) {
          maybeCloseThinkIntoPending();
          if (pendingOut) { await safeWrite(sseTextDelta(chunkId, created, model, pendingOut)); pendingOut = ''; }
          await safeWrite(sseStopChunk(chunkId, created, model, usageInfo));
          await safeWrite('data: [DONE]\n\n');
          return;
        }
        const t = evt.type;
        if (t === 'finish') {
          const md = evt.messageMetadata || {}; const u = md.usage || {};
          usageInfo = {
            prompt_tokens: Number(u.inputTokens || 0),
            completion_tokens: Number(u.outputTokens || 0),
            total_tokens: Number(u.totalTokens || 0),
          };
          return;
        }
        if (t === 'reasoning-delta') {
          const piece = evt.delta || '';
          if (!thinkOpen) { thinkOpen = true; pendingOut += '<think>'; }
          const s = (typeof piece === 'string') ? piece : String(piece);
          pendingOut += s;
          scheduleFlush();
          return;
        }
        if (t === 'text-delta') {
          if (thinkOpen) { thinkOpen = false; pendingOut += '</think>'; }
          const piece = evt.delta || '';
          const s = (typeof piece === 'string') ? piece : String(piece);
          pendingOut += s;
          scheduleFlush();
          return;
        }
        if (t === 'tool-input-start') {
          if (pendingOut) { await safeWrite(sseTextDelta(chunkId, created, model, pendingOut)); pendingOut = ''; if (flushTimerId) { clearTimeout(flushTimerId); flushTimerId = null; } }
          const callId = evt.toolCallId; const name = evt.toolName;
          if (!toolIdToIndex.has(callId)) toolIdToIndex.set(callId, toolIndex++);
          const idx = toolIdToIndex.get(callId) || 0;
          await safeWrite(sseToolCallDelta(chunkId, created, model, idx, callId, name, ''));
          return;
        }
        if (t === 'tool-input-delta') {
          if (pendingOut) { await safeWrite(sseTextDelta(chunkId, created, model, pendingOut)); pendingOut = ''; if (flushTimerId) { clearTimeout(flushTimerId); flushTimerId = null; } }
          const callId = evt.toolCallId; let piece = evt.inputTextDelta || '';
          if (!toolIdToIndex.has(callId)) toolIdToIndex.set(callId, toolIndex++);
          const idx = toolIdToIndex.get(callId) || 0;
          await safeWrite(sseToolCallDelta(chunkId, created, model, idx, callId, null, String(piece)));
          return;
        }
        if (t === 'tool-call' || t === 'tool_call' || t === 'tool-call-delta' || t === 'tool_call_delta') {
          if (pendingOut) { await safeWrite(sseTextDelta(chunkId, created, model, pendingOut)); pendingOut = ''; if (flushTimerId) { clearTimeout(flushTimerId); flushTimerId = null; } }
          const callId = evt.id || evt.callId; const name = evt.name || evt.tool || evt.function;
          let argumentsDelta = evt.arguments_delta || evt.argumentsDelta || evt.arguments || '';
          if (typeof argumentsDelta !== 'string') argumentsDelta = JSON.stringify(argumentsDelta);
          if (!toolIdToIndex.has(callId)) toolIdToIndex.set(callId, toolIndex++);
          const idx = toolIdToIndex.get(callId) || 0;
          await safeWrite(sseToolCallDelta(chunkId, created, model, idx, callId, name, argumentsDelta));
          return;
        }
      });
    } catch (e) {
      try { if (thinkOpen) { thinkOpen = false; pendingOut += '</think>'; } } catch {}
      try { if (pendingOut) { await safeWrite(sseTextDelta(chunkId, created, model, pendingOut)); pendingOut = ''; } } catch {}
      try { await safeWrite(sseStopChunk(chunkId, created, model)); } catch {}
      try { await safeWrite('data: [DONE]\n\n'); } catch {}
    } finally {
      try { clearInterval(heartbeatTimer); } catch {}
      try { if (flushTimerId) { clearTimeout(flushTimerId); flushTimerId = null; } } catch {}
      try { writer.close(); closed = true; } catch {}
    }
  })();

  return controller.readable;
}

async function handleStream(openaiReq) {
  const model = openaiReq.model || 'claude-sonnet-4.5';
  const rs = streamOnce(openaiReq, model);
  return rs;
}

async function handleNonStream(openaiReq) {
  const model = openaiReq.model || 'claude-sonnet-4.5';
  const smitheryReq = openaiToSmithery(openaiReq);
  const upstream = await fetchUpstream(smitheryReq);
  if (!upstream.ok) {
    const err = new Error(`upstream_status_${upstream.status}`);
    err.statusCode = 502;
    throw err;
  }
  const obj = await smitheryToOpenAINonStream(upstream, model);
  return obj;
}

module.exports = { handleStream, handleNonStream };
