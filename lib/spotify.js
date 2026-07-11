const { request, sleep, safeParseJSON } = require('./http');

async function spotifyGet(apiPath, accessToken, maxRetries = 3) {
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
      continue;
    }

    const parsed = safeParseJSON(res, 'Spotify GET ' + apiPath);

    if (parsed.error) {
      throw new Error('Spotify API error ' + parsed.error.status + ': ' + parsed.error.message);
    }

    return parsed;
  }

  throw new Error('Spotify rate limit persisted after multiple retries.');
}

async function spotifyPut(apiPath, body, accessToken, maxRetries = 3) {
  const postData = JSON.stringify(body);
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
      continue;
    }
	  
    const parsed = res.raw ? safeParseJSON(res, 'Spotify PUT ' + apiPath) : {};
      
    if (parsed.error) {
        throw new Error('Spotify API error ' + parsed.error.status + ': ' + parsed.error.message);
    }

    return { status: res.status, body: parsed };
  }
  
  throw new Error('Spotify rate limit persisted after multiple retries.');
}

async function spotifyPost(apiPath, body, accessToken, maxRetries = 3) {
  const postData = JSON.stringify(body);
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

module.exports = {
  spotifyGet,
  spotifyPut,
  spotifyPost,
};
