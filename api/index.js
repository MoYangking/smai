// Simplified Vercel serverless function
const path = require('path');
const fs = require('fs');

// Simple inline implementations to avoid module resolution issues
class SimpleCookieManager {
  constructor() {
    this.cookies = [];
    this.currentIndex = -1;
  }

  async getPoolStatus() {
    return {
      total: this.cookies.length,
      current: this.currentIndex >= 0 ? this.cookies[this.currentIndex] : null,
      currentIndex: this.currentIndex,
      cookies: this.cookies.map((cookie, index) => ({
        index,
        isCurrent: index === this.currentIndex,
        preview: cookie.length > 50 ? cookie.substring(0, 50) + '...' : cookie
      }))
    };
  }

  async addToPool(cookies) {
    const newCookies = Array.isArray(cookies) ? cookies : [cookies];
    for (const cookie of newCookies) {
      if (cookie && !this.cookies.includes(cookie)) {
        this.cookies.push(cookie);
      }
    }
    return this.cookies.length;
  }

  async rotate() {
    if (this.cookies.length === 0) {
      return { success: false, message: 'No cookies in pool' };
    }
    this.currentIndex = (this.currentIndex + 1) % this.cookies.length;
    return {
      success: true,
      cookie: this.cookies[this.currentIndex],
      index: this.currentIndex,
      total: this.cookies.length
    };
  }

  async random() {
    if (this.cookies.length === 0) {
      return { success: false, message: 'No cookies in pool' };
    }
    this.currentIndex = Math.floor(Math.random() * this.cookies.length);
    return {
      success: true,
      cookie: this.cookies[this.currentIndex],
      index: this.currentIndex,
      total: this.cookies.length
    };
  }

  async clear() {
    this.cookies = [];
    this.currentIndex = -1;
    return true;
  }
}

const cookieManager = new SimpleCookieManager();

// Basic models list
const MODELS_LIST = {
  object: 'list',
  data: [
    { id: 'claude-sonnet-4.5', object: 'model', owned_by: 'smithery' },
    { id: 'gpt-5', object: 'model', owned_by: 'smithery' },
    { id: 'claude-sonnet-4.5-minimal', object: 'model', owned_by: 'smithery' },
    { id: 'claude-sonnet-4.5-low', object: 'model', owned_by: 'smithery' },
    { id: 'claude-sonnet-4.5-medium', object: 'model', owned_by: 'smithery' },
    { id: 'claude-sonnet-4.5-high', object: 'model', owned_by: 'smithery' }
  ]
};

