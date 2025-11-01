const { randomUUID } = require('crypto');

const REASONING_SUFFIX_TO_LEVEL = {
  '-minimal': 'minimal',
  '-low': 'low',
  '-medium': 'medium',
  '-high': 'high'
};

function isDataUrl(u) {
  return typeof u === 'string' && u.startsWith('data:');
}

function convertContentItemToPart(it) {
  if (!it || typeof it !== 'object' || !it.type) return null;

  // Text
  if (it.type === 'text' || it.type === 'input_text') {
    return { type: 'text', text: it.text || it.input_text || '' };
  }

  // Helpers for filename/media type inference
  const inferExt = (mt) => {
    const map = {
      'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
      'application/pdf': 'pdf', 'text/plain': 'txt', 'text/markdown': 'md', 'application/json': 'json',
      'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm', 'audio/ogg': 'ogg',
      'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv', 'application/zip': 'zip', 'application/x-zip-compressed': 'zip'
    };
    return map[mt] || '';
  };
  const inferNameFromUrl = (u, mt) => {
    try {
      const url = new URL(u);
      const base = url.pathname.split('/').filter(Boolean).pop() || '';
      if (base) return base;
    } catch {}
    const ext = inferExt(mt);
    const base = ext ? `file.${ext}` : 'file.bin';
    return base;
  };

  // Normalize a generic URL or data for different item shapes into a { url, mediaType, filename }
  const buildFilePart = (u, mediaTypeHint, nameHint) => {
    if (!u) return null;
    let mediaType = mediaTypeHint || '';
    let filename = nameHint || '';
    if (isDataUrl(u)) {
      mediaType = mediaType || (u.split(';')[0].split(':')[1] || 'application/octet-stream');
      if (!filename) filename = `file.${inferExt(mediaType) || 'bin'}`;
    } else {
      if (!filename) filename = inferNameFromUrl(u, mediaType || '');
    }
    const part = { type: 'file', url: u };
    if (mediaType) part.mediaType = mediaType;
    if (filename) part.filename = filename;
    return part;
  };

  // 1) image_url (standard OpenAI schema)
  if (it.type === 'image_url') {
    const u = (it.image_url && (it.image_url.url || it.image_url)) || it.url;
    // Pass through remote URLs; include mediaType for data URLs
    return buildFilePart(u, '', '');
  }

  // 2) input_image (newer schema variant)
  if (it.type === 'input_image') {
    // Either data:URL in it.image_url.url or raw {data, format}
    const u1 = it.image_url && (it.image_url.url || it.image_url);
    if (u1) return buildFilePart(u1, '', '');
    const img = it.image || {};
    if (img.data) {
      const fmt = (img.format || 'png').toLowerCase();
      const mt = fmt.includes('/') ? fmt : `image/${fmt}`;
      const u = `data:${mt};base64,${img.data}`;
      return buildFilePart(u, mt, `image.${inferExt(mt) || fmt}`);
    }
  }

  // 3) Generic file by URL
  if (it.type === 'file_url' || it.type === 'file') {
    const fu = it.file_url || it.url || (it.file && (it.file.url || it.file));
    const mt = it.mediaType || (it.file && it.file.mediaType) || '';
    const name = it.filename || (it.file && it.file.name) || '';
    return buildFilePart(fu, mt, name);
  }

  // 4) Audio input (construct data URL if base64 provided)
  if (it.type === 'input_audio' || it.type === 'audio') {
    const au = it.audio || {};
    if (au.data) {
      const fmt = (au.format || 'mp3').toLowerCase();
      const mt = fmt.includes('/') ? fmt : `audio/${fmt}`;
      const u = `data:${mt};base64,${au.data}`;
      return buildFilePart(u, mt, `audio.${inferExt(mt) || fmt}`);
    }
    const u = it.audio_url && (it.audio_url.url || it.audio_url);
    if (u) return buildFilePart(u, '', '');
  }

  // 5) Video input (optional)
  if (it.type === 'input_video' || it.type === 'video') {
    const v = it.video || {};
    if (v.data) {
      const fmt = (v.format || 'mp4').toLowerCase();
      const mt = fmt.includes('/') ? fmt : `video/${fmt}`;
      const u = `data:${mt};base64,${v.data}`;
      return buildFilePart(u, mt, `video.${inferExt(mt) || fmt}`);
    }
    const u = it.video_url && (it.video_url.url || it.video_url);
    if (u) return buildFilePart(u, '', '');
  }

  return null;
}

