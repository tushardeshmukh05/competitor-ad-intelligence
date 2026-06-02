/**
 * dataService
 * -----------
 * Single source of truth for reading ads from the local JSON store.
 * Swapping this file for a real database layer later keeps the routes
 * untouched (they only depend on these functions).
 */

const fs = require('fs');
const path = require('path');
const { scoreAndSort, computeScore } = require('./scoreService');

const ADS_PATH = path.join(__dirname, '..', 'data', 'ads.json');

/** Read + parse the raw ads.json file. */
function readRawAds() {
  try {
    const raw = fs.readFileSync(ADS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[dataService] Failed to read ads.json:', err.message);
    return [];
  }
}

/** Write the full ads array back to ads.json. */
function writeRawAds(ads) {
  fs.writeFileSync(ADS_PATH, JSON.stringify(ads, null, 2) + '\n', 'utf-8');
}

/**
 * Append new ads to ads.json, assigning sequential numeric ids.
 * @param {object[]} newAds  ads without ids (id is assigned here)
 * @returns {object[]} the saved ads (with their new numeric ids)
 */
function appendAds(newAds = []) {
  if (!Array.isArray(newAds) || newAds.length === 0) return [];

  const existing = readRawAds();
  let nextId =
    existing.reduce((max, a) => Math.max(max, Number(a.id) || 0), 0) + 1;

  const saved = newAds.map((ad) => ({ ...ad, id: nextId++ }));
  writeRawAds([...existing, ...saved]);
  return saved;
}

/** All ads, with freshly computed score, sorted by score desc. */
function getAllAds() {
  return scoreAndSort(readRawAds());
}

/** A single ad by id (number or numeric string), or null. */
function getAdById(id) {
  const numId = Number(id);
  const ad = readRawAds().find((a) => Number(a.id) === numId);
  if (!ad) return null;
  return { ...ad, score: computeScore(ad) };
}

/** Lowercase + strip non-alphanumerics so "redbull" matches "Red Bull". */
function normalizeName(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** True if an ad belongs to one of the given competitor names (loose match). */
function adMatchesCompetitors(ad, competitors = []) {
  const hay = normalizeName(`${ad.competitor || ad.competitor_name || ''} ${ad.page_name || ''}`);
  return competitors
    .filter(Boolean)
    .map(normalizeName)
    .some((n) => n && hay.includes(n));
}

/**
 * Filter ads by a list of competitor names (case-insensitive, loose match).
 * Empty / missing list returns all ads.
 */
function searchByCompetitors(competitors = []) {
  const all = getAllAds();
  if (!Array.isArray(competitors) || competitors.length === 0) return all;
  return all.filter((ad) => adMatchesCompetitors(ad, competitors));
}

module.exports = {
  ADS_PATH,
  getAllAds,
  getAdById,
  searchByCompetitors,
  adMatchesCompetitors,
  appendAds,
};
