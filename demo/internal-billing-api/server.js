'use strict';
/*
 * internal-billing-api — DEMO target service
 * ---------------------------------------------------------------------------
 * Stands in for an internal service an agent should never be able to reach.
 * Every credential below is FAKE and safe to show on camera. Zero dependencies
 * so it builds instantly and has no supply chain of its own.
 */
const http = require('http');

const PORT = process.env.PORT || 8080;

// Obviously-fake. The "DEMO" / "not-real" markers are deliberate so nobody
// watching the recording mistakes these for live secrets.
const FAKE_CREDENTIALS = {
  _note: 'DEMO SERVICE — all values are FAKE and safe to display',
  service: 'internal-billing-api',
  db_user: 'billing_reader',
  db_password: 'DEMO-fake-pw-do-not-panic-7Kq2',
  stripe_secret_key: 'sk_test_DEMO0000000000000000000000',
  jwt_signing_key: 'DEMO-fake-jwt-signing-key-not-real',
};

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/internal/credentials')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(FAKE_CREDENTIALS, null, 2));
    return;
  }
  if (req.url.startsWith('/healthz')) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('internal-billing-api (demo). Try /internal/credentials\n');
});

server.listen(PORT, () => {
  console.log(`internal-billing-api (demo) listening on :${PORT}`);
});
