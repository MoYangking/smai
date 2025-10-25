// Main Vercel serverless function for root routes
const serverModule = require('../src/server.js');

module.exports = async (req, res) => {
  try {
    return await serverModule(req, res);
  } catch (error) {
    console.error('[Vercel Error]', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'internal_server_error',
      message: 'Service temporarily unavailable'
    }));
  }
};