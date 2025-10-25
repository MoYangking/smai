const { randomUUID } = require('crypto');

function sseLine(p) {
  return `data: ${JSON.stringify(p)}\n\n`;
}

function textDeltaChunk(id, created, model, text) {
  return {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{
      index: 0,
      delta: {
        content: text || ''
      },
      finish_reason: null
    }]
  };
}

function reasoningDeltaChunk(id, created, model, r) {
  return {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{
      index: 0,
      delta: {
        reasoning_content: r || ''
      },
      finish_reason: null
    }]
  };
}

function toolCallDeltaChunk(id, created, model, index, callId, name, args) {
  const tc = {
    index,
    type: 'function',
    function: {
      name: name || '',
      arguments: args || ''
    }
  };
  if (callId) tc.id = callId;
  return {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{
      index: 0,
      delta: {
        tool_calls: [tc]
      },
      finish_reason: null
    }]
  };
}

function emptyStopChunk(id, created, model, usage) {
  const out = {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{
      index: 0,
      delta: {},
      finish_reason: 'stop'
    }]
  };
  if (usage) out.usage = usage;
  return out;
}

function parseSSEFromReadable(readable, onEvent) {
  const reader = readable.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let lines = [];

  const flush = () => {
    if (!lines.length) return;
    const s = lines.join('\n');
    lines = [];

    if (s === '[DONE]') {
      onEvent({
        __done__: true
      });
      return;
    }

    try {
      onEvent(JSON.parse(s));
    } catch {}
  };

  return (async () => {
    try {
      while (true) {
        const {
          done,
          value
        } = await reader.read();
        if (done) break;

        buf += dec.decode(value, {
          stream: true
        });

        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line === '') {
            flush();
            continue;
          }
          if (line.startsWith(':')) continue;
          if (line.startsWith('data:')) {
            const d = line.slice(5).replace(/^\s/, '');
            lines.push(d);
          }
        }
      }

      if (buf.length) {
        let line = buf;
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith('data:')) {
          const d = line.slice(5).replace(/^\s/, '');
          lines.push(d);
        }
      }

      flush();
    } catch (e) {
      onEvent({
        __done__: true,
        __error__: 'upstream_ended_prematurely'
      });
    } finally {
      try {
        reader.releaseLock();
      } catch {}
    }
  })();
}

async function streamUpstreamToOpenAISSE(upstream, model, res, cfg) {
  const chunkId = `chatcmpl-${randomUUID().slice(0, 8)}`;
  const created = Math.floor(Date.now() / 1000);
  const toolIdToIndex = new Map();
  let toolIndex = 0;
  let usage = null;
  let last = Date.now();
  const HEARTBEAT = Math.max(1000, Number(cfg.heartbeatMs) || 15000);

  const hb = setInterval(() => {
    if (Date.now() - last >= HEARTBEAT - 100) {
      try {
        res.write(`: ping ${new Date().toISOString()}\n\n`);
        last = Date.now();
      } catch {
        try {
          clearInterval(hb);
        } catch {}
      }
    }
  }, HEARTBEAT);

  res.write(`:${' '.repeat(2048)}\n\n`);

  await parseSSEFromReadable(upstream.body, (evt) => {
    if (evt.__done__) {
      try {
        res.write(sseLine(emptyStopChunk(chunkId, created, model, usage)));
        res.write('data: [DONE]\n\n');
      } finally {
        try {
          clearInterval(hb);
        } catch {}
        try {
          res.end();
        } catch {}
      }
      return;
    }

    const t = evt.type;
    if (t === 'text-delta') {
      res.write(sseLine(textDeltaChunk(chunkId, created, model, evt.delta || '')));
      last = Date.now();
      return;
    }

    if (t === 'reasoning-delta') {
      res.write(sseLine(reasoningDeltaChunk(chunkId, created, model, evt.delta || '')));
      last = Date.now();
      return;
    }

    if (t === 'finish') {
      const md = evt.messageMetadata || {};
      const u = md.usage || {};
      usage = {
        prompt_tokens: Number(u.inputTokens || 0),
        completion_tokens: Number(u.outputTokens || 0),
        total_tokens: Number(u.totalTokens || 0)
      };
      return;
    }

    if (t === 'tool-input-start') {
      const callId = evt.toolCallId;
      const name = evt.toolName;
      if (!toolIdToIndex.has(callId)) toolIdToIndex.set(callId, toolIndex++);
      const idx = toolIdToIndex.get(callId) || 0;
      res.write(sseLine(toolCallDeltaChunk(chunkId, created, model, idx, callId, name, '')));
      last = Date.now();
      return;
    }

    if (t === 'tool-input-delta') {
      const callId = evt.toolCallId;
      let piece = evt.inputTextDelta || '';
      if (!toolIdToIndex.has(callId)) toolIdToIndex.set(callId, toolIndex++);
      const idx = toolIdToIndex.get(callId) || 0;
      res.write(sseLine(toolCallDeltaChunk(chunkId, created, model, idx, callId, null, String(piece))));
      last = Date.now();
      return;
    }

    if (t === 'tool-call' || t === 'tool_call' || t === 'tool-call-delta' || t === 'tool_call_delta') {
      const callId = evt.id || evt.callId;
      const name = evt.name || evt.tool || evt.function;
      let args = evt.arguments_delta || evt.argumentsDelta || evt.arguments || '';
      if (typeof args !== 'string') args = JSON.stringify(args);
      if (!toolIdToIndex.has(callId)) toolIdToIndex.set(callId, toolIndex++);
      const idx = toolIdToIndex.get(callId) || 0;
      res.write(sseLine(toolCallDeltaChunk(chunkId, created, model, idx, callId, name, args)));
      last = Date.now();
      return;
    }
  });
}

