#!/usr/bin/env node

// daily/index.js
// Polka Dot Radio Daily Playlists by Lisa R. Clarke
// Builds a playlist of specified length using randomly selected tracks from a
// source playlist, giving you a fresh listening session each time it's run.
//
// Usage:  node daily/index.js                            (defaults to morning mode)
//         node daily/index.js --morning
//         node daily/index.js --afternoon
//         node daily/index.js --evening   
//         node daily/index.js --morning --podcast-only   (requires time of day)

const fs = require('fs');
const yaml = require('js-yaml');
const SpotifyWebApi = require('spotify-web-api-node');
const path = require('path');
const { safeParseJSON, request, sleep } = require('../lib/http');
const { spotifyGet, spotifyPut, spotifyPost } = require('../lib/spotify');
const { logDryRun } = require('../lib/dryRun');

// ─── Config ───────────────────────────────────────────────────────────────────

const APP_DIR = __dirname;
const ROOT_DIR = path.resolve(__dirname, '..');

const CONFIG_FILE = path.join(APP_DIR, 'config.yaml');
const CREDENTIALS_FILE = path.join(ROOT_DIR, 'credentials.yaml');
const TOKEN_FILE = path.join(ROOT_DIR, '.spotify-token.json');

const PODCAST_ONLY = process.argv.includes('--podcast-only');
const DRY_RUN = process.argv.includes('--dry-run');

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    console.error('❌ credentials.yaml not found! Run: cp credentials.example.yaml credentials.yaml');
    process.exit(1);
  }
  return yaml.load(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('❌ config.yaml not found! Run: cp daily/config.example.yaml daily/config.yaml');
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

// ─── Utility helpers ──────────────────────────────────────────────────────────

function getVariant(config) {
  const args = process.argv.slice(2);
  const validFlags = new Set(['--morning', '--afternoon', '--evening', '--podcast-only', '--dry-run']);
  const unknownFlags = args.filter(arg => arg.startsWith('--') && !validFlags.has(arg));
  if (unknownFlags.length > 0) {
    console.error(`❌ Unknown option(s): ${unknownFlags.join(', ')}`);
    console.error('   Valid options are: --morning, --afternoon, --evening, --podcast-only');
    process.exit(1);
  }
  const modes = [
    { passed: args.includes('--morning'), key: 'morning', label: '\n☕ Morning Coffee' },
    { passed: args.includes('--afternoon'), key: 'afternoon', label: '\n🎹 Afternoon Focus' },
    { passed: args.includes('--evening'), key: 'evening', label: '\n🧶 Evening Unwind' },
  ].filter(mode => mode.passed);

  if (modes.length > 1) {
    console.error('❌ Choose only one mode: --morning, --afternoon, or --evening');
    process.exit(1);
  }

  const mode = modes[0] ?? {
    key: 'morning',
    label: '\n☕ Morning Coffee',
  };

  return {
    variant: config[mode.key],
    buildingMsg: PODCAST_ONLY
      ? `${mode.label} — Podcast update only`
      : `${mode.label} — Building playlist`,
  };
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

// ─── Spotify auth ─────────────────────────────────────────────────────────────

async function refreshTokenIfNeeded(spotifyApi, token) {
  if (!token || !token.refresh_token) {
    console.error('❌ No Spotify token found. Run: node setup.js');
    process.exit(1);
  }
  if (Date.now() > token.expires_at - 5 * 60 * 1000) {
    console.log('🔄 Refreshing access token...');
    let data;
    try {
      data = await spotifyApi.refreshAccessToken();
    } catch (err) {
      if (err.body?.error === 'invalid_grant' || err.message?.includes('invalid_grant')) {
        if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
        console.error('❌ Your refresh token has expired (Spotify enforces a 6-month limit).');
        console.error('   Run: node setup.js to re-authorize your account.\n');
        process.exit(1);
      }
      throw err;
    }

    token.access_token = data.body.access_token;
    token.expires_at = Date.now() + data.body.expires_in * 1000;
    if (data.body.refresh_token) {
      token.refresh_token = data.body.refresh_token;
    }
    saveToken(token);
    spotifyApi.setAccessToken(token.access_token);
    console.log('✅ Token refreshed');
  }
}

// ─── Get Podcast Episode ──────────────────────────────────────────────────────

async function fetchPodcastEpisodes(spotifyApi, podcastid) {
  const episodes = [];

  console.log(`🎙️  Fetching latest episode from your news podcast`);

  try {
    // Ask Spotify for the most recent episode of this show
    const data = await spotifyApi.getShowEpisodes(podcastid, {
      limit: 1,
      market: 'US', // Required for episode availability
    });

    for (const episode of data.body.items) {
      episodes.push({
        uri: episode.uri,      // Spotify URI like 'spotify:episode:abc123'
        name: episode.name,
        type: 'episode',
      });
      console.log(`    📌 ${episode.name}`);
    }
  } catch (err) {
    // Don't crash if the podcast fails — just warn and continue with the rest
    console.error(`    ⚠️  Failed to fetch your news podcast: ${err.message}`);
  }

  return episodes;
}

// ─── Get Lead-in Track ────────────────────────────────────────────────────────

async function fetchLeadInTrack(spotifyApi, leadIn) {

  console.log(`🎵 Picking one random lead-in track`);

  const accessToken = spotifyApi.getAccessToken();
  let offset = 0;
  let hasMore = true;
  const candidates = [];

  while (hasMore) {
    const data = await spotifyGet(
      `/v1/playlists/${leadIn}/items?limit=100&offset=${offset}&market=FROM_TOKEN`,
      accessToken
    );

    for (const entry of data.items) {
      const track = entry.item;
      // Skip null entries (removed tracks), local tracks, and non-track types (episodes, etc.)
	    if (track && track.type === 'track' && track.uri?.startsWith('spotify:track:') && track.duration_ms && track.is_playable !== false) {
        candidates.push({
          uri: track.uri,
          name: track.name,
          artist: track.artists?.map((a) => a.name).join(', ') || 'Unknown',
          type: 'track',
          source: 'lead-in',
        });
      }
    }

    offset += 100;
    hasMore = offset < data.total;
  }

  if (candidates.length === 0) {
    console.warn('    ⚠️  Lead-in playlist had no playable Spotify tracks — skipping lead-in');
    return null;
  }

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  console.log(`    🎯 ${selected.name} — ${selected.artist}`);
  return selected;
}

// ─── Get Playlist Tracks ──────────────────────────────────────────────────────

async function fetchPlaylistTracks(spotifyApi, playlistId) {
  const tracks = [];
  const accessToken = spotifyApi.getAccessToken();
  let offset = 0;
  let hasMore = true;

  console.log('🎵 Fetching tracks from source playlist...');

  while (hasMore) {
    const data = await spotifyGet(
      `/v1/playlists/${playlistId}/items?limit=100&offset=${offset}&market=FROM_TOKEN`,
      accessToken
    );

    for (const entry of data.items) {
      const track = entry.item;
      // Skip null entries (removed tracks), local tracks, and non-track types (episodes, etc.)
	    if (track && track.type === 'track' && track.uri?.startsWith('spotify:track:') && track.duration_ms && track.is_playable !== false) {
        tracks.push({
          uri: track.uri,
          name: track.name,
          artist: track.artists?.map(a => a.name).join(', ') || 'Unknown',
          duration_ms: track.duration_ms,
        });
      }
    }

    offset += 100;
    hasMore = offset < data.total;
  }

  console.log(`   Found ${tracks.length} tracks (${formatDuration(tracks.reduce((sum, t) => sum + t.duration_ms, 0))} total)`);
  return tracks;
}

// ─── Shuffle Tracks ───────────────────────────────────────────────────────────

function selectTracks(tracks, targetMs) {
  const shuffled = shuffle(tracks);
  const selected = [];
  let totalMs = 0;

  for (const track of shuffled) {
    selected.push(track);
    totalMs += track.duration_ms;
    if (totalMs >= targetMs) break;
  }

  return { selected, totalMs };
}

// ─── Update Playlist ──────────────────────────────────────────────────────────

async function updatePlaylist(spotifyApi, playlistId, items) {
  const uris = items.map(t => t.uri);

  const accessToken = spotifyApi.getAccessToken();

await spotifyPut(
  `/v1/playlists/${playlistId}/items`,
  { uris: uris.slice(0, 100) },
  accessToken
);

for (let i = 100; i < uris.length; i += 100) {
  await spotifyPost(
    `/v1/playlists/${playlistId}/items`,
    { uris: uris.slice(i, i + 100) },
    accessToken
  );
}

  console.log(`\n✅ Playlist updated!`);
  console.log(`   🎵 ${items.length} items`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const config = loadConfig();
  const credentials = loadCredentials();
  const token = loadToken();

  const { variant, buildingMsg } = getVariant(config);

  console.log(buildingMsg,'— Starting run at', new Date().toLocaleString(),'\n');
  console.log('─'.repeat(50));

  const spotifyApi = new SpotifyWebApi({
    clientId: credentials.spotify.client_id,
    clientSecret: credentials.spotify.client_secret,
    redirectUri: credentials.spotify.redirect_uri,
  });

  spotifyApi.setAccessToken(token.access_token);
  spotifyApi.setRefreshToken(token.refresh_token);

  await refreshTokenIfNeeded(spotifyApi, token);

  if (!variant.source_id) {
    console.error('❌ Please set source_id in config.yaml');
    process.exit(1);
  }
  if (!variant.target_id) {
    console.error('❌ Please set target_id in config.yaml');
    process.exit(1);
  }
  if (PODCAST_ONLY && !variant.news_id) {
    console.error('❌ Please set news_id in config.yaml');
    process.exit(1);
  }
  
  let episodes = [];
  if (variant.news_id) {
    episodes = await fetchPodcastEpisodes(spotifyApi, variant.news_id);
  }

  let finalSelected = [];
  if (!PODCAST_ONLY) {
    let leadtrack = null;
    if (variant.lead_id) {
      leadtrack = await fetchLeadInTrack(spotifyApi, variant.lead_id);
    }

    const tracks = await fetchPlaylistTracks(spotifyApi, variant.source_id);

    if (tracks.length === 0) {
      console.error('❌ No tracks found in source playlist. Check source_id in config.yaml.');
      process.exit(1);
    }

    const targetMinutes = variant.minutes || 120;
    const targetMs = targetMinutes * 60 * 1000;

    console.log(`\n🔀 Selecting ~${targetMinutes} minutes of music at random...`);
    const { selected, totalMs } = selectTracks(tracks, targetMs);
    console.log(`   Selected ${selected.length} tracks (${formatDuration(totalMs)})`);

    finalSelected = [
      ...(episodes || []),
      ...(leadtrack ? [leadtrack] : []),
      ...selected,
    ];
  } else {
    let existing = await fetchPlaylistTracks(spotifyApi, variant.target_id);
    finalSelected = [
      ...(episodes || []),
      ...existing,
    ];
  }

  if (DRY_RUN) {
    logDryRun(finalSelected);
  } else {
    await updatePlaylist(spotifyApi, variant.target_id, finalSelected);
  }
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  if (err.statusCode === 401 || err.message?.includes('invalid_grant')) {
    console.error('   Your refresh token has expired or is invalid. Run: node setup.js\n');
  }
  process.exit(1);
});
