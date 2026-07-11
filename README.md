# Polka Dot Radio

Polka Dot Radio is a small collection of personal Spotify automation scripts.

These tools let you:

- build daily-use playlists from larger source playlists
- prepend a news podcast episode or a random lead-in track
- generate Spotify playlists from your Last.fm listening charts

At the moment, the repository includes two main scripts:

- `daily/index.js`: create randomized personal playlists seeded from larger source playlists, optionally starting with a podcast episode and/or a random lead-in track
- `top/index.js`: create playlists from your Last.fm listening charts for one week, one month, one year, or all time

## Requirements

Before using these scripts, you will need:

- Node.js 18 or newer
- a Spotify developer app
- a valid Spotify redirect URI configured in the Spotify developer dashboard
- your Spotify account added to the app’s **User Management** list if the app is still in Development Mode
- a Last.fm API key for `top.js`

Depending on your Spotify app status and account type, some Spotify developer restrictions may apply.

## Installation

Install dependencies in the project directory:

```bash
npm install
```

## Configuration

This repository uses separate config files for different scripts.

### credentials.yaml

In the root directory, this file is shared by all apps.

It contains:
- Spotify credentials
- optional Last.fm credentials

### `daily/config.yaml`

Used by `daily/index.js`.

This file controls things like:

- source playlists
- target playlists
- playlist durations
- optional lead-in playlists
- optional podcast/news source

### `top/config.yaml`

Used by `top/index.js`.

This file controls things like:

- Spotify target playlists
- track counts for week / month / year / all-time charts

## Before you begin

Copy the example config file for the app you wish to use. For example:

```bash
cp daily/config.example.yaml daily/config.yaml
```

Fill in the relevent details.

## Authentication setup

Copy the example credentials file:

```bash
cp credentials.example.yaml credentials.yaml
```

Fill in your Spotify credentials and Last.fm credentials as appropriate.

Run `setup.js`:

```bash
node setup.js
```

Both apps in the `polkadotradio` directory share the same Spotify authentication flow, so if they use the same Spotify app credentials, you generally only need to run setup once.

### Notes

- `setup.js` creates a local `.spotify-token.json` file
- do **not** commit `.spotify-token.json` to GitHub
- Spotify refresh tokens now expire after 6 months, so you may need to rerun setup periodically

## Usage

### `daily.js`

```bash
node daily/index.js [--morning|--afternoon|--evening] [--podcast-only]
```

#### Examples

Generate a playlist that corresponds to the Morning Coffee configuration in `daily-config.yaml`:

```bash
node daily/index.js --morning
```

Current behavior also allows:

```bash
node daily/index.js
```

to default to the morning configuration.

Generate a playlist that corresponds to the Afternoon Focus configuration in `daily-config.yaml`:

```bash
node daily/index.js --afternoon
```

Refresh only the podcast episode of a Morning Coffee playlist generated earlier:

```bash
node daily/index.js --morning --podcast-only
```

### `top.js`

```bash
node top/index.js [--week|--month|--year|--all]
```

#### Example

Generate a playlist that corresponds to the Year configuration in `top-config.yaml`:

```bash
node top/index.js --year
```

## Example playlists

These are public playlists I created with this tool.

### Daily playlists

These are seeded from my own public playlists, but you can use any source playlists you like.

- [Morning Coffee](https://open.spotify.com/playlist/5lSJicuSBKDKMUInHmHpt5): one hour of music seeded from **Polka Dot Radio Caffeinated**, kicked off with an episode of NPR News Now and a random song from **Morning Music**
- [Afternoon Focus](https://open.spotify.com/playlist/1VKEkNJwPsHafhsAtd1C1G): three hours of music seeded from **Instrumental Work Music**
- [Evening Unwind](https://open.spotify.com/playlist/1FFBFWk1foAonyG4SaZgV4): one hour of music seeded from **Quiet Bedtime Music**

### Last.fm chart playlists

These are generated from my listening habits as scrobbled to Last.fm.

- [Polka Dot Radio Top 100](https://open.spotify.com/playlist/6tvXmnv2ETOXLbNM1xKgcE): my 100 most-listened-to songs from the last 12 months
- [Polka Dot Radio Top 40](https://open.spotify.com/playlist/2cMHSGWMPQ6cLR0JpT3KFY): my 40 most-listened-to songs from the last month

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