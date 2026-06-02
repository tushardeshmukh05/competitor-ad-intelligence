/**
 * adMapper
 * --------
 * Shared logic for turning Meta Ad Library data into our normalized ad shape.
 *
 * Both data sources feed through here:
 *   - the Playwright scraper (intercepted GraphQL JSON), and
 *   - the RapidAPI "ad-libraries" client (JSON REST response).
 *
 * Both return the same Meta `snapshot` structure, so one mapper serves both.
 *
 * Normalized ad fields:
 *   competitor_name, page_name, ad_copy, headline, cta, media_type,
 *   image_url, video_url, start_date, running_days, country, landing_page_url
 */

'use strict';

// ── JSON / text helpers ──────────────────────────────────

/**
 * Meta GraphQL payloads may be a single JSON object, several newline-delimited
 * JSON objects (streamed), and/or prefixed with `for (;;);`. Parse defensively.
 */
function parseMetaJson(text) {
  if (!text) return [];
  const out = [];
  const cleaned = String(text).replace(/^for\s*\(;;\);/, '').trim();

  try {
    out.push(JSON.parse(cleaned));
    return out;
  } catch (_) {
    /* fall through to line-delimited */
  }

  for (const line of cleaned.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      out.push(JSON.parse(t));
    } catch (_) {
      /* ignore partial chunks */
    }
  }
  return out;
}

