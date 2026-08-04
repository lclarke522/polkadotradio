# Setlist Save

This script allows you to create a playlist from one or more Setlist.fm concert set lists.

## Requirements

Before running this script, you will need to update your credentials and run `setup.js` at the root level. See the root-level README for details. 

## Configuration

For **Setlist Save** the files can be found in the `setlist` directory. Copy the example config file:

```
cp setlist/config.example.yaml setlist/config.yaml
```

You will need the following information for your config file:

```
target_id: "Playlist ID for your target playlist"
setlists:
  - display_name: "Description of the Concert"
    setlist_id: "ID for your source setlist"
```

You'll need one playlist ID for the playlist you want to generate and the playlist needs to exist. The script won't create it for you. 

To find a playlist ID on Spotify, click the playlist's three-dot menu, click **Share** followed by **Copy Link to Playlist** or **Copy Link**. The link will look something like one of these two strings:

```
spotify:playlist:1234567890A1234567890Z
```

```
https://open.spotify.com/playlist/1234567890A1234567890Z?si=a123b456c789
```

The playlist ID in this example would be `1234567890A1234567890Z`.

To find a Setlist.fm setlist ID, look at the URL of the setlist. It should be something like this:

```
https://www.setlist.fm/setlist/artist/year/venue-12345678.html
```

The ID is the last eight characters of the URL. In this case, `12345678`.

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

Blocking is disabled for this application. Setlists are to be duplicated as accurately as possible, and blocking prevents that.

## Usage

```bash
node setlist/index.js [--dry-run]
```

#### Example

Display the list of tracks that would have gone into a playlist, but don't actually create the Spotify playlist:

```bash
node setlist/index.js --dry-run
```
