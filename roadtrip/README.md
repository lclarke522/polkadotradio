# Road Trip Radio

This script allows you to create a master playlist, seeded from a number of playlists provided by travelers in your party. Everybody gets to hear something they like.

## Requirements

Before running this script, you will need to update your credentials and run `setup.js` at the root level. See the root-level README for details. 

## Configuration

For **Road Trip Radio** the working directory is `roadtrip`. Copy the example config file:
```
cp config.example.yaml config.yaml
```

You will need the following information for your config file:
```
trip_duration_minutes: 480
destination_playlist_id: "spotify_playlist_id_here"

travelers:
  - name: Mom
    source_type: spotify
    source: "spotify_playlist_id_here"
  - name: Dad
    source_type: m3u
    source: "./sources/dad.m3u"
  - name: Brother
    source_type: text
    source: "./sources/brother.txt"
  - name: Sister
    source_type: text
    source: "./sources/sister.txt"
```

The example above does the following:
- Collect tracks from Mom's Spotify playlist, Dad's m3u playlist, and two kids' text-based playlists
- Remove any duplicates from the combined list of tracks
- Randomly select 120 minutes-worth (that's the trip duration of 480 divided by the 4 travelers) of music from each traveler's list
- Shuffle the tracks and add them to a Spotify playlist

You'll need a playlist ID for the playlist you want to generate and it needs to exist. The script won't create it for you. 
To find a playlist ID on Spotify, click the playlist's three-dot menu, click **Share** followed by **Copy Link to Playlist** or **Copy Link**. The link will look something like one of these two strings:
```
spotify:playlist:1234567890A1234567890Z
```

```
https://open.spotify.com/playlist/1234567890A1234567890Z?si=a123b456c789
```

The playlist ID in this example would be `1234567890A1234567890Z`.

## Source Types

The easiest route is if everyone uses a Spotify playlist. One wrinkle is that the playlist must either belong to you, or you must be named as a collaborator on it. You can't use other Spotify users' playlists, even if they are public. It's a Spotify API limitation.

You may use the standard playlist format `.m3u` for travelers who don't have Spotify accounts. 

Or you may use a `.txt` file, where the tracks are listed one-per-line, in the format `Track Name - Artist`.

If you use either of these latter two formats, the script will search Spotify for each track listed in the file, to be sure it exists. This search happens _before_ the final track selection, so be aware that if you have many travelers and they have many tracks in their playlists, you could run into Spotify rate-limiting issues.

Using Spotify playlists throughout mitigates this risk.

## Usage

```bash
node roadtrip/index.js [--dry-run] [--config <config-file>]
```

#### Examples

Display the list of tracks that would have gone into the playlist, but don't actually invoke Spotify's API:
```bash
node roadtrip/index.js --dry-run
```

Create a playlist for the travelers going on a beach trip:
```bash
node roadtrip/index.js --config beachtrip-config.yaml
```