async function smitheryToOpenAINonStream(upstream, model) {
  const text = await new Response(upstream.body).text();
  let content = '';
  let p = 0,
    c = 0,
    t = 0;
  const order = [];
  const map = {};

  for (const raw of text.split('\n')) {
    if (!raw.startsWith('data: ')) continue;
    const ds = raw.slice(6);
    if (ds === '[DONE]') break;

    let d;
    try {
      d = JSON.parse(ds);
    } catch {
      continue;
    }

    const et = d.type;
    if (et === 'text-delta') {
      content += d.delta || '';
    } else if (et === 'tool-input-start') {
      const id = d.toolCallId || `call_${order.length}`;
      const name = d.toolName || '';
      if (!map[id]) {
        order.push(id);
        map[id] = {
          name,
          args: ''
        };
      } else if (!map[id].name) map[id].name = name;
    } else if (et === 'tool-input-delta') {
      const id = d.toolCallId || `call_${order.length}`;
      if (!map[id]) {
        order.push(id);
        map[id] = {
          name: '',
          args: ''
        };
      }
      let piece = d.inputTextDelta || '';
      if (typeof piece !== 'string') piece = JSON.stringify(piece);
      map[id].args += piece;
    } else if (et === 'tool-input-available') {
      const id = d.toolCallId || `call_${order.length}`;
      if (!map[id]) {
        order.push(id);
        map[id] = {
          name: d.toolName || '',
          args: ''
        };
      }
      if (!map[id].args) {
        const obj = d.input || {};
        map[id].args = JSON.stringify(obj);
      }
    } else if (et === 'tool-call' || et === 'tool_call') {
      const id = d.id || d.callId || `call_${order.length}`;
      const name = d.name || d.tool || d.function || '';
      let args = d.arguments;
      if (typeof args !== 'string') args = JSON.stringify(args);
      if (!map[id]) {
        order.push(id);
        map[id] = {
          name,
          args: args || ''
        };
      } else {
        if (!map[id].name) map[id].name = name;
        map[id].args += (args || '');
      }
    } else if (et === 'tool-call-delta' || et === 'tool_call_delta') {
      const id = d.id || d.callId || `call_${order.length}`;
      if (!map[id]) {
        order.push(id);
        map[id] = {
          name: d.name || d.tool || d.function || '',
          args: ''
        };
      }
      let piece = d.arguments_delta || d.argumentsDelta || d.arguments || '';
      if (typeof piece !== 'string') piece = JSON.stringify(piece);
      map[id].args += piece;
    } else if (et === 'finish') {
      const u = (d.messageMetadata || {}).usage || {};
      p = Number(u.inputTokens || 0);
      c = Number(u.outputTokens || 0);
      t = Number(u.totalTokens || (p + c));
    }
  }

  const calls = [];
  for (const id of order) {
    const r = map[id] || {
      name: '',
      args: ''
    };
    calls.push({
      id,
      type: 'function',
      function: {
        name: r.name || '',
        arguments: r.args || ''
      }
    });
  }

  return {
    id: `chatcmpl-${randomUUID().slice(0, 8)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: calls.length ? {
        role: 'assistant',
        content: content,
        tool_calls: calls
      } : {
        role: 'assistant',
        content: content
      },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: p,
      completion_tokens: c,
      total_tokens: t
    }
  };
}

module.exports = {
  streamUpstreamToOpenAISSE,
  smitheryToOpenAINonStream,
  parseSSEFromReadable
};