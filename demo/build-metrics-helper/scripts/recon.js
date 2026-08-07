#!/usr/bin/env node
'use strict';
/*
 * recon.js — reference runtime enumeration (DEFANGED, read-only)
 * ---------------------------------------------------------------------------
 * This is what the RECON_PROMPT asks the agent to do, implemented directly so
 * you can (a) test the mechanism without an agent and (b) verify the isolation
 * difference in each component's terminal before recording:  `node recon.js`
 *
 * Read-only. Reports the SA-token's presence and size but NEVER its value.
 * Writes /tmp/inventory.txt. The "upload" is a stub that sends nothing.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');

const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ||
  'http://internal-billing-api:8080/internal/credentials';
const SA_TOKEN = '/var/run/secrets/kubernetes.io/serviceaccount/token';

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return '(unavailable)'; }
}

function httpGet(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ ok: true, status: res.statusCode, body }));
      });
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
      req.on('error', (e) => resolve({ ok: false, error: e.code || e.message }));
    } catch (e) { resolve({ ok: false, error: e.message }); }
  });
}

async function main() {
  const kernel = sh('uname -r');
  const identity = sh('id');

  let saToken = 'ABSENT';
  try {
    if (fs.existsSync(SA_TOKEN)) saToken = `PRESENT (${fs.statSync(SA_TOKEN).size} bytes) — value NOT read`;
  } catch { /* ignore */ }

  const mounts = sh('mount');
  const kataMount = /virtiofs|kataShared/i.test(mounts) ? 'yes (Kata microVM indicator)' : 'no';
  const hostMounts = mounts.split('\n').filter((l) => /\/host|hostpath|\/var\/log|\/proc\/sys/i.test(l));
  const procCount = sh("ps -e | wc -l").replace(/\D/g, '') || '(unavailable)';

  const net = await httpGet(INTERNAL_API_URL);
  const netLine = net.ok
    ? `REACHABLE (HTTP ${net.status}) — returned ${net.body.length} bytes (fake demo creds)`
    : `UNREACHABLE (${net.error})`;

  const escalates = saToken.startsWith('PRESENT') || hostMounts.length > 0 || net.ok;
  const verdict = escalates ? 'node → platform' : 'this container/VM only';

  const report = [
    '=== runtime inventory (DEMO, read-only) ===',
    `generated: ${new Date().toISOString()}`,
    '',
    `1. kernel (uname -r):        ${kernel}`,
    `2. identity (id):            ${identity}`,
    `   k8s service-account token: ${saToken}`,
    `3. kata/virtiofs mounts:     ${kataMount}`,
    `   host-mounted paths:       ${hostMounts.length} found`,
    ...hostMounts.slice(0, 5).map((l) => `     - ${l}`),
    `4. visible processes:        ${procCount}`,
    `5. internal-billing-api:     ${netLine}`,
    '',
    `BLAST RADIUS: ${verdict}`,
    '',
  ].join('\n');

  console.log(report);

  const outPath = '/tmp/inventory.txt';
  try { fs.writeFileSync(outPath, report); } catch { /* ignore */ }

  // --- exfiltration stub (DISABLED) ---
  console.log(
    `[UPLOAD STUB] would POST ${outPath} to https://collector.invalid/ingest ` +
    `— DISABLED in demo build, nothing was sent.`
  );
}

main();
