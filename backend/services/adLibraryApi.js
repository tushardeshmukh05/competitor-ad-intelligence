/**
 * adLibraryApi
 * ------------
 * Second data source: the RapidAPI "ad-libraries" Meta Ad Library endpoint.
 *
 *   GET https://ad-libraries.p.rapidapi.com/meta/search/ads
 *       ?query=<brand>&country_code=US&media_types=all&platform=ALL
 *       &active_status=all&ad_type=all&search_type=keyword_unordered
 *   headers: x-rapidapi-key, x-rapidapi-host
 *
 * The response wraps the SAME Meta `snapshot` structure the scraper sees
 * (results[].snapshot{…}), so we reuse the shared adMapper to normalize it.
 *
 * Pros vs scraping: no browser, fast (~1-3s), stable JSON, paginated.
 * Cons: needs a RapidAPI key (paid/quota), depends on a 3rd-party proxy.
 *
 * Config (env): RAPIDAPI_KEY, RAPIDAPI_HOST, SCRAPER_COUNTRY, SCRAPER_MAX_ADS,
 *               SCRAPER_ACTIVE_STATUS
 */

'use strict';

const { walkForAds, stripInternal } = require('./adMapper');

const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'ad-libraries.p.rapidapi.com';
const MAX_ADS = Number(process.env.SCRAPER_MAX_ADS || 24);
const MAX_PAGES = 5; // safety cap on continuation-token pagination

function isConfigured() {
  return !!process.env.RAPIDAPI_KEY;
}

function buildUrl(name, country, continuationToken) {
  const params = new URLSearchParams({
    query: name,
    country_code: country,
    media_types: 'all',
    platform: 'ALL',
    active_status: process.env.SCRAPER_ACTIVE_STATUS || 'all',
    ad_type: 'all',
    search_type: 'keyword_unordered',
  });
  if (continuationToken) params.set('continuation_token', continuationToken);
  return `https://${RAPIDAPI_HOST}/meta/search/ads?${params.toString()}`;
}

/**
 * Collect ads for a single competitor via the RapidAPI source.
 * @param {string} name
 * @param {{country?:string,maxAds?:number}} [opts]
 * @returns {Promise<object[]>}
 */
async function searchViaApi(name, opts = {}) {
  if (!name) return [];
  if (!isConfigured()) {
    throw new Error('RAPIDAPI_KEY is not set (add it to .env to use the API source).');
  }

  const country = opts.country || process.env.SCRAPER_COUNTRY || 'US';
  const maxAds = opts.maxAds || MAX_ADS;
  const headers = {
    'x-rapidapi-key': process.env.RAPIDAPI_KEY,
    'x-rapidapi-host': RAPIDAPI_HOST,
    'Content-Type': 'application/json',
  };

  const collected = [];
  const seen = new Set();
  let token = null;

  for (let pageNum = 0; pageNum < MAX_PAGES && collected.length < maxAds; pageNum++) {
    const res = await fetch(buildUrl(name, country, token), { headers });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`RapidAPI ${res.status} ${res.statusText} ${detail.slice(0, 120)}`);
    }
    const json = await res.json();

    const before = collected.length;
    walkForAds(json, country, collected, seen); // finds every results[].snapshot

    token = json.continuation_token || null;
    const complete = json.is_result_complete === true;
    if (process.env.SCRAPER_DEBUG === 'true') {
      console.error(
        `[api] page ${pageNum + 1}: +${collected.length - before} ads (total ${collected.length}), more=${!!token && !complete}`
      );
    }
    if (!token || complete || collected.length === before) break;
  }

  return collected.slice(0, maxAds).map(stripInternal);
}

module.exports = { searchViaApi, isConfigured };
