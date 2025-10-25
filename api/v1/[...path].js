// Vercel serverless function for v1 routes
const serverModule = require('../../src/server.js');

module.exports = async (req, res) => {
  // Set the URL to include the v1 prefix for proper routing
  req.url = `/v1${req.url}`;
  return serverModule(req, res);
};