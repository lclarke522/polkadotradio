# Loved Artists

This script allows you to create playlists comprised of random songs you've played before from your most-listened to artists.

## Requirements

Before running this script, you will need to update your credentials and run `setup.js` at the root level. See the root-level README for details. 

## Configuration

For **Loved Artists** the working directory is `loves`. Copy the example config file:
```
cp config.example.yaml config.yaml
```

You will need the following information for your config file:
```
loves:
  artist_period: 1month
  top_artist_count: 5
  track_period: overall
  tracks_per_artist: 10
  track_pool_size: 750
  lastfm_page_size: 100
  playlist_id: "your-loves-playlist-id"
  include_artists: []
```

The example above does the following:
- Get your five most-listened-to artists of the past month according to Last.fm
- Get your 750 most-listened-to tracks of all time according to Last.fm
- Pull up to 10 random songs for each of the five artists from the 750 tracks
- Randomize them and save them to a Spotify playlist

If you wanted to also include artists that may not be in your top five, you could specify them under `include_artists`, like so:
```
  include_artists:
    - "The Eagles"
    - "Duran Duran"
```

You'll need a playlist ID for the playlist you want to generate and it needs to exist. The script won't create it for you. 
To find a playlist ID on Spotify, click the playlist's three-dot menu, click **Share** followed by **Copy Link to Playlist** or **Copy Link**. The link will look something like one of these two strings:
```
spotify:playlist:1234567890A1234567890Z
```

```
https://open.spotify.com/playlist/1234567890A1234567890Z?si=a123b456c789
```

The playlist ID in this example would be `1234567890A1234567890Z`.
### Artist Families

Artist families is an optional configuration that lets you group different artists together into families. It's a way of telling the script, "when this artist is a top artist, also include tracks by that other artist."

Here is an example `family-config.yaml`:
```
families:
  - display_name: "the Neil Finn family"
    members:
      - "Crowded House"
      - "Neil Finn"
      - "Finn Brothers"
      - "Split Enz"
  - display_name: "the Toad the Wet Sprocket family"
    members:
      - "Toad the Wet Sprocket"
      - "Glen Phillips"
```

With this configuration, if one of your top artists is discovered to be Split Enz, then when tracks are selected, Crowded House, Neil Finn, and Finn Brothers tracks will also be considered.

This allows you to expand the depth of the resulting playlist. Sometimes you like the music of a solo artist just as much as the music from the band that they are from, but that solo artist may not end up in your top artists as often as their band does. By grouping the solo artist and their band into an Artist Family, you can include both together in your generated playlist.

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

There may be songs you listen to a lot in a particular context, but you don't want them to be part of your Loved Artists playlist.

For example, say you listen to instrumental music while you work, or quiet music at bedtime. These things may show up in your most-listened charts at Last.fm, but they're not appropriate for a playlist full of songs you love.

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
node loves/index.js [--dry-run] [--config <config-file>]
```

#### Examples

Display the list of tracks that would have gone into the playlist, but don't actually invoke Spotify's API:
```bash
node loves/index.js --dry-run
```

Create a config file called `concert-config.yaml` and add every artist performing at an upcoming music festival to `include_artists`. Then run the script using that config file so you have a pre-concert playlist to listen to in the car on the way there:
```bash
node loves/index.js --config --concert-config.yaml
```

## Example playlist

This is a public playlist I created with this tool. It is generated from my listening habits as scrobbled to my [polkadotradio Last.fm account](https://www.last.fm/user/polkadotradio). The description below is valid as of this writing, but I often play around with the configuration.
- [Loves](https://open.spotify.com/playlist/7LtLRKSITBGVQe4SUUMBiw): five tracks each (pulled from my 2500 all-time most-played tracks) by my top ten artists of the last month and potentially their "family" members