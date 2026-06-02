/**
 * dashboardService
 * ----------------
 * Aggregates the ad dataset into the metrics consumed by the dashboard.
 */

const { getAllAds } = require('./dataService');

function countBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (key == null || key === '') continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function topEntries(map, limit = 5) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function buildDashboard() {
  const ads = getAllAds(); // already sorted by score desc

  const topCompetitors = topEntries(countBy(ads, (a) => a.competitor));
  const topFormats = topEntries(countBy(ads, (a) => a.media_type));
  const topCTAs = topEntries(countBy(ads, (a) => a.cta));

  const longestRunningAds = [...ads]
    .sort((a, b) => (b.running_days || 0) - (a.running_days || 0))
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      competitor: a.competitor,
      headline: a.headline,
      running_days: a.running_days,
      score: a.score,
    }));

  return {
    totalAds: ads.length,
    topCompetitors,
    topFormats,
    topCTAs,
    longestRunningAds,
  };
}

module.exports = { buildDashboard };
