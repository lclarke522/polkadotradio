const { request, sleep, safeParseJSON } = require('./http');
const fs = require('fs')

async function spotifyGet(apiPath, accessToken, maxRetries = 3) {
  let errorTxt = 'Spotify request failed after multiple retries.';
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await request({
      hostname: 'api.spotify.com',
      path: apiPath,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + accessToken },
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers['retry-after'] || '5', 10);
      console.log(`⏳ Spotify rate limit hit. Waiting ${retryAfter} second(s) before retry ${attempt}/${maxRetries}...`);
      await sleep((retryAfter + 1) * 1000); // +1 for safety
    errorTxt = 'Spotify rate limit persisted after multiple retries.'
      continue;
    }

  if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
    console.log(`⏳ Spotify temporary error ${res.status}. Retrying ${attempt}/${maxRetries}...`);
    await sleep(attempt * 2000);
    errorTxt = 'Spotify ' + res.status + ' error persisted after multiple retries.'
    continue;
  }

    const parsed = safeParseJSON(res, 'Spotify GET ' + apiPath);

    if (parsed.error) {
      throw new Error('Spotify API error ' + parsed.error.status + ': ' + parsed.error.message);
    }

    return parsed;
  }

  throw new Error(errorTxt);
}

async function spotifyPut(apiPath, body, accessToken, maxRetries = 3) {
  const postData = JSON.stringify(body);
  let errorTxt = 'Spotify request failed after multiple retries.';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await request({
    hostname: 'api.spotify.com',
    path: apiPath,
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
    }, postData);
    
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers['retry-after'] || '5', 10);
      console.log(`⏳ Spotify rate limit hit. Waiting ${retryAfter} second(s) before retry ${attempt}/${maxRetries}...`);
      await sleep((retryAfter + 1) * 1000); // +1 for safety
    errorTxt = 'Spotify rate limit persisted after multiple retries.'
     continue;
    }

  if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
    console.log(`⏳ Spotify temporary error ${res.status}. Retrying ${attempt}/${maxRetries}...`);
    await sleep(attempt * 2000);
    errorTxt = 'Spotify ' + res.status + ' error persisted after multiple retries.'
    continue;
  }
    
    const parsed = res.raw ? safeParseJSON(res, 'Spotify PUT ' + apiPath) : {};
      
    if (parsed.error) {
        throw new Error('Spotify API error ' + parsed.error.status + ': ' + parsed.error.message);
    }

    return { status: res.status, body: parsed };
  }
  
  throw new Error(errorTxt);
}

async function spotifyPost(apiPath, body, accessToken, maxRetries = 3) {
  const postData = JSON.stringify(body);
  let errorTxt = 'Spotify request failed after multiple retries.';
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await request({
      hostname: 'api.spotify.com',
      path: apiPath,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, postData);
    
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers['retry-after'] || '5', 10);
      console.log(`⏳ Spotify rate limit hit. Waiting ${retryAfter} second(s) before retry ${attempt}/${maxRetries}...`);
      await sleep((retryAfter + 1) * 1000); // +1 for safety
      errorTxt = 'Spotify rate limit persisted after multiple retries.';
      continue;
    }
    
  if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
    console.log(`⏳ Spotify temporary error ${res.status}. Retrying ${attempt}/${maxRetries}...`);
    await sleep(attempt * 2000);
    errorTxt = 'Spotify ' + res.status + ' error persisted after multiple retries.'
    continue;
  }
    
   const parsed = res.raw ? safeParseJSON(res, 'Spotify POST ' + apiPath) : {};
    
    if (parsed.error) {
        throw new Error('Spotify API error ' + parsed.error.status + ': ' + parsed.error.message);
    }

    return { status: res.status, body: parsed };
  }

  throw new Error(errorTxt);
}

// ─── Track matching ─────────────────────────────────────────────────────────

