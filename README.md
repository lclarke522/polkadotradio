# Polka Dot Radio

Polka Dot Radio is a small collection of personal Spotify automation scripts.

These tools let you:

- build daily-use playlists from larger source playlists
- prepend a news podcast episode or a random lead-in track
- generate Spotify playlists from your Last.fm listening charts

At the moment, the repository includes three main scripts:

- `daily/index.js`--**Daily Playlists**: create randomized personal playlists seeded from larger source playlists, optionally starting with a podcast episode and/or a random lead-in track
- `top/index.js`--**Top Tracks**: create playlists from your Last.fm listening charts for one week, one month, one year, or all time
- `loves/index.js`--**Loved Artists**: create playlists comprised of random songs you've played before from your most-listened to artists

## Requirements

Before using these scripts, you will need:

- Node.js 18 or newer
- a Spotify developer app
- a valid Spotify redirect URI configured in the Spotify developer dashboard
- your Spotify account added to the app’s **User Management** list if the app is still in Development Mode
- a Last.fm API key for **Top Tracks** and **Loved Artists**

Depending on your Spotify app status and account type, some Spotify developer restrictions may apply.

## Installation

Install dependencies in the project directory:

```bash
npm install
```

## Configuration

This repository uses separate config files for different scripts. These are covered in the instructions for each script. At the root level, you will need `credentials.yaml`, which is shared by all of the scripts.

It contains:
- Spotify credentials
- optional Last.fm credentials

Copy the example credentials file:

```
cp credentials.example.yaml credentials.yaml
```

Fill in your Spotify credentials and Last.fm credentials as appropriate:

```
spotify:
  client_id: "YOUR_SPOTIFY_CLIENT_ID"
  client_secret: "YOUR_SPOTIFY_CLIENT_SECRET"
  redirect_uri: "http://127.0.0.1:8888/callback"

lastfm:
  api_key: "YOUR_LASTFM_API_KEY"
  username: "YOUR_LASTFM_USERNAME"
```

Run `setup.js` to authenticate your Spotify account:

```bash
node setup.js
```

All apps in the `polkadotradio` directory share the same Spotify authentication flow, so you generally only need to run setup once.

### Notes

- `setup.js` creates a local `.spotify-token.json` file
- do **not** commit `.spotify-token.json` or `credentials.yaml` to GitHub
- Spotify refresh tokens expire after 6 months, so you may need to rerun setup periodically

## Using the scripts

Each script has one mandatory configuration file that you must update before you can run the script. There may also be configuration files for optional features.

Please see the README in each script's directory for specific per-script instructions.

## Troubleshooting

### `429 Too many requests`

Spotify rate-limited the app. The scripts may retry automatically, but very large runs or repeated testing can still trigger delays.

### `invalid_grant`

Your Spotify refresh token has expired. Rerun setup:

```bash
node setup.js
```

depending on which config you are using.

### `Invalid base62 id`

This usually means one of the following:

- a malformed playlist or track ID in the config
- a local-only track or other non-Spotify URI slipped into a source playlist
- a script attempted to write an invalid item into the target playlist

## Known limitations

- These scripts assume reasonably well-formed configs and valid Spotify credentials
- Development Mode Spotify apps may be limited to approved users only
- Spotify refresh tokens now require periodic reauthorization
- Some source playlist items may be skipped if they are unavailable, local-only, or otherwise not playable through the Spotify API

These tools were created for my personal use. I share them here with no guarantees.