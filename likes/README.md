# Daily Playlists

This script allows you to create randomized personal playlists seeded from larger source playlists, optionally starting with a podcast episode and/or a random lead-in track.

## Requirements

Before running this script, you will need to update your credentials and run `setup.js` at the root level. See the root-level README for details. 
## Configuration

For **Daily Playlists** the files can be found in the `daily` directory. Copy the example config file:

```
cp daily/config.example.yaml daily/config.yaml
```

You will need the following information for your config file:

```
morning:
  news_id: ""     # optional, start with the latest episode from a podcast
  lead_id: ""     # optional, start with a random track from a different playlist
  source_id: ""   # source playlist ID - something with energetic songs?
  target_id: ""   # target playlist ID - playlist you created for this purpose
  minutes: 120    # roughly how long the playlist should run
```

`news_id` and `lead_id` may be left blank if you are not using them.

You'll need two playlist IDs: `source_id` and `target_id`. Your source should be a big public playlist that the script will pull random tracks from to populate your target playlist. You don't need to own the source playlist, as long as it is public. You do need to own the target playlist, and it has to exist. The script won't create it for you. 

To find a playlist ID on Spotify, click the playlist's three-dot menu, click **Share** followed by **Copy Link to Playlist** or **Copy Link**. The link will look something like one of these two strings:

```
spotify:playlist:1234567890A1234567890Z
```

```
https://open.spotify.com/playlist/1234567890A1234567890Z?si=a123b456c789
```

The playlist ID in this example would be `1234567890A1234567890Z`.

The config file has options for three different daily playlists, all of which can serve different purposes at different times of the day. For example, the `morning` configuration can be a Morning Coffee playlist that starts with the latest episode from a news podcast and then plays an hour of energetic music. The `afternoon` configuration can be for focus at work, and it can provide a few hours of instrumental music and no news.
## Usage

```bash
node daily/index.js [--morning|--afternoon|--evening] [--podcast-only] [--dry-run]
```

#### Examples

Generate a playlist that corresponds to the `morning` configuration:

```bash
node daily/index.js --morning
```

If you do not specify a time of day, morning is assumed:

```bash
node daily/index.js
```

Generate a playlist that corresponds to the `afternoon` configuration:

```bash
node daily/index.js --afternoon
```

Refresh only the podcast episode of a `morning` playlist generated earlier:

```bash
node daily/index.js --morning --podcast-only
```

Display the list of tracks that would have gone into an `evening` playlist, but don't actually create the Spotify playlist:

```bash
node daily/index.js --evening --dry-run
```

## Example playlists

These are public playlists I created with this tool. They are seeded from my own public playlists, but you can use any source playlists you like.

- [Morning Coffee](https://open.spotify.com/playlist/5lSJicuSBKDKMUInHmHpt5): one hour of music seeded from **Polka Dot Radio Caffeinated**, kicked off with an episode of NPR News Now and a random song from **Morning Music**
- [Afternoon Focus](https://open.spotify.com/playlist/1VKEkNJwPsHafhsAtd1C1G): three hours of music seeded from **Instrumental Work Music**
- [Evening Unwind](https://open.spotify.com/playlist/1FFBFWk1foAonyG4SaZgV4): one hour of music seeded from **Quiet Bedtime Music**