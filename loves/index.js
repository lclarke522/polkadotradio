#!/usr/bin/env node

// loves/index.js
// Polka Dot Radio Loved Artists by Lisa R. Clarke
// Fetches your most-played artists (over one period) and their most-played
// tracks (over a possibly different period), then updates a Spotify playlist.
//
// Usage: node loves/index.js 

const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { safeParseJSON, request, sleep } = require('../lib/http');
const { spotifyGet, spotifyPut, spotifyPost, resolveTrackWithCache, normalizeForMatch, loadTrackCache, saveTrackCache, trackCacheKey } = require('../lib/spotify');
const { logDryRun } = require('../lib/dryRun');

// ─── Config ───────────────────────────────────────────────────────────────────
const configFlagIndex = process.argv.indexOf('--config');
const configName = configFlagIndex !== -1 ? process.argv[configFlagIndex + 1] : 'config.yaml';

if (configFlagIndex !== -1 && !configName) {
  console.error('❌ Error: --config flag requires a filename');
  process.exit(1);
}

const APP_DIR = __dirname;
const ROOT_DIR = path.resolve(__dirname, '..');

const CONFIG_FILE = path.join(APP_DIR, configName);
const CREDENTIALS_FILE = path.join(ROOT_DIR, 'credentials.yaml');
const TOKEN_FILE = path.join(ROOT_DIR, '.spotify-token.json');
const TRACK_CACHE_FILE = path.join(ROOT_DIR, '.spotify-track-cache.json');
const TRACK_OVERRIDES_FILE = path.join(ROOT_DIR, '.spotify-track-overrides.json');
const TRACK_BLOCK_FILE = path.join(ROOT_DIR, '.spotify-track-blocklist.json');
const TRACK_LIKED_FILE = path.join(ROOT_DIR, '.spotify-track-liked.json');
const FAMILIES_FILE = path.join(APP_DIR, 'families-config.yaml');

const DRY_RUN = process.argv.includes('--dry-run');
const LIKED_ONLY = process.argv.includes('--liked-only');

const PERIOD_LABELS = {
  '7day': 'for the last 7 days',
  '1month': 'for the last month',
  '3month': 'for the last 3 months',
  '6month': 'for the last 6 months',
  '12month': 'for the last year',
  'overall': 'of all time',
};

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    console.error('❌ credentials.yaml not found. Copy credentials.example.yaml to credentials.yaml and fill it in.');
    process.exit(1);
  }
  return yaml.load(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('❌',configName,'not found. Copy loves/config.example.yaml to',configName,'and fill it in.');
    process.exit(1);
  }
  return yaml.load(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function loadToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    console.error('❌ Not authenticated! Run: node setup.js');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
}

function saveToken(tokenData) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
}

function loadFamilies() {
  if (!fs.existsSync(FAMILIES_FILE)) {
    return { families: [] };
  }
  return yaml.load(fs.readFileSync(FAMILIES_FILE, 'utf8'));
}

// ─── Spotify auth ─────────────────────────────────────────────────────────────

