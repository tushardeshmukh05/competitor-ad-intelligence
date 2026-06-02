/**
 * Competitor Ad Intelligence — Express server
 * -------------------------------------------
 * Serves the JSON API and the static frontend (single index.html).
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const adsRoutes = require('./routes/ads');
const competitorsRoutes = require('./routes/competitors');
const analyzeRoutes = require('./routes/analyze');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ───────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── API routes ───────────────────────────────────────────
app.use('/api/ads', adsRoutes);
app.use('/api/competitors', competitorsRoutes);
app.use('/api/analyze', analyzeRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'competitor-ad-intelligence' });
});

// ── Static frontend ──────────────────────────────────────
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ── 404 + error handlers ─────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Only start a listening server when run directly (local dev / `npm start`).
// On Vercel the app is imported as a serverless function and must NOT listen.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  Competitor Ad Intelligence`);
    console.log(`  → API & UI:  http://localhost:${PORT}`);
    console.log(`  → Health:    http://localhost:${PORT}/api/health\n`);
  });
}

module.exports = app;
