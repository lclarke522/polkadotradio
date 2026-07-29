#!/usr/bin/env node

// roadtrip/index.js
// Polka Dot Radio Road Trip Radio by Lisa R. Clarke
// Combines tracks from multiple playlist sources into a single Spotify playlist.
//
// Usage: node roadtrip/index.js
//        node roadtrip/index.js --config beachtrip-config.yaml 
//        node roadtrip/index.js --dry-run 

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
    console.error('❌',configName,'not found. Copy roadtrip/config.example.yaml to',configName,'and fill it in.');
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

function validateConfig(config) {
  const args = process.argv.slice(2);
  const validFlags = new Set(['--dry-run', '--config']);
  const unknownFlags = args.filter(arg => arg.startsWith('--') && !validFlags.has(arg));
  if (unknownFlags.length > 0) {
    console.error(`❌ Unknown option(s): ${unknownFlags.join(', ')}`);
    console.error('   Only valid flags are: --dry-run and --config');
    process.exit(1);
  }

  const errors = [];

  if (typeof config.trip_duration_minutes !== 'number' || config.trip_duration_minutes <= 0) {
    errors.push('trip_duration_minutes must be a positive number');
  }

  if (!config.destination_playlist_id || typeof config.destination_playlist_id !== 'string') {
    errors.push('destination_playlist_id is required and must be a string');
  }

  if (!Array.isArray(config.travelers) || config.travelers.length === 0) {
    errors.push('travelers must be a non-empty array');
  } else {
    const validSourceTypes = new Set(['spotify', 'm3u', 'text']);
    config.travelers.forEach((traveler, i) => {
      const label = traveler.name ? `"${traveler.name}"` : `traveler #${i + 1}`;
      if (!traveler.name) errors.push(`${label}: missing name`);
      if (!validSourceTypes.has(traveler.source_type)) {
        errors.push(`${label}: source_type must be one of spotify, m3u, text (got "${traveler.source_type}")`);
      }
      if (!traveler.source) errors.push(`${label}: missing source`);
    });
  }

  if (errors.length > 0) {
    console.error('❌ Config validation failed:');
    errors.forEach(e => console.error('   - ' + e));
    process.exit(1);
  }
}

// ─── Build source track list ──────────────────────────────────────────────────

function parseM3U(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  const tracks = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#EXTINF:')) continue;

    // #EXTINF:245,Artist - Title
    const match = trimmed.match(/^#EXTINF:-?\d+,(.+)$/);
    if (!match) continue;

    const info = match[1];
    const separatorIndex = info.indexOf(' - ');
    if (separatorIndex === -1) {
      console.log(`   ⚠️  Skipping unparseable #EXTINF line: "${info}"`);
      continue;
    }

    tracks.push({
      artist: info.slice(0, separatorIndex).trim(),
      name: info.slice(separatorIndex + 3).trim(),
    });
  }
  return tracks;
}

function parseTextSource(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  const tracks = [];
  for (const line of lines) {
    const separatorIndex = line.indexOf(' - ');
    if (separatorIndex === -1) {
      console.log(`   ⚠️  Skipping unparseable line: "${line}"`);
      continue;
    }
    tracks.push({
      artist: line.slice(0, separatorIndex).trim(),
      name: line.slice(separatorIndex + 3).trim(),
    });
  }
  return tracks;
}

const AVERAGE_TRACK_MS = 3.5 * 60 * 1000; // rough placeholder for dry-run duration estimates

