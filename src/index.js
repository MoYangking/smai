const express = require('express');
const path = require('path');
const fs = require('fs');
const { loadConfig } = require('./utils/logger');

const chatRoutes = require('./routes/chat');
const modelsRoutes = require('./routes/models');
const adminRoutes = require('./routes/admin');

const app = express();

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
// Basic CORS for API compatibility
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use('/static', express.static(path.resolve(process.cwd(), 'public')));

app.use(adminRoutes);
app.use(modelsRoutes);
app.use(chatRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

const cfg = loadConfig();
const port = Number(cfg.port) || 3000;
app.listen(port, () => {
  console.log(`smai-proxy listening on http://0.0.0.0:${port}`);
});
