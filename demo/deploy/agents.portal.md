# Deploying the demo components (OpenChoreo portal)

All three components are created through the portal — no manual `docker build`,
no registry, no `kubectl apply`. The isolation *is* the product feature, and the
portal flow is also what the demo shows on camera. Steps below; exact labels
depend on your OpenChoreo version (script Q1 — confirm before recording).

**Prerequisite:** push this `demo/` directory to a git repo the portal can reach
(it builds components from source). All three point at that repo.

## `internal-billing-api` — the target (built from source)
1. Portal → **Create component** → **Service** type.
2. **Source:** the demo repo, subpath `internal-billing-api/`.
3. **Build:** Dockerfile (`internal-billing-api/Dockerfile`) — no image to push,
   OpenChoreo builds it.
4. **Port:** `8080`. Deploy to the demo project.
5. Verify: from any pod in the project,
   `curl http://internal-billing-api:8080/internal/credentials` returns the fake
   creds. This is the endpoint the agents will try to reach.

> The plain-k8s manifest in `internal-billing-api.k8s.yaml` is now just a
> portable fallback — you don't need it for the portal path.

> Both agents are the **same Claude-with-Repo workload** behind two component
> types (there's no "isolation = none" toggle on the sandboxed type). Author the
> unsandboxed twin once — see [`unsandboxed-agent-cct.md`](unsandboxed-agent-cct.md).
> Both get their workspace from the repo clone (`gitRepoUrl`/`gitRef`/`gitToken`).

## `agent-regular` — the baseline
1. Portal → **Create component** → your **unsandboxed** agent type.
2. Same repo params, project, name, model, API key.
3. Deploy. Plain container on a regular node — no Kata.

## `agent-sandbox` — the feature
1. Portal → **Create component** → the **sandboxed** Claude-with-Repo agent type.
2. Same repo params, project, name, model, API key.
3. Deploy. Expands to a Kata microVM, pinned to the hardware-accelerated node
   pool via taints/tolerations — you select no node and write no RuntimeClass.

> First sandboxed agent waits ~2–3 min for the bare-metal pool to scale from
> zero. Pre-deploy before recording, or keep a `SandboxWarmPool`.

## Verify isolation before recording (from Part 4)

```bash
# CRDs + controller
kubectl get crd | grep agents.x-k8s.io
kubectl -n agent-sandbox-system rollout status deploy/agent-sandbox-controller
kubectl get clustercomponenttype | grep ai-agent

# the money shot — different kernels on the same node
kubectl exec <regular-pod> -- uname -r      # host kernel
kubectl exec <sandbox-pod>  -- uname -r      # guest kernel (e.g. 6.18.x)
kubectl exec <sandbox-pod>  -- sh -c 'mount | grep -i kata'   # virtiofs / kataShared
```

If the two `uname -r` outputs match, the sandbox pod didn't land on the Kata
runtime — fix that before you record; the whole demo hinges on this diverging.

## Gotchas (from Part 4)
- WebSocket exec dropping in the console terminal: `export GODEBUG=http2client=0`
- GHCR 403 on the helm pull: `helm registry login ghcr.io` with a GitHub PAT
- Agents needing external DNS: CoreDNS was deferred in Part 3 — confirm resolution works
