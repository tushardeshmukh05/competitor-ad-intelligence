/**
 * Playwright scraper — Meta / Facebook Ad Library  (REAL collection)
 * =================================================================
 *
 *  The Meta Ad Library (https://www.facebook.com/ads/library) is Meta's
 *  PUBLIC ad-transparency tool — no login is required to view it. This
 *  module drives a real Chromium browser to collect live competitor ads.
 *
 *  ⚠️  LEGAL: automated access technically violates Meta's Terms of Service,
 *  and Meta changes the page/GraphQL shape frequently. For production prefer
 *  the official Meta Ad Library API (or the RapidAPI source — see
 *  backend/services/adLibraryApi.js). Be polite: low concurrency + delays.
 *
 *  HOW IT WORKS
 *   Rather than parsing Meta's obfuscated HTML, we intercept the GraphQL JSON
 *   responses the page fetches and walk them for ad "snapshot" objects (shared
 *   mapping lives in backend/services/adMapper.js). This yields real creative
 *   fields incl. real image_url / video_url from Meta's CDN.
 *
 *  Public API:
 *    searchCompetitorAds(name, opts) -> Promise<Ad[]>
 *    collectAds(names, opts)         -> Promise<Ad[]>
 *
 *  Config (env): USE_MOCK_SCRAPER, SCRAPER_HEADLESS, SCRAPER_COUNTRY,
 *                SCRAPER_ACTIVE_STATUS, SCRAPER_MAX_ADS, SCRAPER_SCROLLS,
 *                SCRAPER_DEBUG
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { parseMetaJson, walkForAds, stripInternal } = require('../backend/services/adMapper');

const HEADLESS = process.env.SCRAPER_HEADLESS !== 'false';
const DEFAULT_COUNTRY = process.env.SCRAPER_COUNTRY || 'US';
const MAX_ADS = Number(process.env.SCRAPER_MAX_ADS || 24);
const MAX_SCROLLS = Number(process.env.SCRAPER_SCROLLS || 6);

const AD_LIBRARY_BASE = 'https://www.facebook.com/ads/library/';

// ═════════════════════════════════════════════════════════
//  Real scraper
// ═════════════════════════════════════════════════════════

function buildSearchUrl(name, country) {
  const params = new URLSearchParams({
    active_status: process.env.SCRAPER_ACTIVE_STATUS || 'all', // all | active | inactive
    ad_type: 'all',
    country,
    q: name,
    search_type: 'keyword_unordered',
    media_type: 'all',
  });
  return `${AD_LIBRARY_BASE}?${params.toString()}`;
}

async function autoScroll(page, times) {
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => window.scrollBy(0, 3000));
    await page.waitForTimeout(2500); // polite; lets lazy-loaded results fetch
  }
}

async function scrapeWithPlaywright(name, opts = {}) {
  const { chromium } = require('playwright');
  const country = opts.country || DEFAULT_COUNTRY;
  const maxAds = opts.maxAds || MAX_ADS;
  const scrolls = opts.scrolls || MAX_SCROLLS;

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1366, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const collected = [];
  const seen = new Set();
  const DEBUG = process.env.SCRAPER_DEBUG === 'true';
  let gqlSeen = 0;
  let gqlParsed = 0;

  // Intercept every GraphQL response and mine it for ad snapshots.
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/api/graphql') && !url.includes('graphql')) return;
    gqlSeen++;
    try {
      const body = await res.text();
      const docs = parseMetaJson(body);
      gqlParsed += docs.length;
      const before = collected.length;
      for (const json of docs) walkForAds(json, country, collected, seen);
      if (DEBUG && collected.length > before) {
        console.error(`[scraper] +${collected.length - before} ads from ${body.length}B response`);
      }
    } catch (err) {
      if (DEBUG) console.error('[scraper] response read error:', err.message);
    }
  });

  try {
    // `networkidle` lets the SPA settle so its GraphQL search request fires.
    await page
      .goto(buildSearchUrl(name, country), { waitUntil: 'networkidle', timeout: 60000 })
      .catch((e) => console.warn('[scraper] goto:', e.message));

    // Dismiss cookie / consent dialog if present (best-effort, multi-locale).
    for (const label of ['Allow all cookies', 'Allow all', 'Accept all', 'Only allow essential cookies']) {
      const btn = page.getByRole('button', { name: label }).first();
      if (await btn.count().catch(() => 0)) {
        await btn.click({ timeout: 2000 }).catch(() => {});
        break;
      }
    }

    await page.waitForTimeout(5000); // initial results fetch
    for (let i = 0; i < scrolls && collected.length < maxAds; i++) {
      await autoScroll(page, 1); // each scroll lazy-loads the next page of ads
    }
    await page.waitForTimeout(1500);
  } catch (err) {
    console.warn(`[scraper] navigation/scrape issue for "${name}":`, err.message);
  } finally {
    if (DEBUG) {
      console.error(`[scraper] graphql responses seen=${gqlSeen} parsedDocs=${gqlParsed} adsCollected=${collected.length}`);
      dumpDebug(name, collected);
    }
    await browser.close();
  }

  // Stamp the searched brand + trim to the cap. Strip debug-only fields.
  return collected.slice(0, maxAds).map((ad) => ({
    ...stripInternal(ad),
    competitor_name: ad.competitor_name || titleCase(name),
  }));
}

/**
 * DEBUG: write the full raw scrape (incl. raw text + snapshot) to a JSON file
 * and print a compact per-ad table so you can inspect exactly what Meta returned
 * and which keys hold real vs templated ({{product.name}}) values.
 */
