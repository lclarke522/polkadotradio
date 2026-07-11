const https = require('https');

function safeParseJSON(res, context) {
  try {
    return JSON.parse(res.raw);
  } catch (e) {
    console.error(
      '\n❌ JSON parse error in [' + context + ']' +
      '\n   HTTP status : ' + res.status +
      '\n   Raw response: ' + String(res.raw).slice(0, 300) +
      (String(res.raw).length > 300 ? '…' : '')
    );
    throw new Error('[' + context + '] Response was not JSON — see raw output above.');
  }
}

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      ...options,
      headers: {
        'User-Agent': 'PolkaDotRadio/1.0 (https://github.com/lclarke522/polkadotradio)',
        ...options.headers, // per-call headers (like Spotify's Authorization) still win
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          raw: data,
          headers: res.headers,
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  safeParseJSON,
  request,
  sleep,
};