async function getTracksFromSource(accessToken, travelers) {
  const tracks = [];

  for (const traveler of travelers) {
    console.log("🎵 Fetching tracks from " + traveler.name + "'s playlist...");

    const beforeCount = tracks.length;

    if (traveler.source_type === 'spotify') {
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const data = await spotifyGet(
          `/v1/playlists/${traveler.source}/items?limit=100&offset=${offset}&market=FROM_TOKEN`,
          accessToken
        );

        for (const entry of data.items) {
          const track = entry.item;
          if (track && track.type === 'track' && track.uri?.startsWith('spotify:track:') && track.duration_ms && track.is_playable !== false) {
            tracks.push({
              uri: track.uri,
              name: track.name,
              artist: track.artists?.map(a => a.name).join(', ') || 'Unknown',
              duration_ms: track.duration_ms,
              traveler: traveler.name
            });
          }
        }

        offset += 100;
        hasMore = offset < data.total;
      }

    } else if (traveler.source_type === 'm3u' || traveler.source_type === 'text') {
      const filePath = path.join(APP_DIR, traveler.source);
      const rawTracks = traveler.source_type === 'm3u'
        ? parseM3U(filePath)
        : parseTextSource(filePath);

      if (DRY_RUN) {
        console.log(`   🧪 Dry run — skipping Spotify resolution for ${rawTracks.length} tracks (using estimated durations).`);
        for (const rawTrack of rawTracks) {
          tracks.push({
            uri: null,
            name: rawTrack.name,
            artist: rawTrack.artist,
            duration_ms: AVERAGE_TRACK_MS,
            traveler: traveler.name
          });
        }
        continue;
      }

console.log(`   Resolving ${rawTracks.length} tracks against Spotify...`);
      let resolvedCount = 0;
      let cacheHits = 0;
      const trackCache = loadTrackCache(TRACK_CACHE_FILE);
      const trackOverrides = loadTrackCache(TRACK_OVERRIDES_FILE);

      for (const rawTrack of rawTracks) {
        const { resolved, fromCache } = await resolveTrackWithCache(rawTrack, accessToken, trackCache, trackOverrides);
        if (fromCache) cacheHits++;
        
        if (resolved) {
          tracks.push({
            uri: resolved.uri,
            name: rawTrack.name,
            artist: rawTrack.artist,
            duration_ms: resolved.duration_ms,
            traveler: traveler.name
          });
          resolvedCount++;
        }
      }
      saveTrackCache(trackCache,TRACK_CACHE_FILE);
      console.log(`   Resolved ${resolvedCount}/${rawTracks.length} tracks (${cacheHits} from cache).`);
    }
    if (tracks.length === beforeCount) {
      console.log(`   ⚠️  No usable tracks found for ${traveler.name} — check their source.`);
    }
  }

  console.log(`   Found ${tracks.length} tracks (${formatDuration(tracks.reduce((sum, t) => sum + t.duration_ms, 0))} total)`);
  return tracks;
}

function dedupTracks(tracks) {
  const seen = new Map();

  for (const track of tracks) {
    const key = normalizeForMatch(track.artist) + '|' + normalizeForMatch(track.name);
    const existing = seen.get(key);

    if (!existing) {
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

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}h ${minutes}m ${seconds}s`
    : `${minutes}m ${seconds}s`;
}

function groupTracksByTraveler(tracks) {
  const grouped = new Map();
  for (const track of tracks) {
    if (!grouped.has(track.traveler)) {
      grouped.set(track.traveler, []);
    }
    grouped.get(track.traveler).push(track);
  }
  return grouped;
}

function selectTracks(tracks, targetMs, travelers) {
  const tracksByTraveler = groupTracksByTraveler(tracks);
  const perTravelerTargetMs = targetMs / travelers.length;

  const selected = [];
  let totalMs = 0;

  for (const traveler of travelers) {
    const pool = shuffle(tracksByTraveler.get(traveler.name) || []);
    let travelerMs = 0;

    for (const track of pool) {
      if (travelerMs >= perTravelerTargetMs) break;
      selected.push(track);
      travelerMs += track.duration_ms;
      totalMs += track.duration_ms;
    }
  }

  return { selectedTracks: shuffle(selected), totalMs };
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
 
  console.log('\n🚙 Road Trip Radio Playlist — Starting run at', new Date().toLocaleString());
  console.log('─'.repeat(50));

  validateConfig(config);
  const accessToken = await getAccessToken(credentials);
  
  const playlistTracks = await getTracksFromSource(accessToken, config.travelers);

  const dedupedTracks = dedupTracks(playlistTracks);
  console.log('✅ Removed duplicate tracks: ' + dedupedTracks.length + ' remaining.\n');
  
  
  
  const targetMinutes = config.trip_duration_minutes || 120;
  const targetMinPerTraveler = targetMinutes / config.travelers.length;
  const targetMs = targetMinutes * 60 * 1000

  console.log(`\n🔀 Selecting ~${targetMinPerTraveler} minutes of music for each traveler at random...`);
  const { selectedTracks, totalMs } = selectTracks(dedupedTracks, targetMs, config.travelers);
  console.log(`   Selected ${selectedTracks.length} tracks (${formatDuration(totalMs)})`);
  
  if (DRY_RUN) {
    logDryRun(selectedTracks);
    return;
  }

  console.log('\n🔍 Searching for tracks on Spotify...');

  const foundTracks = selectedTracks.map(track => ({
    uri: track.uri,
    name: track.name,
    artist: track.artist
  }));

  console.log('\n✅ Found ' + foundTracks.length + ' tracks on Spotify');

  await updatePlaylist(config.destination_playlist_id, foundTracks.map(t => t.uri), accessToken);
  console.log('\n🎉 Done! Your Road Trip Radio Playlist has been updated.');
  console.log('   Tracks added: ' + foundTracks.length);
  console.log('─'.repeat(50) + '\n');
}

main().catch(err => {
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
});
