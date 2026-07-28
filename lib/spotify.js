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
    .replace(/&/g, ' and ')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[-–—_:;,.!?'"`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Given a list of Spotify track search results and a { name, artist } target,
// returns the item whose title AND at least one artist both match exactly
// after normalization. Returns undefined if no exact match is found.
function findExactMatch(items, track) {
  const expectedArtists = track.artist.split(',').map(a => normalizeForMatch(a.trim()));
  const expectedTitleKey = normalizeForMatch(track.name);

  return items.find(item => {
    const artistMatch = item.artists.some(a =>
        expectedArtists.includes(normalizeForMatch(a.name))
      );
    const titleMatch = normalizeForMatch(item.name) === expectedTitleKey;
    return artistMatch && titleMatch;
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
    data = await spotifyGet('/v1/search?q=' + q + '&type=track&limit=5', accessToken);
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
    if (items.length > 0) {
      console.log('   ⚠️  No exact match for "' + track.name + '" by ' + track.artist +
        ' (closest: "' + items[0].name + '" by ' + items[0].artists.map(a => a.name).join(', ') + '); skipping.');
    }
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

// Resolves a track to a Spotify URI, checking the cache first and falling
// back to searchAndMatchTrack on a miss. Mutates trackCache in place on a
// successful new resolution (caller is responsible for saving it).
// Returns { resolved, fromCache } where resolved is { uri, duration_ms } or
// null, and fromCache indicates whether it came from the cache vs. a fresh
// Spotify search.
async function resolveTrackWithCache(track, accessToken, trackCache) {
  const cacheKey = trackCacheKey(track);
  const cached = trackCache[cacheKey];

  if (cached) {
    return { resolved: cached, fromCache: true };
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