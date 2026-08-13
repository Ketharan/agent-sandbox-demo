# Recording runbook — EKS (the real cluster)

Turnkey filming steps for `ai-agent-cluster` (us-east-1). This is where the
**sandboxed** side is real (Kata microVM on bare metal) — record here, not k3d.

## Live endpoints (this cluster)

- **Console:** https://console.openchoreo.3-94-2-155.nip.io
- **API:** https://api.openchoreo.3-94-2-155.nip.io
- **Apps domain (data plane):** `apps.openchoreo.34-204-125-52.nip.io`
- **Login:** `admin@openchoreo.dev` / `Admin@123`
- Self-signed nip.io certs → browser warns; expected. (nip.io domains are tied to
  the NLB IPs — if an NLB is recreated the domain changes; re-derive before a shoot.)

> `kubectl` context: `ketharan@wso2.com@ai-agent-cluster.us-east-1.eksctl.io`
> (`export AWS_PROFILE=Admin-Access-447777059444 AWS_REGION=us-east-1`; if the SSO
> session expired, `aws sso login --profile Admin-Access-447777059444`).

## The three components (already deployed)

| Component | Type | Where it runs |
|---|---|---|
| `agent-regular` | `deployment/ai-agent-claude-repo-unsandboxed` | Auto Mode node (plain container) |
| `agent-sandbox` | `proxy/ai-agent-claude-repo` | Kata microVM on `c6g.metal` |
| `internal-billing-api` | `deployment/service` | Auto Mode node (the target) |

Namespace for the running pods: `dp-default-default-development-f8e58905`.

## Pre-flight (before you hit record)

```bash
export AWS_PROFILE=Admin-Access-447777059444 AWS_REGION=us-east-1
NS=dp-default-default-development-f8e58905
# 1) Bring the sandbox up (boots the c6g.metal — ~2-3 min). See cost note below.
bash demo/deploy/eks/sandbox-updown.sh up
# 2) Confirm all three are Running
kubectl get pods -n $NS | grep -E 'agent-regular|agent-sandbox|internal-billing'
# 3) Confirm the target answers
kubectl exec -n $NS $(kubectl get po -n $NS|grep agent-regular|awk '{print $1}'|head -1) -c main -- \
  sh -lc 'curl -s http://internal-billing-api:8080/internal/credentials | head -3'
```

## Filming sequence

**Hook (0:00–0:50)** — the two real incidents (Nx, Cline). Pre-made lower-thirds;
no terminal.

**Context (0:50–2:00)** — the one diagram (`slides/` + the visual artifact).

**Demo (2:00–6:15):**

1. **Portal beat** — console → login → **Create component → AI Agent**. Show that
   the same flow offers `ai-agent-claude-repo` (sandboxed) vs the unsandboxed
   baseline; the only difference is the component type. (Components are already
   created, so you can also just show them in the catalog.)

2. **The money shot — same command, two kernels.** Two terminals side by side
   (Artifacts → component → Terminal, or `kubectl exec`):
   ```bash
   # regular
   kubectl exec -n $NS <agent-regular-pod> -c main -- uname -r      # 6.1.177  (host, Bottlerocket)
   # sandbox
   kubectl exec -n $NS <agent-sandbox-pod> -c main -- uname -r      # 6.18.35  (its own guest kernel)
   ```

3. **The attack, both sides** — run the recon (or the weaponized-Claude task) in
   each. Verified EKS output:

   | Check | `agent-regular` | `agent-sandbox` |
   |---|---|---|
   | Kernel | `6.1.177` (host — Bottlerocket) | `6.18.35` (guest) |
   | Kata/virtiofs mounts | no | **yes** |
   | SA token | **PRESENT** | **ABSENT** |
   | Read node filesystem | **YES** (`/host` → Bottlerocket) | **no** |
   | `internal-billing-api` | **REACHABLE** (creds leak) | **UNREACHABLE** |
   | Blast radius | **node → platform** | **this VM only** |

   Regular-side recon command:
   ```bash
   kubectl exec -n $NS <agent-regular-pod> -c main -- sh -lc '
     cd /workspace/repo/demo && INTERNAL_API_URL=http://internal-billing-api:8080/internal/credentials \
       node build-metrics-helper/scripts/recon.js'
   ```
   Sandbox-side: same, on `<agent-sandbox-pod>`.

   For the **weaponized-Claude** take (developer experience), see the
   Claude-driven appendix in `RUNBOOK.md` (login is already skipped + key mounted
   on the regular agent).

**Wrap (6:15–6:45)** — recap, the SandboxWarmPool cold-start tip, CTA.

## After the shoot — kill the bare-metal cost

```bash
bash demo/deploy/eks/sandbox-updown.sh down     # deletes agent-sandbox → c6g.metal scales to 0 (~10 min)
```
The `c6g.metal` bills ~$2.18/hr **only while `agent-sandbox` exists**. Everything
else (control/data/workflow planes, NLBs, Auto Mode) is the ~$0.15/hr baseline.

## Full teardown (when the video is done)

```bash
eksctl delete cluster --name ai-agent-cluster --region us-east-1   # removes VPC/NLBs too
aws iam delete-role --role-name KataNodeRole            # after detaching policies
aws iam delete-role --role-name KataClusterAutoscalerRole
```
