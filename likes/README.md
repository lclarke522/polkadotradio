# Spotify Likes

This script allows you to build a JSON file containing every song "liked" on Spotify. The file can be used by the other scripts to build playlists containing only liked tracks.

## Requirements

Before running this script, you will need to update your credentials and run `setup.js` at the root level. See the root-level README for details. 
## Configuration

For **Spotify Likes** the files can be found in the `likes` directory. It does not use a configuration file. 

## Usage

```bash
node likes/index.js [--rebuild]
```

#### Examples

Create or add to an existing root directory `.spotify-track-liked.json` file:

```bash
node likes/index.js
```

Recreate from scratch a new build of the JSON file:

```bash
node likes/index.js --rebuild
```
