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