function convertOpenAIMessageToSmithery(msg) {
  const role = msg && msg.role;
  if (role === 'system') return null;
  const parts = [];
  const c = msg && msg.content;

  if (typeof c === 'string') parts.push({
    type: 'text',
    text: c
  });
  else if (Array.isArray(c)) {
    for (const it of c) {
      const p = convertContentItemToPart(it);
      if (p) parts.push(p);
    }
  }

  if (role === 'tool') {
    parts.push({
      type: 'tool_result',
      toolCallId: msg.tool_call_id,
      toolName: msg.name || msg.tool_name,
      result: typeof c === 'string' ? c : JSON.stringify(c || '')
    });
  }

  return {
    id: randomUUID().replace(/-/g, '').slice(0, 16),
    role: role || 'user',
    parts
  };
}

function extractSystemPromptAndMessages(msgs) {
  const sp = [],
    out = [];
  const arr = Array.isArray(msgs) ? msgs : [];
  let i = 0;

  while (i < arr.length) {
    const m = arr[i];
    const role = m && m.role;

    if (role === 'system') {
      if (m.content) sp.push(m.content);
      i++;
      continue;
    }

    const tc = m && m.tool_calls;
    if (role === 'assistant' && Array.isArray(tc) && tc.length) {
      const pending = {};

      for (let idx = 0; idx < tc.length; idx++) {
        const t = tc[idx];
        if (!t || t.type !== 'function') continue;
        const fn = t.function || {};
        const name = fn.name;
        let as = typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments || {});
        let ao;

        try {
          ao = as ? JSON.parse(as) : {};
        } catch {
          ao = {};
        }

        const id = t.id || `call_${i}_${idx}`;
        pending[id] = {
          name,
          input: ao,
          out: ''
        };
      }

      let j = i + 1,
        cons = 0;

      while (j < arr.length && arr[j] && arr[j].role === 'tool') {
        const tm = arr[j];
        const id = tm.tool_call_id;

        if (pending[id]) {
          const piece = typeof tm.content === 'string' ? tm.content : JSON.stringify(tm.content || '');
          pending[id].out += (piece || '');
        }

        cons++;
        j++;
      }

      const parts = [{
        type: 'step-start'
      }];

      for (const [id, info] of Object.entries(pending)) {
        const name = info.name || '';
        const part = {
          type: name ? `tool-${name}` : 'tool-call',
          toolCallId: id
        };

        const outText = info.out || '';
        if (outText) {
          Object.assign(part, {
            state: 'output-available',
            input: info.input || {},
            output: {
              content: [{
                type: 'text',
                text: outText
              }]
            }
          });
        } else {
          Object.assign(part, {
            state: 'input-available',
            input: info.input || {}
          });
        }

        parts.push(part);
      }

      out.push({
        id: randomUUID().replace(/-/g, '').slice(0, 16),
        role: 'assistant',
        parts
      });

      i = i + 1 + cons;
      continue;
    }

    const conv = convertOpenAIMessageToSmithery(m);
    if (conv) out.push(conv);
    i++;
  }

  const systemPrompt = sp.length ? sp.join('\n\n') : 'You are a helpful assistant.';
  return {
    systemPrompt,
    messages: out
  };
}

function mapOpenAIToolsToSmithery(tools) {
  const r = [];
  if (!Array.isArray(tools)) return r;

  for (const t of tools) {
    if (!t || typeof t !== 'object') continue;
    if (t.type === 'function' && t.function && typeof t.function === 'object') {
      const fn = t.function;
      r.push({
        type: 'function',
        name: fn.name,
        description: fn.description || '',
        inputSchema: fn.parameters || {},
        parameters: fn.parameters || {}
      });
    } else r.push(t);
  }

  return r;
}

function openaiToSmithery(req) {
  const {
    systemPrompt,
    messages
  } = extractSystemPromptAndMessages(req.messages || []);

  const requested = req.model || 'claude-sonnet-4.5';
  let base = requested,
    inferred = null;

  for (const [s, l] of Object.entries(REASONING_SUFFIX_TO_LEVEL)) {
    if (requested.endsWith(s) && requested.length > s.length) {
      base = requested.slice(0, -s.length);
      inferred = l;
      break;
    }
  }

  const out = {
    messages,
    tools: mapOpenAIToolsToSmithery(req.tools),
    model: base,
    systemPrompt
  };

  if (req.reasoning_effort) out.reasoningEffort = req.reasoning_effort;
  else if (inferred) out.reasoningEffort = inferred;

  if (req.tool_choice !== undefined) out.toolChoice = req.tool_choice;

  return out;
}

module.exports = {
  REASONING_SUFFIX_TO_LEVEL,
  openaiToSmithery,
  extractSystemPromptAndMessages,
  mapOpenAIToolsToSmithery
};
