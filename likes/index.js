#!/usr/bin/env node

// likes/index.js
// Polka Dot Radio Save Spotify Likes by Lisa R. Clarke
// Builds a JSON file containing every song "liked" on Spotify. The file can be
// used by the other scripts to build playlists containing only liked tracks.
//
// Usage:  node likes/index.js 

const fs = require('fs');
const yaml = require('js-yaml');
const SpotifyWebApi = require('spotify-web-api-node');
const path = require('path');
const { safeParseJSON, request, sleep } = require('../lib/http');
const { spotifyGet, loadTrackCache, saveTrackCache, trackCacheKey } = require('../lib/spotify');

// ─── Config ───────────────────────────────────────────────────────────────────

const APP_DIR = __dirname;
const ROOT_DIR = path.resolve(__dirname, '..');

const CREDENTIALS_FILE = path.join(ROOT_DIR, 'credentials.yaml');
const TOKEN_FILE = path.join(ROOT_DIR, '.spotify-token.json');
const TRACK_LIKED_FILE = path.join(ROOT_DIR, '.spotify-track-liked.json');

const REBUILD = process.argv.includes('--rebuild');

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    console.error('❌ credentials.yaml not found! Run: cp credentials.example.yaml credentials.yaml');
    process.exit(1);
  }
  return yaml.load(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
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

// ─── Get Liked Tracks ─────────────────────────────────────────────────────────

function validateConfig(config) {
  const args = process.argv.slice(2);
  const validFlags = new Set(['--rebuild']);
  const unknownFlags = args.filter(arg => arg.startsWith('--') && !validFlags.has(arg));

  const errors = [];

  if (unknownFlags.length > 0) {
    errors.push(`❌ Unknown option(s): ${unknownFlags.join(', ')}`);
    errors.push('   Only valid flag is: --rebuild');
  }

  if (errors.length > 0) {
    console.error('❌ Config validation failed:');
    errors.forEach(e => console.error('   - ' + e));
    process.exit(1);
  }
  
}

async function fetchLikedTracks(spotifyApi) {
  const liked = {};
  const accessToken = spotifyApi.getAccessToken();
  let offset = 0;
  let hasMore = true;

  console.log('🎵 Fetching your liked tracks...');

  while (hasMore) {
    const data = await spotifyGet(
      `/v1/me/tracks?limit=50&offset=${offset}`,
      accessToken
    );

    for (const entry of data.items) {
      const track = entry.track;
      if (!track || !track.uri?.startsWith('spotify:track:')) continue;

      const artist = track.artists?.map(a => a.name).join(' & ') || 'Unknown';
      const key = trackCacheKey({ name: track.name, artist });

      liked[key] = {
        uri: track.uri,
        duration_ms: track.duration_ms,
      };
    }

    offset += 50;
    hasMore = offset < data.total;
  }

  console.log(`   Found ${Object.keys(liked).length} liked tracks`);
  return liked;
}

async function fetchNewLikedTracks(spotifyApi, existingLiked) {
  const newTracks = {};
  const accessToken = spotifyApi.getAccessToken();
  let offset = 0;
  let hasMore = true;
  let foundExisting = false;

  console.log('🎵 Checking for newly liked tracks...');

  while (hasMore && !foundExisting) {
    const data = await spotifyGet(
      `/v1/me/tracks?limit=50&offset=${offset}`,
      accessToken
    );

    for (const entry of data.items) {
      const track = entry.track;
      if (!track || !track.uri?.startsWith('spotify:track:')) continue;

      const artist = track.artists?.map(a => a.name).join(' & ') || 'Unknown';
      const key = trackCacheKey({ name: track.name, artist });

      if (existingLiked[key]) {
        foundExisting = true;
        break; // hit a track we've already cached — everything after this is old
      }

      newTracks[key] = { uri: track.uri, duration_ms: track.duration_ms };
    }

    offset += 50;
    hasMore = offset < data.total;
  }

  console.log(`   Found ${Object.keys(newTracks).length} new liked track(s)`);
  return newTracks;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const credentials = loadCredentials();
  const token = loadToken();

  console.log('🤩 Liked Spotify Tracks — Starting run at', new Date().toLocaleString(),'\n');
  console.log('─'.repeat(50));

  const spotifyApi = new SpotifyWebApi({
    clientId: credentials.spotify.client_id,
    clientSecret: credentials.spotify.client_secret,
    redirectUri: credentials.spotify.redirect_uri,
  });

  spotifyApi.setAccessToken(token.access_token);
  spotifyApi.setRefreshToken(token.refresh_token);

  await refreshTokenIfNeeded(spotifyApi, token);

  let liked;
  if (REBUILD || !fs.existsSync(TRACK_LIKED_FILE)) {
    liked = await fetchLikedTracks(spotifyApi);
  } else {
    const existing = loadTrackCache(TRACK_LIKED_FILE);
    const newTracks = await fetchNewLikedTracks(spotifyApi, existing);
    liked = { ...existing, ...newTracks };
  }
  saveTrackCache(liked, TRACK_LIKED_FILE);
  console.log(`\n✅ Saved ${Object.keys(liked).length} liked tracks to ${TRACK_LIKED_FILE}`);
  
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  if (err.statusCode === 401 || err.message?.includes('invalid_grant')) {
    console.error('   Your refresh token has expired or is invalid. Run: node setup.js\n');
  }
  process.exit(1);
});
