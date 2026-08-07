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

## Optional second slide — regular vs sandbox at a glance

| | Regular Service | Agent Sandbox |
|---|---|---|
| Kernel | Shared with host | Own guest kernel (Kata microVM) |
| Internal services | Reachable | Blocked by default, explicitly allowlisted |
| Host filesystem / processes | Visible | Not accessible |
| Escape blast radius | Node → platform | One microVM |
| Cost at rest | — | Node pool scales to zero |
| Developer effort | — | Pick a component type |
