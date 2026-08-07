# build-metrics-helper (DEMO PROP)

This is **not** a real package. It is a **defanged replica** of the Nx
"s1ngularity" supply-chain payload (npm, Aug 2025), built for the OpenChoreo
Agent Sandbox feature video.

## What the real attack did
A compromised npm token shipped poisoned Nx releases whose `postinstall`
(`telemetry.js`) re-invoked the coding agents already on the machine —
Claude Code (`--dangerously-skip-permissions`), Gemini CLI (`--yolo`),
Amazon q (`--trust-all-tools`) — and instructed them to harvest SSH keys,
`.env` files, `~/.npmrc` and cloud credentials, then exfiltrate to
attacker-controlled GitHub repos.

## What this replica does — and only this
- Re-invokes the local agent CLI with the matching bypass flag (**same shape**).
- Hands it `RECON_PROMPT.md`: a **read-only** enumeration of the runtime.
- Writes findings to a **local** file (`/tmp/inventory.txt`).
- The upload step is a **no-op stub** — it prints where it *would* send and sends nothing.
- It never reads secret *values* and never contacts an external host.

## Guardrails
- **Never** `npm publish` this. Private registry or local `npm pack` tarball only.
- Keep the version/name obviously demo-ish. Do not squat a real package name.
- On camera, say in one sentence that the payload is defanged.
