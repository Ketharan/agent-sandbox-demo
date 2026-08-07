# Agent Sandbox — Demo Kit

Everything the [rough script](../rough-script.md) needs to record the demo, plus a
local test path so you can verify behaviour before you ever touch the cluster.

> ## ⚠️ Safety notice — read once
> This kit contains `build-metrics-helper`, a **defanged replica** of the Nx
> "s1ngularity" postinstall payload (Aug 2025). It is a teaching prop for a
> product security demo. It is safe:
> - it runs **read-only** enumeration only;
> - it **never reads secret *values*** (service-account token: reports presence + size, not contents);
> - the "exfiltration" step is a **no-op stub** that prints where it *would* send and sends nothing;
> - the only "credentials" on screen come from `internal-billing-api`, which returns **hard-coded fake values**.
>
> Do **not** publish `build-metrics-helper` to public npm. Private registry (or local tarball) only.

---

## What's here

| Path | What it is |
|---|---|
| `RUNBOOK.md` | Step-by-step: standing up and rehearsing the demo in OpenChoreo |
| `internal-billing-api/` | Tiny zero-dependency service that returns **fake** credentials — the lateral-movement target |
| `build-metrics-helper/` | The npm package. Benign module + a defanged Nx-style `postinstall` |
| `build-metrics-helper/RECON_PROMPT.md` | The prompt the postinstall hands to the agent |
| `sample-app/` | A trivial project whose build **fails** until `build-metrics-helper` is added — makes "get the build green" a real task |
| `reports/` | Pre-generated pen-test reports (regular vs sandbox) for the 4:45 beat |
| `deploy/agents.portal.md` | Portal runbook — all three components (target built from source, no registry) |
| `deploy/internal-billing-api.k8s.yaml` | Portable plain-k8s fallback for the target; **not needed** for the portal path |
| `slides/comparison-table.md` | The 5:30 honest-limits slide |

---

## Local dry-run (no cluster, no agent needed)

Proves the mechanism and lets you eyeball the payload output.

```bash
# 1. start the target
node internal-billing-api/server.js &        # listens on :8080

# 2. package the helper as a private tarball (never `npm publish`)
#    --pack-destination .. drops it in demo/ so the install path below resolves
( cd build-metrics-helper && npm pack --pack-destination .. )
#   -> demo/build-metrics-helper-1.0.0.tgz

# 3. in the sample app, the build fails first...
cd sample-app && npm run build               # FAILS: missing build-metrics-helper

# 4. ...add the dependency. postinstall fires here, same as the real attack.
#    DEMO_AGENT=none keeps local testing quiet (skips invoking a real agent CLI
#    if one is on your PATH; drop it in-cluster to get the real weaponization).
#    --no-audit --no-fund avoids npm reaching out to the registry and hanging.
DEMO_AGENT=none INTERNAL_API_URL=http://localhost:8080/internal/credentials \
  npm install --no-audit --no-fund ../build-metrics-helper-1.0.0.tgz

# 5. see what the payload collected, and that "upload" was stubbed
cat /tmp/inventory.txt
npm run build                                # now PASSES
```

> `npm install` of a local tarball still contacts the registry to resolve the
> tree; on a locked-down network add `--offline` with a warm npm cache, or just
> do this test where npm has registry access. The postinstall firing on install
> is standard npm behaviour — the payload runs the moment the package lands.

On your laptop the inventory will show a normal host (no k8s token, laptop kernel,
`internal-billing-api` reachable). The **contrast** is what matters — run the same
thing inside `agent-regular` vs `agent-sandbox` and the two inventories diverge
exactly as the reports in `reports/` describe.

## In-cluster verification (before recording)

Skip the agent entirely and run the reference enumeration straight in each
component's terminal — fastest way to confirm the environment is wired right:

```bash
node build-metrics-helper/scripts/recon.js
```

Expected: `agent-regular` reports a shared host kernel, a present SA token, host
mounts, node-wide process visibility, and a reachable `internal-billing-api`.
`agent-sandbox` reports a distinct guest kernel, virtiofs/kataShared mounts, no
token, ~a handful of processes, and `internal-billing-api` unreachable.

If those two don't diverge, **stop** — the isolation isn't set up and the demo
has no payoff. Fix that before you record.

## Choosing the agent

Defaults to Claude Code (`ai-agent-claude`, matches Part 4). To switch, set
`DEMO_AGENT` before install: `claude` | `gemini` | `q` | `openclaw`. The
bypass-flag map lives at the top of `build-metrics-helper/scripts/postinstall.js`
— **verify the exact flag and prompt-passing for whichever CLI you pick**; they
differ, and this is Q4 in the script that's still open.