async function getAccessToken(credentials) {
  const token = loadToken();
  if (!token || !token.refresh_token) {
    console.error('❌ No Spotify token found. Run: node setup.js');
    process.exit(1);
  }

  if (token.expires_at && token.expires_at > Date.now() + 5 * 60 * 1000) {
    return token.access_token;
  }
  console.log('🔄 Refreshing Spotify token...');
  const creds = Buffer.from(credentials.spotify.client_id + ':' + credentials.spotify.client_secret).toString('base64');
  const body = 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(token.refresh_token);

  const res = await request({
    hostname: 'accounts.spotify.com',
    path: '/api/token',
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + creds,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  const parsed = safeParseJSON(res, 'Spotify token refresh');
  if (parsed.error === 'invalid_grant') {
    if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
    console.error('❌ Your refresh token has expired (Spotify enforces a 6-month limit).');
    console.error('   Run: node setup.js to re-authorize your account.\n');
    process.exit(1);
  }
  
  if (res.status !== 200) {
    console.error('❌ Token refresh failed (HTTP ' + res.status + '):', parsed);
    process.exit(1);
  }

  const newToken = {
    access_token: parsed.access_token,
    refresh_token: parsed.refresh_token || token.refresh_token,
    expires_at: Date.now() + parsed.expires_in * 1000,
  };
  saveToken(newToken);
  console.log('✅ Token refreshed.');
  return newToken.access_token;
}

// ─── Last.fm ──────────────────────────────────────────────────────────────────


function validateConfig(config) {
  const args = process.argv.slice(2);
  const validFlags = new Set(['--dry-run', '--config', '--liked-only']);
  const unknownFlags = args.filter(arg => arg.startsWith('--') && !validFlags.has(arg));

  const errors = [];

  if (unknownFlags.length > 0) {
    errors.push(`❌ Unknown option(s): ${unknownFlags.join(', ')}`);
    errors.push('   Only valid flags are: --dry-run and --config');
  }

  if (!config.loves) {
    errors.push('❌ Config file is missing the top-level "loves:" section.');
  }
  
  const validPeriod = Object.keys(PERIOD_LABELS);
  const topArtistCount = config.loves.top_artist_count ?? 5;
  const includeArtists = config.loves.include_artists || [];
  
  if (!validPeriod.includes(config.loves.artist_period)) {
    errors.push('❌ Artist period must be one of 7day, 1month, 3month, 6month, 12month, or overall');
  }

  if (!validPeriod.includes(config.loves.track_period)) {
    errors.push('❌ Track period must be one of 7day, 1month, 3month, 6month, 12month, or overall');
  }

  if (!Number.isInteger(topArtistCount) || topArtistCount < 0) {
    errors.push('❌ top_artist_count must be a non-negative integer');
  }
  if (!Array.isArray(config.loves.include_artists ?? [])) {
    errors.push('❌ include_artists must be a list');
  }
  if (!(topArtistCount + includeArtists.length)) {
    errors.push('❌ No artists specified. Choose one or more include_artists or specify a top_artist_count greater than 0');
  }

  if (!Number.isInteger(config.loves.tracks_per_artist) || config.loves.tracks_per_artist < 1) {
    errors.push('❌ tracks_per_artist must be a positive integer');
  }

  if (!Number.isInteger(config.loves.tracks_per_artist) || config.loves.tracks_per_artist < 1) {
    errors.push('❌ tracks_per_artist must be a positive integer');
  }

  const sourceTrackOrder = config.loves.track_pool_order || 'random';
  const validSourceOrder = new Set(['random','sequential']);
  if (!validSourceOrder.has(sourceTrackOrder)) {
    errors.push('❌ Track pool order must be one of random or sequential');
  }

  const destinationTrackOrder = config.loves.playlist_order || 'random';
  const validDestinationOrder = new Set(['random','alternating']);
  if (!validDestinationOrder.has(destinationTrackOrder)) {
    errors.push('❌ Playlist order must be one of random or alternating');
  }

  if (!config.loves.playlist_id) {
    errors.push('❌ Must specify playlist_id in config file');
  }
  
  if (!Number.isInteger(config.loves.track_pool_size) || config.loves.track_pool_size < 1) {
    errors.push('❌ track_pool_size must be a positive integer');
  }
  if (!Number.isInteger(config.loves.lastfm_page_size) || config.loves.lastfm_page_size < 1) {
    errors.push('❌ lastfm_page_size must be a positive integer');
  }

  if (errors.length > 0) {
    console.error('❌ Config validation failed:');
    errors.forEach(e => console.error('   - ' + e));
    process.exit(1);
  }
  
}

function normalizeString(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*\(from .+?\)\s*$/i, '');
}

function findFamilyMatchkeys(matchkey, families) {
  for (const family of families) {
    const normalizedMembers = family.members.map(name => normalizeString(name));
    if (normalizedMembers.includes(matchkey)) {
      return family;
    }
  }
  return null;
}

async function getTopArtists(credentials, config) {
  const topArtistCount = config.loves.top_artist_count ?? 5;

  if (topArtistCount === 0) { return []; }

  const periodTxt = PERIOD_LABELS[config.loves.artist_period];

  console.log('🎵 Fetching ' + topArtistCount + ' top artist(s) ' + periodTxt + ' for ' + credentials.lastfm.username + ' from Last.fm...');

  const res = await request({
    hostname: 'ws.audioscrobbler.com',
    path: '/2.0/?method=user.getTopArtists' +
      '&user=' + encodeURIComponent(credentials.lastfm.username) +
      '&period=' + config.loves.artist_period +
      '&limit=' + topArtistCount +
      '&api_key=' + credentials.lastfm.api_key +
      '&format=json',
    method: 'GET',
  });

  const data = safeParseJSON(res, 'Last.fm getTopArtists');
  if (data.error) {
    console.error('❌ Last.fm error ' + data.error + ': ' + data.message);
    process.exit(1);
  }
  
  const artists = Array.isArray(data.topartists.artist)
    ? data.topartists.artist
    : data.topartists.artist ? [data.topartists.artist] : [];
  
  return artists.map(a => ({
    name: a.name,
    familyName: null,
    matchkeys: [normalizeString(a.name)],
    mbid: a.mbid || null,
    rank: parseInt(a['@attr']?.rank, 10) || null,
    playcount: parseInt(a.playcount, 10) || null,
  }));
}

function dedupArtists(combinedArtists) {
  let dedupedArtists = [];

  for (let i=0; i<combinedArtists.length; i++) {
    let foundMatch = null;
    for (let j=0; j<dedupedArtists.length; j++) {
      if (combinedArtists[i].matchkeys[0] === dedupedArtists[j].matchkeys[0]) { foundMatch = j; }
    }
    if (foundMatch !== null) {
      if (!dedupedArtists[foundMatch].mbid && combinedArtists[i].mbid) {
        dedupedArtists[foundMatch] = combinedArtists[i];
      }
      console.log('🧐 Found and removed duplicate artist:',combinedArtists[i].name);
    } else {
      dedupedArtists.push(combinedArtists[i]);
    } 
  }

return dedupedArtists;
}

function dedupTracks(tracks) {
  const seen = new Map();

  for (const track of tracks) {
    const key = track.artistMatchkey + '|' + normalizeForMatch(track.name);
    const existing = seen.get(key);

    if (!existing || track.playcount > existing.playcount) {
      seen.set(key, track);
    }
  }

  return [...seen.values()];
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function interleave(lists) {
  const result = [];
  const maxLen = Math.max(0, ...lists.map(l => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (i < list.length) result.push(list[i]);
    }
  }
  return result;
}

async function getLastFmTopTracks(credentials,config) {

  const limit = config.loves.track_pool_size || 100;
  const pagesize = config.loves.lastfm_page_size || 100;
  const period = config.loves.track_period || 'overall';
  const periodTxt = PERIOD_LABELS[config.loves.track_period];

  console.log('🎵 Fetching ' + limit + ' top track(s) ' + periodTxt + ' for ' + credentials.lastfm.username + ' from Last.fm...');

  let hasMore = true;
  let page = 1;
  let tracks = [];
  while (hasMore) {
    const res = await request({
      hostname: 'ws.audioscrobbler.com',
      path: '/2.0/?method=user.getTopTracks' +
        '&user=' + encodeURIComponent(credentials.lastfm.username) +
        '&period=' + period +
        '&limit=' + pagesize +
        '&page=' + page +
        '&api_key=' + credentials.lastfm.api_key +
        '&format=json',
      method: 'GET',
    });

    const data = safeParseJSON(res, 'Last.fm getTopTracks');
    if (data.error) {
      console.error('❌ Last.fm error ' + data.error + ': ' + data.message);
      process.exit(1);
    }

    const totalPages = parseInt(data.toptracks['@attr'].totalPages, 10);

    const pageTracks = Array.isArray(data.toptracks.track)
      ? data.toptracks.track
      : data.toptracks.track ? [data.toptracks.track] : [];
    tracks = [...tracks, ...pageTracks];

    page += 1;
    hasMore = (page <= totalPages) && (tracks.length < limit);
  }
  
  tracks = tracks.slice(0, limit);
  
  console.log('✅ Got ' + tracks.length + ' tracks from Last.fm');
  return tracks.map(t => ({
    name: t.name,
    artist: t.artist.name.replace(/\s*\(from .+?\)\s*$/i, '').trim(),
    artistMbid: t.artist.mbid || null,
    artistMatchkey: normalizeString(t.artist.name.replace(/\s*\(from .+?\)\s*$/i, '').trim()),
    playcount: parseInt(t.playcount, 10),
    rank: parseInt(t['@attr']?.rank, 10),
  }));
}


// ─── Spotify playlist update ──────────────────────────────────────────────────

async function updatePlaylist(playlistId, uris, accessToken) {
  console.log('\n📝 Updating Spotify playlist with ' + uris.length + ' tracks...');

  // First 100: replace playlist contents
  const firstBatch = await spotifyPut(
    '/v1/playlists/' + playlistId + '/items',
    { uris: uris.slice(0, 100) },
    accessToken
  );

  if (firstBatch.status !== 200 && firstBatch.status !== 201) {
    console.error('❌ Failed to update playlist (HTTP ' + firstBatch.status + '):', firstBatch.body);
    if (firstBatch.status === 403) {
      console.error('\n   Possible causes:');
      console.error('   1. Your Spotify email is not in Dashboard → User Management');
      console.error('   2. Token lacks playlist-modify-public scope → run: node setup.js');
    }
    process.exit(1);
  }

  // Remaining batches: append to playlist
  for (let i = 100; i < uris.length; i += 100) {
    const batch = await spotifyPost(
      '/v1/playlists/' + playlistId + '/items',
      { uris: uris.slice(i, i + 100) },
      accessToken
    );

    if (batch.status !== 200 && batch.status !== 201) {
      console.error('❌ Failed to append playlist batch (HTTP ' + batch.status + '):', batch.body);
      process.exit(1);
    }
  }

  console.log('✅ Playlist updated successfully!');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const config = loadConfig();
  const credentials = loadCredentials();
  const familyConfig = loadFamilies();
  
  console.log('\n💖 Loved Artists Playlist — Starting run at', new Date().toLocaleString());
  console.log('─'.repeat(50));

  validateConfig(config);

  const topArtists = await getTopArtists(credentials, config);
  const includeArtists = config.loves.include_artists ?? [];

  let finalArtists = [];
  let manualArtists = [];
  if (includeArtists.length > 0) {
    manualArtists = includeArtists.map(name => ({
      name,
      familyName: null,
      matchkeys: [normalizeString(name)],
      mbid: null,
      rank: null,
      playcount: null,
    }));

    const combinedArtists = [...topArtists, ...manualArtists];
    finalArtists = dedupArtists(combinedArtists);
  } else {
  finalArtists = topArtists;
  }
  
const claimedFamilies = new Map(); // familyName -> finalArtists index that "owns" the family

  for (let i = 0; i < finalArtists.length; i++) {
    if (!topArtists.includes(finalArtists[i])) continue;

    const ownMatchkey = finalArtists[i].matchkeys[0];
    const matchedFamily = findFamilyMatchkeys(ownMatchkey, familyConfig.families);
    if (!matchedFamily) continue;

    if (!claimedFamilies.has(matchedFamily.display_name)) {
      finalArtists[i].matchkeys = matchedFamily.members.map(name => normalizeString(name));
      finalArtists[i].familyName = matchedFamily.display_name;
      claimedFamilies.set(matchedFamily.display_name, i);
    } else {
      const ownerIndex = claimedFamilies.get(matchedFamily.display_name);
      finalArtists[ownerIndex].matchkeys = finalArtists[ownerIndex].matchkeys.filter(k => k !== ownMatchkey);
      console.log('🧐 Removed duplicate artist', finalArtists[i].name, 'from', finalArtists[ownerIndex].familyName);
    }
  }
  
  for (const [familyName, ownerIndex] of claimedFamilies) {
    if (finalArtists[ownerIndex].matchkeys.length === 1) {
      finalArtists[ownerIndex].familyName = null;
    }
  }
  
  for (const manualArtist of manualArtists) {
    if (!finalArtists.includes(manualArtist)) continue;
    
    const manualKey = manualArtist.matchkeys[0];

    for (let j = 0; j < finalArtists.length; j++) {
      if (finalArtists[j] === manualArtist) continue;

      if (finalArtists[j].matchkeys.includes(manualKey)) {
        finalArtists[j].matchkeys = finalArtists[j].matchkeys.filter(k => k !== manualKey);
        console.log('🧐 Removed duplicate artist', manualArtist.name, 'from', finalArtists[j].familyName || finalArtists[j].name);
      }
    }
  }  

  const trackPool = await getLastFmTopTracks(credentials,config);
  
  const artistMbids = new Set(finalArtists.filter(a => a.mbid).map(a => a.mbid));
  const artistMatchkeys = new Set(finalArtists.map(a => a.matchkeys).flat());

  const filteredTracks = trackPool.filter(track => {
    const mbidMatch = track.artistMbid && artistMbids.has(track.artistMbid);
    const nameMatch = artistMatchkeys.has(track.artistMatchkey);
    return mbidMatch || nameMatch;
  });
  console.log('✅ Filtered to ' + filteredTracks.length + ' tracks by your selected artists.\n');

  const dedupedTracks = dedupTracks(filteredTracks);
  console.log('✅ Removed duplicate tracks: ' + dedupedTracks.length + ' remaining.\n');

  const trackBlocklist = loadTrackCache(TRACK_BLOCK_FILE);
  const likedCache = LIKED_ONLY ? loadTrackCache(TRACK_LIKED_FILE) : {};

  const availableTracks = dedupedTracks.filter(t => {
    const blocked = !!trackBlocklist[trackCacheKey(t)];
    if (blocked) {
      console.log('❌ Excluded from selection (blocklist):', t.name, 'by', t.artist);
      return false;
    }
    if (LIKED_ONLY && !likedCache[trackCacheKey(t)]) {
      console.log('❌ Excluded from selection (unliked):', t.name, 'by', t.artist);
      return false;
    }
    return true;
  });
  
  const tracksPerArtist = config.loves.tracks_per_artist;
  const sourceTrackOrder = config.loves.track_pool_order || 'random';
  const destinationTrackOrder = config.loves.playlist_order || 'random';
  const artistTrackLists = [];

  for (const artist of finalArtists) {
    const candidates = availableTracks.filter(t => {
      const mbidMatch = artist.mbid && t.artistMbid === artist.mbid;
      const nameMatch = artist.matchkeys.includes(t.artistMatchkey);
      return mbidMatch || nameMatch;
    });
    const ordered = sourceTrackOrder === 'sequential'
      ? [...candidates].sort((a, b) => b.playcount - a.playcount)
      : shuffle(candidates);
    const picked = ordered.slice(0, tracksPerArtist);

    if (picked.length < tracksPerArtist) {
      console.log('⚠️ Only found ' + picked.length + ' tracks for ' + artist.name + '; using all ' + picked.length + '.');
    } else {
      console.log('   Selected ' + picked.length + ' tracks for ' + (artist.familyName || artist.name) + '.');
    }

    artistTrackLists.push(picked);
  }

  let lastfmTracks = [];
  if(destinationTrackOrder == 'random') {
    lastfmTracks = shuffle(artistTrackLists.flat());
  } else {
    lastfmTracks = interleave(artistTrackLists);
  }
  
  if (DRY_RUN) {
    logDryRun(lastfmTracks);
    return;
  }

  const accessToken = await getAccessToken(credentials);
  const foundTracks = [];

  console.log(`   Resolving ${lastfmTracks.length} tracks against Spotify...`);
  let resolvedCount = 0;
  let cacheHits = 0;
  const trackCache = loadTrackCache(TRACK_CACHE_FILE);
  const trackOverrides = loadTrackCache(TRACK_OVERRIDES_FILE);

  for (const lastfmTrack of lastfmTracks) {
    const likedMatch = likedCache[trackCacheKey(lastfmTrack)];
    if (likedMatch) {
      foundTracks.push({
        uri: likedMatch.uri,
        name: lastfmTrack.name,
        artist: lastfmTrack.artist,
        duration_ms: likedMatch.duration_ms,
      });
      resolvedCount++;
      cacheHits++;
      continue;
    } 
    
    const { resolved, fromCache } = await resolveTrackWithCache(lastfmTrack, accessToken, trackCache, trackOverrides, trackBlocklist);
    if (fromCache) cacheHits++;

    if (resolved) {
      foundTracks.push({
        uri: resolved.uri,
        name: lastfmTrack.name,
        artist: lastfmTrack.artist,
        duration_ms: resolved.duration_ms,
      });
      resolvedCount++;
    }
  }

  saveTrackCache(trackCache,TRACK_CACHE_FILE);
  console.log(`   Resolved ${resolvedCount}/${lastfmTracks.length} tracks (${cacheHits} from cache).`);

  if (foundTracks.length === 0) {
    console.error('❌ No tracks found on Spotify. Aborting.');
    process.exit(1);
  }

  await updatePlaylist(config.loves.playlist_id, foundTracks.map(t => t.uri), accessToken);
  console.log('\n🎉 Done! Your Loved Artists Playlist has been updated.');
  console.log('   Tracks added: ' + foundTracks.length);
  console.log('─'.repeat(50) + '\n');
}

main().catch(err => {
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
});
