// Vercel serverless function for admin routes
const serverModule = require('../../src/server.js');

module.exports = async (req, res) => {
  // Set the URL to include the admin prefix for proper routing
  req.url = `/admin${req.url}`;
  return serverModule(req, res);
};