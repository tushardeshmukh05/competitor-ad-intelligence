/**
 * Routes: /api/competitors
 *   POST /api/competitors/search
 *     body: { competitors: ["nike", "adidas"], source?: "auto"|"api"|"scrape"|"mock" }
 *
 * Behaviour:
 *   - Competitors already saved in ads.json are returned from there.
 *   - New competitors are collected live from a data source (RapidAPI and/or
 *     the Playwright scrape, with fallback — see services/adSources.js),
 *     normalized, scored, given an analysis, and persisted to ads.json.
 */

const express = require('express');
const router = express.Router();
const { searchByCompetitors, getAllAds, appendAds, adMatchesCompetitors } = require('../services/dataService');
const { collectForCompetitor } = require('../services/adSources');
const { computeScore } = require('../services/scoreService');
const { heuristicAnalysis } = require('../services/analysisService');

const VALID_SOURCES = ['auto', 'api', 'scrape', 'mock'];

/** Days a scraped ad has been running, derived from its start_date. */
function daysSince(dateStr) {
  const start = new Date(dateStr || Date.now());
  const diff = Math.floor((Date.now() - start.getTime()) / 86400000);
  return Math.max(diff, 1);
}

/** Convert a scraper record into the standard ad shape used by the API/UI.
 *  (id is intentionally omitted — assigned on save by appendAds.) */
function normalizeScraped(raw) {
  const ad = {
    competitor: raw.competitor_name,
    page_name: raw.page_name,
    headline: raw.headline,
    ad_copy: raw.ad_copy,
    cta: raw.cta,
    media_type: raw.media_type,
    country: raw.country,
    running_days: raw.running_days || daysSince(raw.start_date),
    start_date: raw.start_date,
    image_url: raw.image_url,
    video_url: raw.video_url,
    landing_page_url: raw.landing_page_url,
    _generated: true,
  };
  ad.score = computeScore(ad);
  ad.analysis = heuristicAnalysis(ad);
  return ad;
}

// POST /api/competitors/search
router.post('/search', async (req, res) => {
  const { competitors } = req.body || {};
  const source = VALID_SOURCES.includes(req.body?.source) ? req.body.source : 'auto';

  if (competitors !== undefined && !Array.isArray(competitors)) {
    return res
      .status(400)
      .json({ error: '`competitors` must be an array of names.' });
  }

  // No query => return everything from the local dataset.
  if (!Array.isArray(competitors) || competitors.length === 0) {
    const all = getAllAds();
    return res.json({ query: [], count: all.length, results: all, saved: 0 });
  }

  // 1) Existing (already-saved) matches.
  const existingMatches = searchByCompetitors(competitors);

  // 2) For competitors with NO saved ads, collect live from the chosen
  //    source (with fallback) and PERSIST to ads.json.
  const toSave = [];
  const sourcesUsed = {}; // competitor -> which source actually returned ads
  const attemptsLog = {}; // competitor -> per-source attempt trace
  for (const name of competitors) {
    const needle = String(name).trim().toLowerCase();
    if (!needle) continue;

    const alreadySaved = existingMatches.some((ad) =>
      `${ad.competitor} ${ad.page_name}`.toLowerCase().includes(needle)
    );
    if (alreadySaved) continue;

    try {
      const { ads, used, attempts } = await collectForCompetitor(name, { source });
      // Keyword search returns ads from any page mentioning the term; keep only
      // ads that actually belong to the searched brand so ads.json stays clean.
      ads
        .filter((raw) => adMatchesCompetitors(raw, [name]))
        .forEach((raw) => toSave.push(normalizeScraped(raw)));
      sourcesUsed[name] = used;
      attemptsLog[name] = attempts;
    } catch (err) {
      console.warn(`[competitors/search] collect failed for "${name}":`, err.message);
      attemptsLog[name] = [{ error: err.message }];
    }
  }

  const saved = appendAds(toSave); // writes to ads.json + assigns numeric ids

  // Re-query the persisted dataset so results carry stable ids + fresh scores.
  const results = searchByCompetitors(competitors);

  const payload = {
    query: competitors,
    requestedSource: source,
    sourcesUsed, // e.g. { nike: "api" } — what each new competitor came from
    attempts: attemptsLog,
    count: results.length,
    saved: saved.length,
    results,
  };

  // Help the user when nothing came back from any source.
  if (results.length === 0) {
    payload.note =
      'No ads returned. The API may be out of quota / the key invalid, Meta may have rate-limited the scrape, or the brand has no ads in the selected country. Try the other source, change SCRAPER_COUNTRY, or set USE_MOCK_SCRAPER=true for demo data.';
  }

  res.json(payload);
});

module.exports = router;