function sendJSON(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

module.exports = async (req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `https://${req.headers.host || 'vercel.app'}`);
  const path = url.pathname;
  const method = req.method;

  console.log(`[Vercel] ${method} ${path}`);

  try {
    // Root path - service info
    if (path === '/' && method === 'GET') {
      return sendJSON(res, {
        service: 'SMAI - Smithery API Proxy',
        version: '2.0.0',
        status: 'running',
        environment: 'vercel',
        endpoints: {
          openai: '/v1/chat/completions, /v1/models',
          admin: '/admin/cookies, /admin/cookie-pool',
          info: '/'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Admin page - simplified version
    if (path === '/admin' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>SMAI - Smithery API Proxy</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              line-height: 1.6;
              max-width: 900px;
              margin: 0 auto;
              padding: 20px;
              background: #0a0e1a;
              color: #e6edf3;
            }
            .card {
              background: linear-gradient(145deg, #0e1525, #0a0e1a);
              border: 1px solid #1b2a44;
              border-radius: 12px;
              padding: 24px;
              margin: 20px 0;
              box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            }
            h1 { color: #5b8cff; margin-top: 0; }
            h2 { color: #7aa6ff; border-bottom: 1px solid #1b2a44; padding-bottom: 8px; }
            .status { color: #2ecc71; }
            .error { color: #e74c3c; }
            .endpoint {
              background: #0f1729;
              padding: 12px;
              border-radius: 6px;
              margin: 8px 0;
              border-left: 3px solid #5b8cff;
            }
            code {
              background: #1e293b;
              padding: 2px 6px;
              border-radius: 4px;
              color: #5b8cff;
              font-family: 'SF Mono', Monaco, monospace;
            }
            button {
              background: #5b8cff;
              color: white;
              border: none;
              padding: 10px 16px;
              border-radius: 6px;
              cursor: pointer;
              margin: 4px;
            }
            button:hover { background: #4a7edd; }
            button.secondary { background: #64748b; }
            button.secondary:hover { background: #475569; }
            input[type="text"] {
              width: 100%;
              padding: 10px;
              border: 1px solid #2a3a56;
              background: #0f1729;
              color: #e6edf3;
              border-radius: 6px;
              margin: 8px 0;
            }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>🚀 SMAI - Smithery API Proxy</h1>
            <p class="status">✅ Service is running on Vercel</p>
            <p><strong>Version:</strong> 2.0.0</p>
            <p><strong>Environment:</strong> Vercel Serverless</p>
          </div>

          <div class="card">
            <h2>📡 Available Endpoints</h2>
            <h3>OpenAI Compatible API</h3>
            <div class="endpoint">
              <strong>POST</strong> <code>/v1/chat/completions</code>
              <p>Chat completions with streaming support</p>
            </div>
            <div class="endpoint">
              <strong>GET</strong> <code>/v1/models</code>
              <p>List available models including reasoning variants</p>
            </div>

            <h3>Cookie Management API</h3>
            <div class="endpoint">
              <strong>GET/POST</strong> <code>/admin/cookies</code>
              <p>Get or set current cookies</p>
            </div>
            <div class="endpoint">
              <strong>GET</strong> <code>/admin/cookie-pool</code>
              <p>Get cookie pool status</p>
            </div>
            <div class="endpoint">
              <strong>POST</strong> <code>/admin/cookie-pool/add</code>
              <p>Add cookies to pool</p>
            </div>
            <div class="endpoint">
              <strong>POST</strong> <code>/admin/cookie-pool/rotate</code>
              <p>Rotate to next cookie</p>
            </div>
          </div>

          <div class="card">
            <h2>🍪 Quick Cookie Pool Test</h2>
            <div class="grid">
              <div>
                <h3>Add Cookie</h3>
                <input type="text" id="newCookie" placeholder="Enter cookie string">
                <button onclick="addCookie()">Add to Pool</button>
                <button onclick="rotateCookie()" class="secondary">Rotate</button>
                <button onclick="randomCookie()" class="secondary">Random</button>
                <button onclick="clearPool()" class="secondary" style="background: #e74c3c;">Clear</button>
              </div>
              <div>
                <h3>Pool Status</h3>
                <pre id="poolStatus" style="background: #0f1729; padding: 12px; border-radius: 6px; overflow: auto;">Loading...</pre>
              </div>
            </div>
          </div>

          <div class="card">
            <h2>⚠️ Limitations</h2>
            <p class="error">Vercel deployment has some limitations:</p>
            <ul>
              <li>No persistent file storage (cookies reset on redeploy)</li>
              <li>Limited execution time (max 30 seconds)</li>
              <li>No real-time streaming support</li>
            </ul>
            <p>For full functionality, deploy locally or use Docker.</p>
          </div>

          <script>
            async function apiCall(method, path, body) {
              const options = { method };
              if (body) {
                options.headers = { 'Content-Type': 'application/json' };
                options.body = JSON.stringify(body);
              }
              const response = await fetch(path, options);
              return await response.json();
            }

            async function loadPoolStatus() {
              try {
                const status = await apiCall('GET', '/admin/cookie-pool');
                document.getElementById('poolStatus').textContent = JSON.stringify(status, null, 2);
              } catch (error) {
                document.getElementById('poolStatus').textContent = 'Error: ' + error.message;
              }
            }

            async function addCookie() {
              const input = document.getElementById('newCookie');
              const cookie = input.value.trim();
              if (!cookie) return;

              try {
                await apiCall('POST', '/admin/cookie-pool/add', { cookies: cookie });
                input.value = '';
                loadPoolStatus();
              } catch (error) {
                alert('Error adding cookie: ' + error.message);
              }
            }

            async function rotateCookie() {
              try {
                await apiCall('POST', '/admin/cookie-pool/rotate');
                loadPoolStatus();
              } catch (error) {
                alert('Error rotating: ' + error.message);
              }
            }

            async function randomCookie() {
              try {
                await apiCall('POST', '/admin/cookie-pool/random');
                loadPoolStatus();
              } catch (error) {
                alert('Error randomizing: ' + error.message);
              }
            }

            async function clearPool() {
              if (confirm('Clear all cookies?')) {
                try {
                  await apiCall('DELETE', '/admin/cookie-pool/clear');
                  loadPoolStatus();
                } catch (error) {
                  alert('Error clearing: ' + error.message);
                }
              }
            }

            // Load initial status
            loadPoolStatus();
            setInterval(loadPoolStatus, 5000);
          </script>
        </body>
        </html>
      `);
      return;
    }

    // Models endpoint
    if (path === '/v1/models' && method === 'GET') {
      return sendJSON(res, MODELS_LIST);
    }

    // Chat completions - simplified mock for testing
    if (path === '/v1/chat/completions' && method === 'POST') {
      const body = await readBody(req);

      if (!body.messages) {
        return sendJSON(res, { error: 'messages required' }, 400);
      }

      // Mock response for testing
      const mockResponse = {
        id: 'chatcmpl-' + Math.random().toString(36).substr(2, 9),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: body.model || 'claude-sonnet-4.5',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a mock response from SMAI running on Vercel. The actual Smithery API integration requires proper cookie configuration and is not fully functional in this demo environment.'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: 80
        }
      };

      return sendJSON(res, mockResponse);
    }

    // Cookie management endpoints
    if (path === '/admin/cookies' && method === 'GET') {
      return sendJSON(res, { cookies: 'demo-cookie-for-vercel' });
    }

    if (path === '/admin/cookies' && method === 'POST') {
      const body = await readBody(req);
      return sendJSON(res, { ok: true, cookies: body.cookies || '' });
    }

    // Cookie pool endpoints
    if (path === '/admin/cookie-pool' && method === 'GET') {
      const status = await cookieManager.getPoolStatus();
      return sendJSON(res, status);
    }

    if (path === '/admin/cookie-pool/add' && method === 'POST') {
      const body = await readBody(req);
      const count = await cookieManager.addToPool(body.cookies);
      return sendJSON(res, { ok: true, total: count });
    }

    if (path === '/admin/cookie-pool/rotate' && method === 'POST') {
      const result = await cookieManager.rotate();
      return sendJSON(res, result);
    }

    if (path === '/admin/cookie-pool/random' && method === 'POST') {
      const result = await cookieManager.random();
      return sendJSON(res, result);
    }

    if (path === '/admin/cookie-pool/clear' && method === 'DELETE') {
      await cookieManager.clear();
      return sendJSON(res, { ok: true });
    }

    // 404 for everything else
    return sendJSON(res, {
      error: 'not_found',
      path,
      method,
      available_endpoints: [
        'GET /',
        'GET /admin',
        'GET /v1/models',
        'POST /v1/chat/completions',
        'GET/POST /admin/cookies',
        'GET /admin/cookie-pool',
        'POST /admin/cookie-pool/add',
        'POST /admin/cookie-pool/rotate',
        'POST /admin/cookie-pool/random',
        'DELETE /admin/cookie-pool/clear'
      ],
      timestamp: new Date().toISOString()
    }, 404);

  } catch (error) {
    console.error('[Vercel Error]', error);

    if (!res.headersSent) {
      sendJSON(res, {
        error: 'internal_server_error',
        message: 'Service temporarily unavailable',
        details: error.message,
        timestamp: new Date().toISOString()
      }, 500);
    }
  }
};