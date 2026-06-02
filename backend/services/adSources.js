/**
 * adSources
 * ---------
 * Unifies the two competitor-ad data sources behind one call, with fallback:
 *
 *   - 'api'    → RapidAPI ad-libraries endpoint (fast JSON; needs RAPIDAPI_KEY)
 *   - 'scrape' → live Playwright browser scrape of the public Ad Library
 *   - 'mock'   → synthetic demo data (always works offline)
 *   - 'auto'   → try API first (if configured), then scrape   [default]
 *
 * Fallback: if the chosen source errors OR returns zero ads, the next source in
 * the chain is tried. `mock` is only used as a last resort when USE_MOCK_SCRAPER
 * is true (so we never silently fabricate "real" data).
 */

'use strict';

const { searchViaApi, isConfigured } = require('./adLibraryApi');

// The Playwright scraper is loaded lazily: it pulls in the heavy `playwright`
// dependency and only runs in a real browser environment (local / a server with
// Chromium). On serverless platforms like Vercel it can't launch a browser, so
// we never want it required at cold start — only when the 'scrape'/'mock'
// source is actually invoked.
function loadScraper() {
  return require('../../playwright/scraper');
}

const runners = {
  api: (name, opts) => searchViaApi(name, opts),
  scrape: (name, opts) => loadScraper().searchCompetitorAds(name, opts),
  mock: (name) => Promise.resolve(loadScraper().mockAds(name)),
};

/** Build the ordered list of sources to attempt for a requested `source`. */
function buildChain(source) {
  const haveApi = isConfigured();
  const allowMock = process.env.USE_MOCK_SCRAPER === 'true';
  // Playwright can't launch a browser on serverless platforms (no Chromium
  // binary), so on Vercel we drop 'scrape' from every chain — it would only
  // ever throw and waste a fallback slot.
  const canScrape = !process.env.VERCEL;
  const scrape = canScrape ? 'scrape' : null;

  let chain;
  switch (source) {
    case 'api':
      chain = ['api', scrape];
      break;
    case 'scrape':
      chain = [scrape, haveApi ? 'api' : null];
      break;
    case 'mock':
      chain = ['mock'];
      break;
    case 'auto':
    default:
      chain = [haveApi ? 'api' : null, scrape];
  }
  if (allowMock) chain.push('mock');
  // de-dupe + drop nulls
  return [...new Set(chain.filter(Boolean))];
}

/**
 * Collect ads for one competitor, walking the fallback chain.
 * @returns {Promise<{ads: object[], used: string|null, attempts: object[]}>}
 */
async function collectForCompetitor(name, { source = 'auto', ...opts } = {}) {
  const chain = buildChain(source);
  const attempts = [];

  for (const src of chain) {
    try {
      const ads = await runners[src](name, opts);
      attempts.push({ source: src, count: ads.length });
      if (ads.length) return { ads, used: src, attempts };
    } catch (err) {
      attempts.push({ source: src, error: err.message });
    }
  }
  return { ads: [], used: null, attempts };
}

module.exports = { collectForCompetitor, buildChain };
