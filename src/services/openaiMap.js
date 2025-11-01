const REASONING_SUFFIX_TO_LEVEL = {
  '-minimal': 'minimal',
  '-low': 'low',
  '-medium': 'medium',
  '-high': 'high',
};

function isDataUrl(u) { return typeof u === 'string' && u.startsWith('data:'); }

function convertContentItemToPart(item) {
  if (!item || typeof item !== 'object' || !item.type) return null;
  if (item.type === 'text') return { type: 'text', text: item.text || '' };
  if (item.type === 'image_url') {
    const u = item.image_url && item.image_url.url;
    if (isDataUrl(u)) {
      const mediaType = u.split(';')[0].split(':')[1] || 'image/png';
      return { type: 'file', mediaType, filename: 'image.png', url: u };
    }
  }
  return null;
}

function convertOpenAIMessageToSmithery(msg) {
  const role = msg && msg.role;
  if (role === 'system') return null;

  const parts = [];
  const content = msg && msg.content;
  if (typeof content === 'string') {
    parts.push({ type: 'text', text: content });
  } else if (Array.isArray(content)) {
    for (const item of content) {
      const p = convertContentItemToPart(item);
      if (p) parts.push(p);
    }
  }

  if (role === 'tool') {
    const tool_call_id = msg.tool_call_id;
    const name = msg.name || msg.tool_name;
    parts.push({
      type: 'tool_result',
      toolCallId: tool_call_id,
      toolName: name,
      result: typeof content === 'string' ? content : JSON.stringify(content || ''),
    });
  }

  return {
    id: (globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2)).replace(/-/g, '').slice(0, 16),
    role: role || 'user',
    parts,
  };
}

function extractSystemPromptAndMessages(openaiMessages) {
  const systemPrompts = [];
  const out = [];
  const msgs = Array.isArray(openaiMessages) ? openaiMessages : [];

  let i = 0;
  while (i < msgs.length) {
    const msg = msgs[i];
    const role = msg && msg.role;
    if (role === 'system') {
      if (msg.content) systemPrompts.push(msg.content);
      i++;
      continue;
    }

    const toolCalls = msg && msg.tool_calls;
    if (role === 'assistant' && Array.isArray(toolCalls) && toolCalls.length) {
      const pending = {};
      for (let idx = 0; idx < toolCalls.length; idx++) {
        const tc = toolCalls[idx];
        if (!tc || tc.type !== 'function') continue;
        const fn = tc.function || {};
        const name = fn.name;
        let argsStr = typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments || {});
        let argsObj;
        try { argsObj = argsStr ? JSON.parse(argsStr) : {}; } catch { argsObj = {}; }
        const callId = tc.id || `call_${i}_${idx}`;
        pending[callId] = { name, input: argsObj, out: '' };
      }

      let j = i + 1;
      let consumed = 0;
      while (j < msgs.length && msgs[j] && msgs[j].role === 'tool') {
        const tm = msgs[j];
        const callId = tm.tool_call_id;
        if (pending[callId]) {
          const piece = typeof tm.content === 'string' ? tm.content : JSON.stringify(tm.content || '');
          pending[callId].out += piece || '';
        }
        consumed++;
        j++;
      }

      const parts = [{ type: 'step-start' }];
      for (const [callId, info] of Object.entries(pending)) {
        const name = info.name || '';
        const part = { type: name ? `tool-${name}` : 'tool-call', toolCallId: callId };
        const outText = info.out || '';
        if (outText) {
          Object.assign(part, {
            state: 'output-available',
            input: info.input || {},
            output: { content: [{ type: 'text', text: outText }] },
          });
        } else {
          Object.assign(part, { state: 'input-available', input: info.input || {} });
        }
        parts.push(part);
      }

      out.push({ id: (globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2)).replace(/-/g, '').slice(0, 16), role: 'assistant', parts });
      i = i + 1 + consumed;
      continue;
    }

    const converted = convertOpenAIMessageToSmithery(msg);
    if (converted) out.push(converted);
    i++;
  }

  const systemPrompt = systemPrompts.length ? systemPrompts.join('\n\n') : 'You are a helpful assistant.';
  return { systemPrompt, messages: out };
}

function mapOpenAIToolsToSmithery(openaiTools) {
  const result = [];
  if (!Array.isArray(openaiTools)) return result;
  for (const tool of openaiTools) {
    if (!tool || typeof tool !== 'object') continue;
    if (tool.type === 'function' && tool.function && typeof tool.function === 'object') {
      const fn = tool.function;
      result.push({
        type: 'function',
        name: fn.name,
        description: fn.description || '',
        inputSchema: fn.parameters || {},
        parameters: fn.parameters || {},
      });
    } else {
      result.push(tool);
    }
  }
  return result;
}

