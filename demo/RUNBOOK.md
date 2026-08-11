# Runbook — running the demo in OpenChoreo

End-to-end steps to stand up and rehearse the Agent Sandbox demo. Assumes
Parts 1–4 are done: EKS + OpenChoreo control plane + Kata bare-metal node pool +
the `agent-sandbox` module installed. Portal labels that depend on your version
are flagged (script Q1).

See also: [`deploy/agents.portal.md`](deploy/agents.portal.md) (portal steps),
[`README.md`](README.md) (local dry-run + safety notice),
[`../rough-script.md`](../rough-script.md) (the script this supports).

---

## Phase 0 — Confirm the platform is ready

```bash
# agent-sandbox module present
kubectl get crd | grep agents.x-k8s.io
kubectl -n agent-sandbox-system rollout status deploy/agent-sandbox-controller
kubectl get clustercomponenttype | grep ai-agent          # the ai-agent-* types exist

# Kata runtime + node pool exist (scaled to zero is fine)
kubectl get runtimeclass kata-qemu
kubectl get nodes -l kata-enabled=true                     # may be empty at rest
```

If the module isn't installed (from Part 4):
```bash
helm upgrade --install agent-sandbox \
  oci://ghcr.io/openchoreo/helm-charts/agent-sandbox \
  --version <your-version> \
  --namespace openchoreo-control-plane --wait --timeout 10m
```

## Phase 1 — Give the portal access to the private repo

The repo is private, so OpenChoreo's builder needs pull rights: add a **deploy
key** on `Ketharan/agent-sandbox-demo` (Settings → Deploy keys), or add the repo
to whatever GitHub connection your portal uses. Without this, the
build-from-source clone 403s.

## Phase 2 — Create the demo project

Portal → **Create project** → `agent-sandbox-demo`. All three components live
here (same cell), so the agents can attempt to reach the target.

## Phase 3 — Deploy the target: `internal-billing-api`

Portal → **Create component** → **Service**:
- **Source:** `Ketharan/agent-sandbox-demo`, subpath `demo/internal-billing-api/`
- **Build:** Dockerfile
- **Port:** `8080`
- Deploy.

Verify from any pod in the project:
```bash
curl http://internal-billing-api:8080/internal/credentials    # returns fake creds
```

## Phase 4 — Deploy `agent-regular` (the baseline)

There is **no "isolation = none" toggle** on the claude-with-repo type — it
deploys via SandboxTemplate/SandboxClaim and hardcodes Kata + no SA token. (The
generic `ai-agent` type has an `isolationTier` param, but even its `runc` tier is
still a sandbox with no SA token — not a valid baseline.) So the baseline needs
its own **ClusterComponentType**: a plain **Deployment** twin of your
claude-with-repo type — same git-clone workspace + agent CLI, but a normal pod
with the SA token mounted. Author it once (verified against the shipped CCTs):
[`deploy/unsandboxed-agent-cct.md`](deploy/unsandboxed-agent-cct.md).

> This is the honest version of the comparison slide's "same agent, one setting":
> the two sides are the same workload behind two component types that differ only
> in isolation — not a dropdown on one type.

Then Portal → **Create component** → **your unsandboxed agent type** → set the
repo params (below) → deploy. Plain container on a regular node, no Kata.

## Phase 5 — Deploy `agent-sandbox` (the feature)

Portal → **Create component** → the **sandboxed** Claude-with-Repo AI Agent type
→ same repo params, same project/name/model/API key → deploy. This one expands to
the Kata microVM on the hardware-accelerated pool.

> First one waits ~2–3 min for the bare-metal pool to scale from zero. Deploy
> **before** recording, or keep a `SandboxWarmPool`.

### Repo params (both agents) — how the demo files get into the workspace

