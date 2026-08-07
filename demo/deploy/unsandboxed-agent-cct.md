# Authoring the unsandboxed baseline ClusterComponentType

For the demo, `agent-regular` and `agent-sandbox` must be the **same workload**
(same Claude-with-Repo workspace + agent CLI), differing only in isolation. This
was verified against the shipped `agent-sandbox` chart and the base `service`
CCT — see "Why" below; the short version is that the baseline has to be a plain
**Deployment**, not the sandbox type with the Kata fields removed.

## Why (verified against the real CCTs)

- The named agent types (`ai-agent-claude`, and your custom **claude-with-repo**
  built on the same pattern) deploy via **SandboxTemplate + SandboxClaim**, and
  their podTemplate hardcodes `runtimeClassName: kata-qemu`,
  `nodeSelector: kata-enabled`, `tolerations: sandbox=true`, **and
  `automountServiceAccountToken: false`**. There is no "isolation off" switch.
- The generic `ai-agent` type *does* expose an `isolationTier` param
  (`runc`/`gvisor`/`kata`) — **but `runc` is still a sandbox**: it goes through
  SandboxClaim and still sets `automountServiceAccountToken: false`. So a runc
  agent has **no SA token** and isn't a "plain deployment" — it won't reproduce
  the regular side of the demo contrast.
- Stripping only the Kata fields from the sandbox CCT leaves
  SandboxTemplate/SandboxClaim + `automountServiceAccountToken: false` in place —
  still a sandbox pod, still no token.

**Therefore:** the baseline is a normal `apps/v1 Deployment` (like the base
`service`/`worker` types), with the SA token auto-mounted (default), plus your
git-clone init container. That gives the regular side its shared host kernel,
mounted SA token, and reachable internal services — the exact contrast.

## Scaffold — derive from your claude-with-repo CCT

Keep your claude-with-repo type's **parameters, envVars, and scaffolder wiring
unchanged**. The only structural changes: emit a **Deployment** instead of
SandboxTemplate/SandboxClaim, drop the Kata scheduling, and **do not** set
`automountServiceAccountToken: false`.

```yaml
apiVersion: openchoreo.dev/v1alpha1
kind: ClusterComponentType
metadata:
  name: ai-agent-claude-repo-unsandboxed
  annotations:
    openchoreo.dev/display-name: "AI Agent — Claude (Repo, unsandboxed baseline)"
    openchoreo.dev/description: "Demo baseline: the Claude-with-Repo workload as a plain container (no Kata)."
spec:
  workloadType: deployment
  # allowedWorkflows / parameters (model, gitRepoUrl, gitRef, gitToken) /
  # environmentConfigs: copy verbatim from your claude-with-repo CCT.
  resources:
    - id: deployment
      targetPlane: dataplane
      template:
        apiVersion: apps/v1
        kind: Deployment
        metadata:
          name: ${metadata.name}
          namespace: ${metadata.namespace}
          labels: ${metadata.labels}
        spec:
          replicas: 1
          selector:
            matchLabels: ${metadata.podSelectors}
          template:
            metadata:
              labels: ${metadata.podSelectors}
            spec:
              # NO runtimeClassName, NO kata nodeSelector/toleration -> regular node
              # NO automountServiceAccountToken: false -> SA token IS mounted (the contrast)
              initContainers:
                - name: git-clone
                  image: ${workload.container.image}
                  command: ["/bin/sh", "-c"]
                  env: ${dependencies.toContainerEnvs()}    # carries GIT_REPO_URL/GIT_REF/GIT_TOKEN
                  args:
                    - |
                      set -e
                      BRANCH=""
                      [ -n "$GIT_REF" ] && BRANCH="--branch $GIT_REF"
                      rm -rf /workspace/repo
                      git -c credential.helper='!f() { echo username=x-access-token;
                        echo "password=$GIT_TOKEN"; }; f' \
                        clone --depth 1 $BRANCH "$GIT_REPO_URL" /workspace/repo
                  volumeMounts:
                    - { name: workspace, mountPath: /workspace }
              containers:
                - name: main
                  image: ${workload.container.image}
                  imagePullPolicy: ${environmentConfigs.imagePullPolicy}
                  workingDir: /workspace/repo
                  command: ["sleep", "infinity"]           # match your sandboxed type
                  env: ${dependencies.toContainerEnvs()}
                  envFrom: ${configurations.toContainerEnvFrom()}
                  resources:
                    requests:
                      cpu: ${environmentConfigs.resources.requests.cpu}
                      memory: ${environmentConfigs.resources.requests.memory}
                    limits:
                      cpu: ${environmentConfigs.resources.limits.cpu}
                      memory: ${environmentConfigs.resources.limits.memory}
                  volumeMounts:
                    - { name: workspace, mountPath: /workspace }
              volumes:
                - name: workspace
                  emptyDir: {}
```

Notes:
- Bare `$VAR` in the init-container script (not `${...}`) — the template engine
  substitutes `${...}` and would blank the shell vars.
- `env: ${dependencies.toContainerEnvs()}` must be on the **init** container too,
  or `$GIT_REPO_URL`/`$GIT_TOKEN` won't be set during the clone.
- If your claude-with-repo type also merges config/secret volumes, mirror those
  `volumes:`/`volumeMounts:` expressions alongside the `workspace` emptyDir.

## Register + verify

```bash
kubectl get clustercomponenttype | grep ai-agent      # both types listed
```

Create `agent-regular` from this type and `agent-sandbox` from your
claude-with-repo type. The Phase 6 gate (`uname -r` differing, SA token
present-vs-absent) confirms the split is real.

---

_Still to fully verify: your exact hand-authored **claude-with-repo** CCT — I
validated against the shipped `ai-agent-claude`/`ai-agent`/`service` CCTs and the
blog fragments, not your file. Point me at it (repo path) and I'll diff this
scaffold against it field-by-field._
