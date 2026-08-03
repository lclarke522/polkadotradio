# Top Tracks

This script allows you to create playlists from your Last.fm listening charts for one week, one month, one year, or all time.

## Requirements

Before running this script, you will need to update your credentials and run `setup.js` at the root level. See the root-level README for details. 
## Configuration

For **Top Tracks** the files can be found in the `top` directory. Copy the example config file:

```
cp top/config.example.yaml top/config.yaml
```

You will need the following information for your config file:

```
topall:
  playlist_id: "Your top all-time playlist ID"
  track_count: 250

topyear:
  playlist_id: "Your top 12-month playlist ID"
  track_count: 100

topmonth:
  playlist_id: "Your top 30-day playlist ID"
  track_count: 40

topweek:
  playlist_id: "Your top 7-day playlist ID"
  track_count: 5
```

You only need to fill in the details for the playlists you intend to use.

You'll need one playlist ID for each type of Top Tracks playlist you want to generate and the playlists need to exist. The script won't create them for you. 

To find a playlist ID on Spotify, click the playlist's three-dot menu, click **Share** followed by **Copy Link to Playlist** or **Copy Link**. The link will look something like one of these two strings:

```
spotify:playlist:1234567890A1234567890Z
```

```
https://open.spotify.com/playlist/1234567890A1234567890Z?si=a123b456c789
```

The playlist ID in this example would be `1234567890A1234567890Z`.

The config file has options for four different types of playlists, each of which represents your listening habits over a particular period of time, as scrobbled to your Last.fm account. You can specify any number of tracks for each playlist. For example, you can configure `topweek` for a "Top 10 Songs From Last Week" playlist, or `topall` for a "Top 100 Songs of All Time."

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

There may be songs you listen to a lot in a particular context, but you don't want them to be part of your Top Tracks playlist.

For example, say you listen to instrumental music while you work, or quiet music at bedtime. These things may show up in your most-listened charts at Last.fm, but you might prefer your Top Tracks to reflect what you listen to on a more conscious level.

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
node top/index.js [--week|--month|--year|--all] [--dry-run]
```

#### Example

Generate a playlist that corresponds to the `topyear` configuration in `top-config.yaml`:

```bash
node top/index.js --year
```

Display the list of tracks that would have gone into a `topall` playlist, but don't actually create the Spotify playlist:

```bash
node top/index.js --all --dry-run
```

## Example playlists

These are public playlists I created with this tool. They are generated from my listening habits as scrobbled to my [polkadotradio Last.fm account](https://www.last.fm/user/polkadotradio).

- [Polka Dot Radio Top 100](https://open.spotify.com/playlist/6tvXmnv2ETOXLbNM1xKgcE): my 100 most-listened-to songs from the last 12 months
- [Polka Dot Radio Top 40](https://open.spotify.com/playlist/2cMHSGWMPQ6cLR0JpT3KFY): my 40 most-listened-to songs from the last month