function dumpDebug(name, ads) {
  const file = path.join(__dirname, `last-scrape.${String(name).toLowerCase().replace(/\s+/g, '-')}.json`);
  try {
    fs.writeFileSync(file, JSON.stringify(ads, null, 2) + '\n', 'utf-8');
    console.error(`[scraper] raw dump -> ${file}`);
  } catch (e) {
    console.error('[scraper] dump failed:', e.message);
  }
  console.error(`\n[scraper] ${ads.length} ads for "${name}" (raw title -> chosen headline):`);
  ads.forEach((a, i) => {
    const flag = a._templated ? ' ⟨templated⟩' : '';
    const raw = (a._raw && a._raw.title) || '(none)';
    console.error(`  ${String(i + 1).padStart(2)}. [${a.media_type}]${flag} "${raw}"  ->  "${a.headline}"`);
  });
  console.error('');
}

// ═════════════════════════════════════════════════════════
//  Mock fallback (USE_MOCK_SCRAPER=true)
// ═════════════════════════════════════════════════════════

const MOCK_TEMPLATES = [
  { headline: 'Limited Time Drop', ad_copy: 'New season styles just landed.', cta: 'Shop Now', media_type: 'video', country: 'US', running_days: 145 },
  { headline: 'Built For Performance', ad_copy: 'Engineered to help you go further.', cta: 'Learn More', media_type: 'carousel', country: 'UK', running_days: 98 },
  { headline: 'Members Save More', ad_copy: 'Join free and unlock 15% off.', cta: 'Sign Up', media_type: 'image', country: 'CA', running_days: 60 },
];

function titleCase(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function startDateFor(runningDays) {
  return new Date(Date.now() - runningDays * 86400000).toISOString().slice(0, 10);
}

function mockAds(name) {
  const brand = titleCase(name);
  const slug = brand.toLowerCase().replace(/\s+/g, '-');
  return MOCK_TEMPLATES.map((t) => ({
    competitor_name: brand,
    page_name: `${brand} Official`,
    headline: t.headline,
    ad_copy: t.ad_copy,
    cta: t.cta,
    media_type: t.media_type,
    image_url: `https://placehold.co/400x250/1E293B/3B82F6?text=${encodeURIComponent(brand)}`,
    video_url: t.media_type === 'video' ? `https://placehold.co/400x250/1E293B/3B82F6?text=${encodeURIComponent(brand + ' Video')}` : '',
    start_date: startDateFor(t.running_days),
    running_days: t.running_days,
    country: t.country,
    landing_page_url: `https://www.${slug}.com`,
    _source: 'mock',
  }));
}

// ═════════════════════════════════════════════════════════
//  Public API
// ═════════════════════════════════════════════════════════

/**
 * Collect ads for a single competitor via the live scraper (or mock).
 * @param {string} name
 * @param {{country?:string,maxAds?:number,scrolls?:number}} [opts]
 * @returns {Promise<object[]>}
 */
async function searchCompetitorAds(name, opts = {}) {
  if (!name) return [];
  if (process.env.USE_MOCK_SCRAPER === 'true') return mockAds(name);
  return scrapeWithPlaywright(name, opts);
}

/** Collect ads for many competitors (sequential — be polite to Meta). */
async function collectAds(names = [], opts = {}) {
  const list = Array.isArray(names) ? names : [names];
  const all = [];
  for (const n of list) {
    all.push(...(await searchCompetitorAds(n, opts)));
  }
  return all;
}

module.exports = { searchCompetitorAds, collectAds, mockAds };

// CLI: `node playwright/scraper.js nike` or `... --mock nike`
if (require.main === module) {
  const args = process.argv.slice(2).filter((a) => a !== '--mock');
  if (process.argv.includes('--mock')) process.env.USE_MOCK_SCRAPER = 'true';
  const targets = args.length ? args : ['Nike'];
  collectAds(targets)
    .then((ads) => {
      console.log(JSON.stringify(ads, null, 2));
      console.log(`\nCollected ${ads.length} ads for: ${targets.join(', ')}`);
    })
    .catch((err) => {
      console.error('Scrape failed:', err);
      process.exit(1);
    });
}
