/**
 * Routes: /api/analyze
 *   POST /api/analyze/:id  -> AI creative breakdown for one ad
 */

const express = require('express');
const router = express.Router();
const { getAdById } = require('../services/dataService');
const { analyzeAd } = require('../services/analysisService');

// POST /api/analyze/:id
//   For dataset ads, the ad is loaded by id.
//   For generated ("new" competitor) ads that aren't persisted, the client
//   sends the ad object in the body as a fallback.
router.post('/:id', async (req, res) => {
  let ad = getAdById(req.params.id);
  if (!ad && req.body && req.body.ad && req.body.ad.headline) {
    ad = req.body.ad;
  }
  if (!ad) {
    return res.status(404).json({ error: `Ad ${req.params.id} not found` });
  }

  try {
    const analysis = await analyzeAd(ad);
    res.json({ id: ad.id, competitor: ad.competitor, analysis });
  } catch (err) {
    console.error('[analyze] failed:', err.message);
    res.status(500).json({ error: 'Analysis failed', detail: err.message });
  }
});

module.exports = router;
