/**
 * Routes: /api/dashboard
 *   GET /api/dashboard -> aggregated metrics for the dashboard
 */

const express = require('express');
const router = express.Router();
const { buildDashboard } = require('../services/dashboardService');

// GET /api/dashboard
router.get('/', (req, res) => {
  res.json(buildDashboard());
});

module.exports = router;
