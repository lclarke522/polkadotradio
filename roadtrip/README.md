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

## Cache, Overrides, and Blocking

### Cache
Anything that can reduce reliance on the Spotify API is a good thing. Enter Cache. All of the apps that use Spotify track searching use the root directory file `.spotify-track-cache.json` to keep the relevant information about a track and help us avoid a Spotify search. The file looks like this:

```
{
  "innocence mission|bright as yellow": {
    "uri": "spotify:track:6rbGpy1s1TniuQXsIBaQym",
    "duration_ms": 212573
  },
  "lord huron|bag of bones": {
    "uri": "spotify:track:3mXFTm5tC59wbnLfrQN5BX",
    "duration_ms": 244661
  },
  "silver seas|alaska": {
    "uri": "spotify:track:6nAtCKHpjAWPbsYb1OYAcG",
    "duration_ms": 184852
  }
}
```

If the search key (`innocence mission|bright as yellow`) is found in the cache file, then the Spotify search is skipped for that track and the URL and duration from the cache file are used.

If the search key is not found in the cache file, a Spotify search is performed, and the cache file is updated for the next time.

### Overrides

The `.spotify-track-overrides.json` file is the exact same format at the cache file. If you notice that Spotify repeatedly fails to find a particular track that you know it has in its library, you can add it to the overrides file, so it can be found.

For example, my "Wherever You Are" by Neil Finn scrobbles are misspelled as "Whereever You Are" for some reason. That is never going to be found at Spotify. So I've added this line to the overrides file:

```
  "neil finn|whereever you are": {
    "uri": "spotify:track:5Z8hVdiQobfzd0IHM07qS1",
    "duration_ms": 286000
  }
```

Now I don't need Spotify search since I have the URI for the song.

### Blocking

There may be songs you listen to a lot in a particular context, but you don't want them to be part of your Road Trip Radio playlist.

For example, say you listen to instrumental music while you work, or quiet music at bedtime. These things may show up in your most-listened charts at Last.fm, but they're not appropriate for an energetic road trip sing-along.

Add them to the blocklist.

```
  "guster|donde esta santa claus": {
    "uri": "spotify:track:72rF5P7PbqUUg2yiYpMWEv",
    "duration_ms": 140000
  }
```

I've added "Donde Esta Santa Claus" by Guster to my blocklist, because while I enjoy their version of that song in December, I don't want to hear it in July. I can remove it from the blocklist if I want to at the appropriate time of the year.

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
