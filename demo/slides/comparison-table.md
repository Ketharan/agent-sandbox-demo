# Slide — What it stops, and what it doesn't (5:30 beat)

Leave this on screen while narrating. The three **No** rows are the point — an
honest security claim survives scrutiny; an oversold one doesn't.

| Nx-style payload step | Sandbox stops it? |
|---|---|
| Scan for host-mounted secrets, node service-account token | **Yes** — own kernel, own filesystem |
| Enumerate host processes, look for escape paths | **Yes** — own guest kernel |
| Reach internal services (lateral movement) | **Yes** — internal is default-deny |
| Read the agent's own workspace and API key | **No** — it's in there with it |
| POST the loot to an attacker's endpoint | **No** — egress is open, by design |
| Kernel escape → compromise the platform | **Yes** — blast radius ends at the microVM |

**One-liner to close on:** the compromise stops being a *platform* compromise. It
becomes one disposable VM.

---

## Second slide — regular vs sandbox, real numbers (captured on EKS)

| | Regular (`agent-regular`) | Agent Sandbox (`agent-sandbox`) |
|---|---|---|
| Kernel (`uname -r`) | **`6.1.177`** (host — Bottlerocket) | **`6.18.35`** (its own guest kernel) |
| Kata/virtiofs mounts | none | present (microVM) |
| SA token | present | absent |
| Read node filesystem | **yes** — `/host` → Bottlerocket | **no** — no `/host` |
| `internal-billing-api` | reachable (creds leak) | unreachable (`ENOTFOUND`) |
| Blast radius | node → platform | this VM only |
| Cost at rest | — | bare-metal scales to zero |
| Developer effort | — | pick a component type |

_Same recon, same image, same cluster — every line flips. Verified on the EKS
recording cluster (`ai-agent-cluster`)._
