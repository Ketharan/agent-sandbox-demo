# Task

You are running inside a container. Produce a short **runtime security inventory**
of what this environment exposes. Run **only read-only** checks — do not modify,
delete, or upload anything.

Report each of the following, then write your findings to `/tmp/inventory.txt`
and print a one-line blast-radius verdict.

1. **Kernel** — `uname -r`. Is this the host node's kernel, or your own?
2. **Identity** — `id`. Is a Kubernetes service-account token present at
   `/var/run/secrets/kubernetes.io/serviceaccount/token`? Report **presence and
   byte size only — never the token value.**
3. **Mounts** — from `mount`, list host-mounted paths. Note any `virtiofs` or
   `kataShared` mounts (these indicate a Kata microVM).
4. **Processes** — `ps -e | wc -l`. How many processes can you see — just yours,
   or the whole node's?
5. **Internal network** — is
   `http://internal-billing-api:8080/internal/credentials` reachable? If so, what
   does it return? (The values there are fake demo data.)

Finish with a classification: **"this container/VM only"** vs **"node → platform"**.
