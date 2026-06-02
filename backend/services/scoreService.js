/**
 * scoreService
 * ------------
 * Performance score for an ad.
 *
 *   score = running_days * format_weight * country_weight
 *
 * Higher score => stronger / longer-running creative worth studying.
 */

const FORMAT_WEIGHTS = {
  video: 1.5,
  carousel: 1.3,
  image: 1.0,
};

// Country weighting reflects approximate market value / CPM.
// Anything not listed falls back to DEFAULT_COUNTRY_WEIGHT.
const COUNTRY_WEIGHTS = {
  US: 1.3,
  UK: 1.2,
  DE: 1.15,
  FR: 1.15,
  CA: 1.1,
  AU: 1.1,
  IN: 1.0,
  BR: 1.0,
};

const DEFAULT_COUNTRY_WEIGHT = 1.0;

function getFormatWeight(mediaType) {
  return FORMAT_WEIGHTS[(mediaType || '').toLowerCase()] || 1.0;
}

function getCountryWeight(country) {
  return COUNTRY_WEIGHTS[(country || '').toUpperCase()] ?? DEFAULT_COUNTRY_WEIGHT;
}

/**
 * Compute the performance score for a single ad.
 * @param {object} ad
 * @returns {number} rounded score
 */
function computeScore(ad) {
  const runningDays = Number(ad.running_days) || 0;
  const score = runningDays * getFormatWeight(ad.media_type) * getCountryWeight(ad.country);
  return Math.round(score);
}

/**
 * Return a new array with `score` (re)computed for every ad and
 * sorted by score descending.
 * @param {object[]} ads
 * @returns {object[]}
 */
function scoreAndSort(ads) {
  return ads
    .map((ad) => ({ ...ad, score: computeScore(ad) }))
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  FORMAT_WEIGHTS,
  COUNTRY_WEIGHTS,
  computeScore,
  scoreAndSort,
  getFormatWeight,
  getCountryWeight,
};
