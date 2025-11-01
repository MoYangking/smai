function encodeSSE(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function parseSSEStream(readable, onEvent) {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let eventDataLines = [];

  const flushEvent = () => {
    if (eventDataLines.length === 0) return;
    const dataStr = eventDataLines.join('\n');
    eventDataLines = [];
    if (dataStr === '[DONE]') { onEvent({ __done__: true }); return; }
    try { onEvent(JSON.parse(dataStr)); } catch {}
  };

  return (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          let line = buf.slice(0, idx); buf = buf.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line === '') { flushEvent(); continue; }
          if (line.startsWith(':')) { continue; }
          if (line.startsWith('data:')) {
            const dataStr = line.slice(5).replace(/^\s/, '');
            eventDataLines.push(dataStr);
          }
        }
      }
      if (buf.length) {
        let line = buf; if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith('data:')) {
          const dataStr = line.slice(5).replace(/^\s/, '');
          eventDataLines.push(dataStr);
        }
      }
      flushEvent();
    } catch (e) {
      onEvent({ __done__: true, __error__: 'upstream_ended_prematurely' });
    } finally {
      try { reader.releaseLock(); } catch {}
    }
  })();
}

module.exports = { encodeSSE, parseSSEStream };