function openaiToSmithery(openaiReq) {
  const { systemPrompt, messages } = extractSystemPromptAndMessages(openaiReq.messages || []);
  const requestedModel = openaiReq.model || 'claude-sonnet-4.5';
  let baseModel = requestedModel;
  let inferredReasoning = null;
  for (const [suffix, level] of Object.entries(REASONING_SUFFIX_TO_LEVEL)) {
    if (requestedModel.endsWith(suffix) && requestedModel.length > suffix.length) {
      baseModel = requestedModel.slice(0, -suffix.length);
      inferredReasoning = level;
      break;
    }
  }

  const smitheryReq = {
    messages,
    tools: mapOpenAIToolsToSmithery(openaiReq.tools),
    model: baseModel,
    systemPrompt,
  };
  if (openaiReq.reasoning_effort) smitheryReq.reasoningEffort = openaiReq.reasoning_effort;
  else if (inferredReasoning) smitheryReq.reasoningEffort = inferredReasoning;
  if (openaiReq.tool_choice !== undefined) smitheryReq.toolChoice = openaiReq.tool_choice;
  return smitheryReq;
}

async function smitheryToOpenAINonStream(upstreamResp, model) {
  const text = await new Response(upstreamResp.body).text();
  let content = '';
  let promptTokens = 0, completionTokens = 0, totalTokens = 0;
  const order = [];
  const map = {};

  for (const rawLine of text.split('\n')) {
    if (!rawLine.startsWith('data: ')) continue;
    const dataStr = rawLine.slice(6);
    if (dataStr === '[DONE]') break;
    let data;
    try { data = JSON.parse(dataStr); } catch { continue; }
    const et = data.type;
    if (et === 'text-delta') {
      content += data.delta || '';
    } else if (et === 'tool-input-start') {
      const callId = data.toolCallId || `call_${order.length}`;
      const name = data.toolName || '';
      if (!map[callId]) { order.push(callId); map[callId] = { name, args: '' }; }
      else if (!map[callId].name) map[callId].name = name;
    } else if (et === 'tool-input-delta') {
      const callId = data.toolCallId || `call_${order.length}`;
      if (!map[callId]) { order.push(callId); map[callId] = { name: '', args: '' }; }
      let piece = data.inputTextDelta || '';
      if (typeof piece !== 'string') piece = JSON.stringify(piece);
      map[callId].args += piece;
    } else if (et === 'tool-input-available') {
      const callId = data.toolCallId || `call_${order.length}`;
      if (!map[callId]) { order.push(callId); map[callId] = { name: data.toolName || '', args: '' }; }
      if (!map[callId].args) {
        const obj = data.input || {};
        map[callId].args = JSON.stringify(obj);
      }
    } else if (et === 'tool-call' || et === 'tool_call') {
      const callId = data.id || data.callId || `call_${order.length}`;
      const name = data.name || data.tool || data.function || '';
      let argsVal = data.arguments;
      if (typeof argsVal !== 'string') argsVal = JSON.stringify(argsVal);
      if (!map[callId]) { order.push(callId); map[callId] = { name, args: argsVal || '' }; }
      else { if (!map[callId].name) map[callId].name = name; map[callId].args += argsVal || ''; }
    } else if (et === 'tool-call-delta' || et === 'tool_call_delta') {
      const callId = data.id || data.callId || `call_${order.length}`;
      if (!map[callId]) { order.push(callId); map[callId] = { name: data.name || data.tool || data.function || '', args: '' }; }
      let piece = data.arguments_delta || data.argumentsDelta || data.arguments || '';
      if (typeof piece !== 'string') piece = JSON.stringify(piece);
      map[callId].args += piece;
    } else if (et === 'finish') {
      const md = data.messageMetadata || {}; const u = md.usage || {};
      promptTokens = Number(u.inputTokens || 0);
      completionTokens = Number(u.outputTokens || 0);
      totalTokens = Number(u.totalTokens || (promptTokens + completionTokens));
    }
  }

  const finalToolCalls = [];
  for (const id of order) {
    const rec = map[id] || { name: '', args: '' };
    finalToolCalls.push({ id, type: 'function', function: { name: rec.name || '', arguments: rec.args || '' } });
  }

  return {
    id: `chatcmpl-${(globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2)).slice(0, 8)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: finalToolCalls.length
        ? { role: 'assistant', content: content, tool_calls: finalToolCalls }
        : { role: 'assistant', content: content },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    },
  };
}

module.exports = {
  REASONING_SUFFIX_TO_LEVEL,
  openaiToSmithery,
  smitheryToOpenAINonStream
};