// Normalizes a string for loose comparison: strips diacritics, lowercases,
// spells out "&" as "and", drops bracket characters (keeping their contents),
// strips remaining punctuation, and collapses whitespace.
function normalizeForMatch(value) {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/^the\s+/, '')        // strip leading "The " — e.g. "The Ditty Bops" → "ditty bops"
    .replace(/,\s*the$/, '')       // strip trailing ", The" — e.g. "Ditty Bops, The" → "ditty bops"
    .replace(/&/g, ' and ')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[-–—_:;,.!?'"`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Given a list of Spotify track search results and a { name, artist } target,
// returns the item whose title AND full joined artist credit both match
// exactly after normalization. Artists are compared as a single joined
// string (Spotify's artist list joined with " & ") rather than split, since
// splitting on "," or "&" can't distinguish a multi-artist collab from a
// single artist whose own name contains that character (e.g. "10,000
// Maniacs", "Iron & Wine"). Returns undefined if no exact match is found.
function findExactMatch(items, track) {
  const expectedArtistKey = normalizeForMatch(track.artist);
  const expectedTitleKey = normalizeForMatch(track.name);

  return items.find(item => {
    const titleMatch = normalizeForMatch(item.name) === expectedTitleKey;
    if (!titleMatch) return false;

    const itemArtistKey = normalizeForMatch(item.artists.map(a => a.name).join(' & '));
    const fullMatch = itemArtistKey === expectedArtistKey;

    // Fallback: Last.fm's credit (as a whole) matches one of Spotify's
    // individual artists — covers cases where a source dropped a featured
    // artist Spotify still credits (e.g. "The Weeknd" vs. Spotify's
    // "The Weeknd, Daft Punk").
    const partialMatch = item.artists.some(a => normalizeForMatch(a.name) === expectedArtistKey);

    return fullMatch || partialMatch;
  });
}

// ─── Track search ───────────────────────────────────────────────────────────

// Searches Spotify for a track and returns the best exact match.
// Returns { uri, duration_ms } on a match, or null if no exact match was
// found (or nothing playable came back). Logs and exits the process on an
// invalid token (HTTP 401), since that's unrecoverable without re-running
// setup.js — deliberately not left to each caller to decide.
async function searchAndMatchTrack(track, accessToken) {
  const q = encodeURIComponent(`${track.name} ${track.artist}`);

  let data;
  try {
    data = await spotifyGet('/v1/search?q=' + q + '&type=track&limit=10', accessToken);
  } catch (err) {
    console.error('\n❌ Search error for "' + track.name + '": ' + err.message);
    if (err.message.includes('401')) {
      console.error('   Token is invalid. Run: node setup.js');
      process.exit(1);
    }
    return null;
  }

  const items = (data.tracks?.items ?? []).filter(item => item.is_playable !== false);

  const match = findExactMatch(items, track);

  if (!match) {
      const key = trackCacheKey(track);
      if (items.length > 0) {
        console.log('   ⚠️  No exact match for "' + track.name + '" by ' + track.artist +
          ' (closest: "' + items[0].name + '" by ' + items[0].artists.map(a => a.name).join(', ') + '); skipping.');
      } else {
        console.log('   ⚠️  No search results for "' + track.name + '" by ' + track.artist + '; skipping.');
      }
      console.log('      Override key: ' + key);
      return null;
    }
    return { uri: match.uri, duration_ms: match.duration_ms };
  }

// ─── Track resolution cache ───────────────────────────────────────────────────

function loadTrackCache(cacheFilePath) {
  if (!fs.existsSync(cacheFilePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
  } catch (err) {
    console.log('   ⚠️  Track cache file was unreadable, starting fresh.');
    return {};
  }
}

function saveTrackCache(cache, cacheFilePath) {
  fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
}

function trackCacheKey(track) {
  return normalizeForMatch(track.artist) + '|' + normalizeForMatch(track.name);
}

// Resolves a track to a Spotify URI, checking the cache first, then a
// manual overrides map (for tracks whose correct Spotify match doesn't
// surface within Spotify's search result limit, e.g. a live recording
// outranking the studio version), and falling back to searchAndMatchTrack
// on a miss. Mutates trackCache in place on a successful new resolution
// (caller is responsible for saving it). trackOverrides is loaded the same
// way as trackCache (see loadTrackCache) but is never written to by this
// function — it's a hand-curated file the caller loads and passes in.
// Returns { resolved, fromCache, fromOverride } where resolved is
// { uri, duration_ms } or null, fromCache indicates it came from the cache
// or overrides (i.e. no Spotify search was made), and fromOverride further
// distinguishes an overrides hit from a real cache hit.
async function resolveTrackWithCache(track, accessToken, trackCache, trackOverrides = {}) {
  const cacheKey = trackCacheKey(track);

  const cached = trackCache[cacheKey];
  if (cached) {
    return { resolved: cached, fromCache: true };
  }

  const override = trackOverrides[cacheKey];
  if (override) {
    return { resolved: override, fromCache: true, fromOverride: true };
  }

  const resolved = await searchAndMatchTrack(track, accessToken);
  if (resolved) {
    trackCache[cacheKey] = resolved;
  }
  await sleep(250);

  return { resolved, fromCache: false };
}

module.exports = {
  spotifyGet,
  spotifyPut,
  spotifyPost,
  normalizeForMatch,
  findExactMatch,
  searchAndMatchTrack,
  loadTrackCache,
  saveTrackCache,
  trackCacheKey,
  resolveTrackWithCache
};