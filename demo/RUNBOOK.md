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

There is **no "isolation = none" toggle** — the sandboxed agent type always
expands to a Kata microVM. So the baseline needs its own **ClusterComponentType**:
an unsandboxed twin of the Claude-with-Repo type (same git-clone workspace + agent
CLI, minus the Kata/sandbox scheduling). Author it once:
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

_Resolved: workspace files come from the `git-clone` init container of the
Claude-with-Repo type; the baseline is a separate unsandboxed CCT (no
"isolation = none" toggle)._