/** Coerce Meta "body"/text fields (string | {text} | {markup:{__html}}) to text. */
function textOf(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v.text === 'string') return v.text;
  if (v.markup && typeof v.markup.__html === 'string') {
    return v.markup.__html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

function epochToDate(epoch) {
  if (!epoch) return '';
  let ms = Number(epoch);
  if (!ms) return '';
  if (ms < 1e12) ms *= 1000; // seconds -> ms
  return new Date(ms).toISOString().slice(0, 10);
}

function daysBetween(dateStr) {
  if (!dateStr) return 1;
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  return Math.max(diff, 1);
}

// ── Dynamic / catalog ad placeholder handling ────────────
// Advantage+ & catalog ads embed Mustache tokens like {{product.name}} — the
// real value is filled per-viewer at serve time and usually isn't in the data.
const TEMPLATE_RE = /\{\{\s*[\w.]+\s*\}\}/;

function isTemplated(s) {
  return typeof s === 'string' && TEMPLATE_RE.test(s);
}

/** A bare URL / display link like "nike.com" or "https://…" (not real ad text). */
function isUrlish(s) {
  const t = (s || '').trim();
  return /^https?:\/\//i.test(t) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t);
}

/** First candidate that is real text: non-empty, not a {{token}}, not a URL. */
function pickClean(...candidates) {
  for (const c of candidates) {
    const t = (c || '').trim();
    if (t && !isTemplated(t) && !isUrlish(t)) return t;
  }
  return '';
}

/** Turn "{{product.name}}" into a readable "[Product Name]" as a last resort. */
function humanizeTemplate(s) {
  if (!s) return '';
  return s
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      const leaf = key.split('.').pop().replace(/_/g, ' ');
      return '[' + leaf.replace(/\b\w/g, (m) => m.toUpperCase()) + ']';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Snapshot mapping ─────────────────────────────────────

/** Map a Meta ad "snapshot" (+ its node) into our normalized ad shape. */
function mapSnapshot(snapshot, node, country) {
  const cards = Array.isArray(snapshot.cards) ? snapshot.cards : [];
  const images = Array.isArray(snapshot.images) ? snapshot.images : [];
  const videos = Array.isArray(snapshot.videos) ? snapshot.videos : [];

  const videoUrl =
    videos[0]?.video_hd_url ||
    videos[0]?.video_sd_url ||
    cards.find((c) => c.video_hd_url || c.video_sd_url)?.video_hd_url ||
    '';

  const imageUrl =
    images[0]?.original_image_url ||
    images[0]?.resized_image_url ||
    cards[0]?.original_image_url ||
    cards[0]?.resized_image_url ||
    videos[0]?.video_preview_image_url ||
    '';

  let mediaType = 'image';
  if (videoUrl) mediaType = 'video';
  else if (cards.length > 1) mediaType = 'carousel';
  // Meta also tells us directly via display_format (VIDEO|IMAGE|DCO|DPA|CAROUSEL)
  const df = (snapshot.display_format || '').toUpperCase();
  if (df === 'VIDEO') mediaType = 'video';
  else if (df === 'CAROUSEL') mediaType = 'carousel';

  const startDate = epochToDate(node?.start_date || snapshot.creation_time);
  const brand = snapshot.page_name || snapshot.current_page_name || node?.page_name || '';

  const rawTitle = snapshot.title || cards[0]?.title || '';
  const rawBody = textOf(snapshot.body) || textOf(cards[0]?.body) || '';

  // Prefer real text; for dynamic catalog ads fall back to the brand name (for
  // the headline) so the UI never shows {{product.name}}. `caption` is excluded
  // from the headline because it's usually the display URL (e.g. "nike.com").
  const headline =
    pickClean(rawTitle, snapshot.link_description, cards[0]?.title, cards[0]?.link_description) ||
    brand ||
    humanizeTemplate(rawTitle);

  const ad_copy = pickClean(rawBody, snapshot.link_description, snapshot.caption);

  const templated = isTemplated(rawTitle) || isTemplated(rawBody);

  const ad = {
    competitor_name: brand,
    page_name: brand,
    headline,
    ad_copy,
    cta: snapshot.cta_text || cards[0]?.cta_text || '',
    media_type: mediaType,
    image_url: imageUrl,
    video_url: videoUrl,
    start_date: startDate,
    running_days: daysBetween(startDate),
    country: snapshot.country_iso_code || country || '',
    landing_page_url: snapshot.link_url || cards[0]?.link_url || '',
    _ad_archive_id: node?.ad_archive_id || snapshot.ad_archive_id || '',
    _templated: templated, // true => dynamic/catalog ad with {{tokens}}
    _source: 'meta-ad-library',
  };

  if (process.env.SCRAPER_DEBUG === 'true') {
    ad._raw = {
      title: rawTitle,
      body: rawBody,
      caption: snapshot.caption,
      link_description: snapshot.link_description,
    };
    ad._snapshot = snapshot;
  }

  return ad;
}

/**
 * Recursively walk an arbitrary GraphQL / REST object, collecting every ad
 * snapshot found. Resilient to Meta (or the API) reshuffling the response tree.
 * @returns {object[]} the same `sink` array, for convenience.
 */
function walkForAds(obj, country, sink = [], seen = new Set(), depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 14) return sink;

  if (obj.snapshot && typeof obj.snapshot === 'object') {
    const ad = mapSnapshot(obj.snapshot, obj, country);
    const key = ad._ad_archive_id || `${ad.page_name}|${ad.headline}|${ad.ad_copy}`;
    if ((ad.headline || ad.ad_copy || ad.image_url || ad.video_url) && !seen.has(key)) {
      seen.add(key);
      sink.push(ad);
    }
  }

  if (Array.isArray(obj)) {
    for (const item of obj) walkForAds(item, country, sink, seen, depth + 1);
  } else {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v && typeof v === 'object') walkForAds(v, country, sink, seen, depth + 1);
    }
  }
  return sink;
}

/** Remove debug-only fields so they never reach the API / ads.json. */
function stripInternal(ad) {
  const { _raw, _snapshot, ...rest } = ad;
  return rest;
}

module.exports = {
  parseMetaJson,
  textOf,
  epochToDate,
  daysBetween,
  isTemplated,
  isUrlish,
  pickClean,
  humanizeTemplate,
  mapSnapshot,
  walkForAds,
  stripInternal,
};
