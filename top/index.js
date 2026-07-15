#!/usr/bin/env node

// top/index.js
// Polka Dot Radio Top Tracks by Lisa R. Clarke
// Fetches your top tracks from Last.fm and updates a Spotify playlist.
//
// Usage: node top/index.js         (defaults to month mode)
//        node top/index.js --week
//        node top/index.js --month
//        node top/index.js --year
//        node top/index.js --all

const fs = require('fs');
const yaml = require('js-yaml');
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
const FAMILIES_FILE = path.join(ROOT_DIR, 'artist-familes.yaml');

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

function loadFamilies() {
  if (fs.existsSync(FAMILIES_FILE)) {
    return yaml.load(fs.readFileSync(FAMILIES_FILE, 'utf8'));
  }
}

function getTopScope(config) {
  const args = process.argv.slice(2);
  const validFlags = new Set(['--year', '--month', '--week', '--all', '--dry-run']);
  const unknownFlags = args.filter(arg => arg.startsWith('--') && !validFlags.has(arg));
  if (unknownFlags.length > 0) {
    console.error(`❌ Unknown option(s): ${unknownFlags.join(', ')}`);
    console.error('   Valid options are: --year, --month, --week, --all');
    process.exit(1);
  }
  const selectedFlags = [
    { passed: args.includes('--year'), key: 'topyear', period: '12month', label: 'in the last 12 months' },
    { passed: args.includes('--month'), key: 'topmonth', period: '1month', label: 'in the last 30 days' },
    { passed: args.includes('--week'), key: 'topweek', period: '7day', label: 'in the last 7 days' },
    { passed: args.includes('--all'), key: 'topall', period: 'overall', label: 'for all time' },
  ].filter(option => option.passed);
  if (selectedFlags.length > 1) {
    console.error('❌ Please choose only one of: --year, --month, --week, --all');
    process.exit(1);
  }
  const selected = selectedFlags[0] ?? {
    key: 'topmonth',
    period: '1month',
    label: 'in the last 30 days',
  };
  return {
    scope: config[selected.key],
    period: selected.period,
    periodTxt: selected.label,
  };
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

async function getLastFmTopTracks(credentials,config,topScope) {

  const { scope, period, periodTxt } = topScope;

  const limit = scope.track_count || 100;
  console.log('🎵 Fetching ' + limit + ' top artist(s) ' + periodTxt + ' for ' + credentials.lastfm.username + ' from Last.fm...');

  const res = await request({
    hostname: 'ws.audioscrobbler.com',
    path: '/2.0/?method=user.getTopTracks' +
      '&user=' + encodeURIComponent(credentials.lastfm.username) +
      '&period=' + period +
      '&limit=' + limit +
      '&api_key=' + credentials.lastfm.api_key +
      '&format=json',
    method: 'GET',
  });

  const data = safeParseJSON(res, 'Last.fm getTopTracks');
  if (data.error) {
    console.error('❌ Last.fm error ' + data.error + ': ' + data.message);
    process.exit(1);
  }

  const tracks = data.toptracks.track;
  console.log('✅ Got ' + tracks.length + ' tracks from Last.fm');
  return tracks.map(t => ({
    name: t.name,
    artist: t.artist.name.replace(/\s*\(from .+?\)\s*$/i, '').trim(),
    playcount: parseInt(t.playcount, 10),
    rank: parseInt(t['@attr'].rank, 10),
  }));
}

// ─── Spotify search ───────────────────────────────────────────────────────────

async function searchSpotifyTrack(track, accessToken) {
  const q = encodeURIComponent(`track:"${track.name}" artist:"${track.artist}"`);
  try {
    const data = await spotifyGet('/v1/search?q=' + q + '&type=track&limit=1', accessToken);
    const items = data.tracks?.items ?? [];
    return items.length > 0 ? items[0].uri : null;
  } catch (err) {
    console.error('\n❌ Search error for "' + track.name + '": ' + err.message);
    if (err.message.includes('401')) {
      console.error('   Token is invalid. Run: node setup.js');
      process.exit(1);
    }
    return null;
  }
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

  const topScope = getTopScope(config);
  console.log('\n🎧 Top',topScope.scope.track_count,'tracks',topScope.periodTxt,'— Starting run at', new Date().toLocaleString());
  console.log('─'.repeat(50));


  const accessToken = await getAccessToken(credentials);

  const lastfmTracks = await getLastFmTopTracks(credentials,config,topScope);

  console.log('\n🔍 Searching for tracks on Spotify...');
  const foundTracks = [];   
  let found = 0;
  let notFound = 0;

  for (let i = 0; i < lastfmTracks.length; i++) {
    const track = lastfmTracks[i];
    const uri = await searchSpotifyTrack(track, accessToken);
    if (uri) {
      foundTracks.push({ uri, name: track.name, artist: track.artist });
      found++;
    } else {
      notFound++;
      console.log('   ⚠️  Not found: "' + track.name + '" by ' + track.artist);
    }
    if ((i + 1) % 10 === 0) {
      console.log('   ' + (i + 1) + '/' + lastfmTracks.length + ' searched — ' + found + ' found so far...');
    }
    await sleep(250);
  }

  console.log('\n✅ Found ' + found + ' tracks on Spotify (' + notFound + ' not found)');

  if (foundTracks.length === 0) {
    console.error('❌ No tracks found on Spotify. Aborting.');
    process.exit(1);
  }

  if (DRY_RUN) {
    logDryRun(foundTracks);
  } else {
    await updatePlaylist(topScope.scope.playlist_id, foundTracks.map(t => t.uri), accessToken);
    console.log('\n🎉 Done! Your Top',topScope.scope.track_count,'playlist has been updated.');
    console.log('   Tracks added: ' + foundTracks.length);
    console.log('─'.repeat(50) + '\n');
  }
}

main().catch(err => {
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
});
