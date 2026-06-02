/**
 * Routes: /api/ads
 *   GET /api/ads      -> all ads (scored + sorted)
 *   GET /api/ads/:id  -> single ad
 */

const express = require('express');
const router = express.Router();
const { getAllAds, getAdById } = require('../services/dataService');

// GET /api/ads
router.get('/', (req, res) => {
  res.json(getAllAds());
});

// GET /api/ads/:id
router.get('/:id', (req, res) => {
  const ad = getAdById(req.params.id);
  if (!ad) {
    return res.status(404).json({ error: `Ad ${req.params.id} not found` });
  }
  res.json(ad);
});

module.exports = router;
