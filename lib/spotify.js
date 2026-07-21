const { request, sleep, safeParseJSON } = require('./http');

async function spotifyGet(apiPath, accessToken, maxRetries = 3) {
  let errorTxt = 'Spotify request failed after multiple retries.';
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await request({
      hostname: 'api.spotify.com',
      path: apiPath,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + accessToken },
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers['retry-after'] || '5', 10);
      console.log(`⏳ Spotify rate limit hit. Waiting ${retryAfter} second(s) before retry ${attempt}/${maxRetries}...`);
      await sleep((retryAfter + 1) * 1000); // +1 for safety
 	  errorTxt = 'Spotify rate limit persisted after multiple retries.'
      continue;
    }

	if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
	  console.log(`⏳ Spotify temporary error ${res.status}. Retrying ${attempt}/${maxRetries}...`);
	  await sleep(attempt * 2000);
	  errorTxt = 'Spotify ' + res.status + ' error persisted after multiple retries.'
	  continue;
	}

    const parsed = safeParseJSON(res, 'Spotify GET ' + apiPath);

    if (parsed.error) {
      throw new Error('Spotify API error ' + parsed.error.status + ': ' + parsed.error.message);
    }

    return parsed;
  }

  throw new Error(errorTxt);
}

async function spotifyPut(apiPath, body, accessToken, maxRetries = 3) {
  const postData = JSON.stringify(body);
  let errorTxt = 'Spotify request failed after multiple retries.';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
	  const res = await request({
		hostname: 'api.spotify.com',
		path: apiPath,
		method: 'PUT',
		headers: {
		  'Authorization': 'Bearer ' + accessToken,
		  'Content-Type': 'application/json',
		  'Content-Length': Buffer.byteLength(postData),
		},
	  }, postData);
	  
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers['retry-after'] || '5', 10);
      console.log(`⏳ Spotify rate limit hit. Waiting ${retryAfter} second(s) before retry ${attempt}/${maxRetries}...`);
      await sleep((retryAfter + 1) * 1000); // +1 for safety
 	  errorTxt = 'Spotify rate limit persisted after multiple retries.'
     continue;
    }

	if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
	  console.log(`⏳ Spotify temporary error ${res.status}. Retrying ${attempt}/${maxRetries}...`);
	  await sleep(attempt * 2000);
	  errorTxt = 'Spotify ' + res.status + ' error persisted after multiple retries.'
	  continue;
	}
	  
    const parsed = res.raw ? safeParseJSON(res, 'Spotify PUT ' + apiPath) : {};
      
    if (parsed.error) {
        throw new Error('Spotify API error ' + parsed.error.status + ': ' + parsed.error.message);
    }

    return { status: res.status, body: parsed };
  }
  
  throw new Error(errorTxt);
}

async function spotifyPost(apiPath, body, accessToken, maxRetries = 3) {
  const postData = JSON.stringify(body);
  let errorTxt = 'Spotify request failed after multiple retries.';
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await request({
      hostname: 'api.spotify.com',
      path: apiPath,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, postData);
	  
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers['retry-after'] || '5', 10);
      console.log(`⏳ Spotify rate limit hit. Waiting ${retryAfter} second(s) before retry ${attempt}/${maxRetries}...`);
      await sleep((retryAfter + 1) * 1000); // +1 for safety
      errorTxt = 'Spotify rate limit persisted after multiple retries.';
      continue;
    }
	  
 	if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
	  console.log(`⏳ Spotify temporary error ${res.status}. Retrying ${attempt}/${maxRetries}...`);
	  await sleep(attempt * 2000);
	  errorTxt = 'Spotify ' + res.status + ' error persisted after multiple retries.'
	  continue;
	}
	  
   const parsed = res.raw ? safeParseJSON(res, 'Spotify POST ' + apiPath) : {};
    
    if (parsed.error) {
        throw new Error('Spotify API error ' + parsed.error.status + ': ' + parsed.error.message);
    }

    return { status: res.status, body: parsed };
  }

  throw new Error('Spotify rate limit persisted after multiple retries.');
}

function normalizeForMatch(value) {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[-–—_:;,.!?'"`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findExactMatch(items, track) {
  const expectedArtistKey = normalizeForMatch(track.artist);
  const expectedTitleKey = normalizeForMatch(track.name);

  return items.find(item => {
    const artistMatch = item.artists.some(a => normalizeForMatch(a.name) === expectedArtistKey);
    const titleMatch = normalizeForMatch(item.name) === expectedTitleKey;
    return artistMatch && titleMatch;
  });
}

module.exports = {
  spotifyGet,
  spotifyPut,
  spotifyPost,
  normalizeForMatch,
  findExactMatch,
};