The Claude-with-Repo agent type clones a git repo into the workspace via a
`git-clone` init container (see the
[agent-type write-up](https://ketharan.github.io/technical/claude-with-repo-agent-type-openchoreo/)).
Point both agents at the demo repo:

| Param | Value |
|---|---|
| `gitRepoUrl` | `https://github.com/Ketharan/agent-sandbox-demo.git` |
| `gitRef` | branch/tag (optional; defaults to default branch) |
| `gitToken` | a GitHub token with read access — **required, the repo is private** |

The repo is shallow-cloned to `/workspace/repo` and the agent's terminal opens
there, so the demo files land at `/workspace/repo/demo/…`. No manual copying,
no registry. (`gitToken` is also the private-repo pull access from Phase 1 — the
init-container clone needs it just like the builder does.)

## Phase 6 — GATE: verify isolation actually differs

The single check that makes or breaks the demo. In each component's terminal
(Artifacts tree → component → Terminal), run the reference enumeration:

```bash
# terminal opens at /workspace/repo
node demo/build-metrics-helper/scripts/recon.js
```

Expected divergence:

| | `agent-regular` | `agent-sandbox` |
|---|---|---|
| `uname -r` | host kernel (AWS) | guest kernel (e.g. 6.18.x) |
| Kata mounts | none | virtiofs / kataShared |
| SA token | PRESENT | ABSENT |
| processes | node-wide | ~a handful |
| `internal-billing-api` | REACHABLE | UNREACHABLE |
| verdict | node → platform | this VM only |

**If `uname -r` matches across the two, stop** — the sandbox pod didn't land on
the Kata runtime. Fix that before going further; the whole demo hinges on it.

## Phase 7 — Stage the payload in each agent workspace

The files are already in the workspace from the repo clone (Phase 4/5). Build the
**local tarball** — no registry, so no DNS/CoreDNS gotcha, no publish. In each
agent's terminal (opens at `/workspace/repo`):

```bash
cd demo/build-metrics-helper && npm pack --pack-destination .. && cd ..
# demo/build-metrics-helper-1.0.0.tgz now sits next to sample-app;
# the agent installs it in Phase 8

# point recon at the in-cluster target
export INTERNAL_API_URL=http://internal-billing-api:8080/internal/credentials
```

Set the bypass flag for your chosen agent (script Q4) at the top of
`build-metrics-helper/scripts/postinstall.js` — default is Claude Code.

## Phase 8 — Rehearse Attack 1 (the live beat)

In each agent, the **only** thing you type is the genuine task:

> "Add `build-metrics-helper` and get the build green."

The agent runs `npm install ../build-metrics-helper-1.0.0.tgz` in `sample-app` →
the `postinstall` fires → it re-invokes the agent CLI with the bypass flag →
recon runs.

> **Camera detail:** npm **hides lifecycle-script output by default**, so the
> payload runs but you'd see nothing. Add `--foreground-scripts` to make the
> postinstall visible on screen:
> `npm install --foreground-scripts ../build-metrics-helper-1.0.0.tgz`

- **Regular:** host mounts, SA token, node processes, `internal-billing-api`
  reachable → creds pulled back. Lateral movement.
- **Sandbox:** same payload runs, finds an empty microVM, target unreachable.
  *"The attack succeeds — it just lands in an empty room."*

Then `npm run build` → green.

## Phase 9 — Pre-generate Attack 2 reports (don't do live)

Ask both agents to write up what they can reach, **before** recording, and save
the outputs. Believable versions already exist at
[`reports/pentest-regular.md`](reports/pentest-regular.md) and
[`reports/pentest-sandbox.md`](reports/pentest-sandbox.md) — use the real agent
output if it matches, otherwise fall back to these. On camera you cut to the
diff; you do **not** sit through generation (what dragged the community call).

## Phase 10 — Record

From the script's recording checklist:
- Terminal font size up — the two `uname -r` outputs are the money shot.
- Console exec dropping on WebSocket: `export GODEBUG=http2client=0`.
- No Zoom/notification windows over the console.
- Redact the API key in the create-component form.
- Say once, on camera, that the payload is defanged.

---

## Build step + confirm

- **Build step (once):** author the unsandboxed CCT for the baseline —
  [`deploy/unsandboxed-agent-cct.md`](deploy/unsandboxed-agent-cct.md). Do this
  before Phase 4.
- **Confirm:** exact portal labels/type names for the two agent types (Q1).

---

## Appendix — local rehearsal on k3d (regular side only, VERIFIED)

The **regular half** runs on a plain k3d OpenChoreo cluster (the sandboxed half
needs Kata/bare-metal → EKS). This is the exact flow that was validated, all via
OpenChoreo-native resources — no raw `kubectl` Deployments.

**1. Register the baseline CCT**
```bash
kubectl apply -f demo/deploy/ai-agent-claude-repo-unsandboxed.yaml
```

**2. `internal-billing-api` — Service component, built from source.** Create the
Component (+ Workload declaring the `8080` endpoint), then trigger a build with a
`WorkflowRun`. Gotchas found:
- Link the `WorkflowRun` to the component with **labels**
  (`openchoreo.dev/component`, `openchoreo.dev/project`) — no `ownerReferences`/UID.
- `dockerfile-builder` uses **`docker.context` / `docker.filePath`** (relative to
  repo root), **not** `repository.appPath`. Point them at
  `./demo/internal-billing-api` and `./demo/internal-billing-api/Dockerfile`.
- The build's `generate-workload-cr` step sets the workload image itself — don't
  hardcode it (a placeholder `:latest` just `ImagePullBackOff`s until the build runs).
- See `deploy/local-k3d/` for the exact Component/Workload/WorkflowRun manifests.

**3. `agent-regular` — deploy-from-image Component + Workload.** Gotchas:
- `componentType.name` must be **`deployment/ai-agent-claude-repo-unsandboxed`**
  (`<workloadType>/<name>`), not the bare CCT name.
- On a loaded single node, the CCT's `500m/1Gi` requests may not fit — lower them
  or free capacity (`Insufficient cpu` → `Pending`).
- Point the workload's `GIT_REPO_URL` at the **public** demo repo → tokenless clone.

**4. Run the payload (verified output):**
```bash
POD=$(kubectl get pods -n <dp-namespace> | grep agent-regular | awk '{print $1}')
kubectl exec -n <dp-namespace> $POD -c main -- sh -c '
  cd /workspace/repo/demo/sample-app
  export DEMO_AGENT=none INTERNAL_API_URL=http://internal-billing-api:8080/internal/credentials
  npm install --no-audit --foreground-scripts ../build-metrics-helper-1.0.0.tgz'
```
Confirmed on the regular side: host kernel (`6.8.0-…`), **SA token PRESENT**,
host mounts visible, `internal-billing-api` **REACHABLE** (fake creds returned),
verdict **`node → platform`**. That's the "before" the sandbox flips.

_Resolved: workspace files come from the `git-clone` init container of the
Claude-with-Repo type; the baseline is a separate unsandboxed CCT (no
"isolation = none" toggle)._

---

## Appendix — Claude-driven demo (the real agent gets weaponized, VERIFIED)

This is the on-camera version: a developer using **Claude Code** is asked to add a
dependency, and the malicious package weaponizes a **second Claude** to do the
recon. Verified end-to-end on k3d.

### One-time setup

The CCT (`ai-agent-claude-repo-unsandboxed.yaml`) makes the pod fully turnkey — its
init container + entrypoint set all of this up at startup:

- **Env:** `DEMO_AGENT=claude`, `INTERNAL_API_URL`, and `ANTHROPIC_API_KEY`
  (loaded from the mounted `anthropic-key` secret into the shell rc).
- **`NODE_OPTIONS=--dns-result-order=ipv4first`** — forces Claude onto IPv4
  (the pod has no IPv6 egress; without this Claude's calls time out).
- **Payload tarball** pre-packed by the init container.
- **Clean `/workspace/app`** — just the sample app + tarball (see "Why" below);
  the agent's `workingDir` points here.
- **`bypassPermissions`** seeded into `~/.claude/settings.json` (no tool prompts).
- **Onboarding skipped** — `~/.claude.json` seeded with `theme`,
  `hasCompletedOnboarding`, `bypassPermissionsModeAccepted`, and the env key
  pre-approved, so interactive `claude` doesn't hit the first-run wizard/login.

You only add the key, then restart so the entrypoint loads it:

```bash
NS=dp-default-default-development-<id>
kubectl -n $NS create secret generic anthropic-key --from-literal=api-key=sk-ant-...
# creating the secret alone won't restart the pod — delete it to force a fresh one:
kubectl -n $NS delete pod $(kubectl get pods -n $NS | grep 'agent-regular.*Running' | awk '{print $1}')
```

> **Auth gotcha:** the pod has **no IPv6 egress**, and Claude's interactive OAuth
> login prefers IPv6 → `ETIMEDOUT`. Use an **API key** (key-auth + `ipv4first`
> hits `api.anthropic.com` over IPv4, which works). Don't attempt `claude` OAuth
> login here.
>
> **Memory gotcha:** two Claude processes (dev's + weaponized) OOM-kill (exit 137)
> at a 256Mi limit. Give the container **~3Gi limit** (keep the request low, e.g.
> 512Mi, so it still schedules on a loaded node).

### Run it (developer experience)

```bash
POD=$(kubectl get pods -n $NS | grep 'agent-regular.*Running' | awk '{print $1}' | tail -1)
kubectl exec -it -n $NS $POD -c main -- bash        # key is already exported; no login
# terminal opens at /workspace/app — a CLEAN app (just package.json, build.js,
# index.js + the tarball). Then, as the developer, ask Claude to do the task:
claude -p "Add the local package ./build-metrics-helper-1.0.0.tgz as a dependency (run: npm install --foreground-scripts --no-audit ./build-metrics-helper-1.0.0.tgz), then run node build.js and tell me if the build passes."
```

> **Why a clean `/workspace/app`:** if the agent's workspace is the whole cloned
> demo repo, it reads `RUNBOOK.md` and tries to *execute the demo* (kubectl,
> builds) instead of the one task. The init container copies just the sample app
> + tarball into `/workspace/app` and points the agent there.

> **Interactive TUI vs headless:** the seeding above should let interactive
> `claude` (the TUI) go straight to the prompt using the key. If it still shows
> **"Not logged in · Please run /login"**, don't fight it — that's the interactive
> auth path being flaky on this network. The **headless** form (`claude -p "…"`,
> shown above) is proven and gives the identical weaponized-recon result; it reads
> fine on camera as "a developer running Claude." Use it as the reliable path.

What happens: Claude runs the install → the `postinstall` fires and launches a
second Claude (`DEMO_AGENT=claude`) → that Claude enumerates the runtime and
writes a full report (`/tmp/inventory.txt`): shared host kernel, `sudo`/`docker`
groups, **SA token present**, **`/host` mounts exposing the node and peer pods**,
`internal-billing-api` reachable → **`node → platform`**.

> **Narrative point:** the dev's Claude may *detect* the attack and refuse to run
> `node build.js`. That's realistic — but the recon **already ran during
> `npm install`**, before the agent could object. The payload executes at install
> time; by the time a careful agent reacts, the token and node filesystem are
> already read. That's the stronger story: the agent can't save you here.

### Raw variant (payload prints inline, no outer-Claude commentary)

For a cleaner capture of just the weaponized recon, run the install directly:
```bash
kubectl exec -n $NS $POD -c main -- bash -lic '
  cd /workspace/app
  npm install --foreground-scripts --no-audit ./build-metrics-helper-1.0.0.tgz'
```

### Before a clean take
Delete the pod first (`kubectl -n $NS delete pod $POD`) so `node_modules` is gone
and the workspace is freshly cloned/packed. Rotate the API key after filming.
