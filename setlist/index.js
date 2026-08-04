#!/usr/bin/env node

// setlist/index.js
// Polka Dot Radio Setlist Save by Lisa R. Clarke
// Fetches the specified set lists from setlist.fm and updates a Spotify playlist.
//
// Usage: node setlist/index.js
//        node setlist/index.js --dry-run

const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { safeParseJSON, request, sleep } = require('../lib/http');
const { spotifyGet, spotifyPut, spotifyPost, resolveTrackWithCache, loadTrackCache, saveTrackCache } = require('../lib/spotify');
const { logDryRun } = require('../lib/dryRun');

// ─── Config ───────────────────────────────────────────────────────────────────

const APP_DIR = __dirname;
const ROOT_DIR = path.resolve(__dirname, '..');

const CONFIG_FILE = path.join(APP_DIR, 'config.yaml');
const CREDENTIALS_FILE = path.join(ROOT_DIR, 'credentials.yaml');
const TOKEN_FILE = path.join(ROOT_DIR, '.spotify-token.json');
const TRACK_CACHE_FILE = path.join(ROOT_DIR, '.spotify-track-cache.json');
const TRACK_OVERRIDES_FILE = path.join(ROOT_DIR, '.spotify-track-overrides.json');

const DRY_RUN = process.argv.includes('--dry-run');

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    console.error('❌ credentials.yaml not found. Copy credentials.example.yaml to credentials.yaml and fill it in.');
    process.exit(1);
  }
  return yaml.load(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('❌ config.yaml not found. Copy top/config.example.yaml to top/config.yaml and fill it in.');
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

// ─── Setlist.fm ───────────────────────────────────────────────────────────────

async function fetchSetlist(setlistId, apiKey, attempt = 1) {
  const res = await request({
    hostname: 'api.setlist.fm',
    path: '/rest/1.0/setlist/' + setlistId,
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'Accept': 'application/json',
    },
  });

  if (res.status === 429 && attempt <= 3) {
    const retryAfterSec = parseInt((res.headers && res.headers['retry-after']) || '2', 10);
    console.log('   ⏳ Rate limited, waiting ' + retryAfterSec + 's before retry ' + attempt + '/3...');
    await sleep(retryAfterSec * 1000);
    return fetchSetlist(setlistId, apiKey, attempt + 1);
  }

  if (res.status !== 200) {
    console.error('❌ Setlist fetch failed for ID ' + setlistId + ' (HTTP ' + res.status + '):', res.raw);
    return null;
  }

  return safeParseJSON(res, 'setlist.fm setlist ' + setlistId);
}

function flattenSetlistSongs(setlistData) {
  const mainArtist = setlistData.artist ? setlistData.artist.name : null;
  const sets = (setlistData.sets && setlistData.sets.set) || [];

  const tracks = [];
  for (const set of sets) {
    const songs = set.song || [];
    for (const song of songs) {
      if (!song.name) continue;
      const artist = song.with ? song.with.name : mainArtist;
      tracks.push({ name: song.name, artist });
    }
  }
  return tracks;
}

async function getSetlistFmTracks(credentials, config) {
  const apiKey = credentials.setlistfm.api_key;
  const allTracks = [];

  for (let i = 0; i < config.setlists.length; i++) {
    const setlist = config.setlists[i];
    console.log('🎵 Fetching setlist for ' + setlist.display_name + ' from Setlist.fm...');

    const data = await fetchSetlist(setlist.setlist_id, apiKey);
    if (!data) {
      console.error('   Skipping this setlist.');
      continue;
    }

    const tracks = flattenSetlistSongs(data);
    if (tracks.length === 0) {
      console.log('   ⚠️  Setlist fetched successfully, but no songs are listed (may not be submitted to setlist.fm yet).');
    } else {
      console.log('   Found ' + tracks.length + ' songs.');
    }
    allTracks.push(...tracks);

    if (i < config.setlists.length - 1) {
      await sleep(600);
    }
  }

  return allTracks;
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

  console.log('\n🎤 Setlist Save — Starting run at', new Date().toLocaleString());
  console.log('─'.repeat(50));

  const setlistTracks = await getSetlistFmTracks(credentials, config);

  if (DRY_RUN) {
    logDryRun(setlistTracks);
    return;
  }

  const accessToken = await getAccessToken(credentials);

  console.log(`   Resolving ${setlistTracks.length} tracks against Spotify...`);
  const foundTracks = [];
  let resolvedCount = 0;
  let cacheHits = 0;
  const trackCache = loadTrackCache(TRACK_CACHE_FILE);
  const trackOverrides = loadTrackCache(TRACK_OVERRIDES_FILE);

  for (const track of setlistTracks) {
    const { resolved, fromCache } = await resolveTrackWithCache(track, accessToken, trackCache, trackOverrides);
    if (fromCache) cacheHits++;
    
    if (resolved) {
      foundTracks.push({ uri: resolved.uri, name: track.name, artist: track.artist });
      resolvedCount++;
    }
  }
  saveTrackCache(trackCache, TRACK_CACHE_FILE);
  console.log(`   Resolved ${resolvedCount}/${setlistTracks.length} tracks (${cacheHits} from cache).`);

  if (foundTracks.length === 0) {
    console.error('❌ No tracks found on Spotify. Aborting.');
    process.exit(1);
  }

  await updatePlaylist(config.target_id, foundTracks.map(t => t.uri), accessToken);  console.log('\n🎉 Done! Your Setlist Save playlist has been updated.');
  console.log('   Tracks added: ' + foundTracks.length);
  console.log('─'.repeat(50) + '\n');
}

main().catch(err => {
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
});
