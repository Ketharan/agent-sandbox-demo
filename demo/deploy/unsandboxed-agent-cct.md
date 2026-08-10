# Authoring the unsandboxed baseline ClusterComponentType

For the demo, `agent-regular` and `agent-sandbox` must be the **same workload**
(same repo-cloned workspace + agent CLI), differing only in isolation. The
scaffold below is **verified against your actual `ai-agent-claude-repo` CCT**
(community-modules, branch `add-ai-agent-claude-repo-template`): it's that CCT
re-expressed as a plain Deployment instead of a Kata sandbox.

## Why a separate type (not an isolation toggle)

Verified against the shipped CCTs:
- `ai-agent-claude-repo` deploys via **SandboxTemplate + SandboxClaim** with a
  hardcoded `runtimeClassName: kata-qemu`, `nodeSelector: kata-enabled`,
  `tolerations: sandbox=true`, **and `automountServiceAccountToken: false`**.
  No "isolation off" switch.
- The generic `ai-agent` type's `isolationTier: runc` is **still a sandbox**
  (SandboxClaim + no SA token) — not a plain deployment.
- Stripping only the Kata fields still leaves SandboxClaim + no SA token.

So the baseline is a normal `apps/v1 Deployment` (SA token auto-mounted), with the
**same git-clone init container** grafted in. That gives the regular side its
shared host kernel, mounted SA token, and reachable internal services.

## What the diff changed vs. my first scaffold

Diffing against the real CCT caught three things my first draft got wrong:
1. **`envFrom` was missing on the git-clone init container.** `GIT_REPO_URL` /
   `GIT_REF` / `GIT_TOKEN` arrive via `configurations.toContainerEnvFrom()`, not
   `dependencies.toContainerEnvs()`. Without `envFrom`, the clone has no URL/token.
2. **The `env-config` (ConfigMap) and `secret-env-external` (ExternalSecret)
   resources were missing.** Those are what actually deliver `ANTHROPIC_MODEL`,
   `GIT_REPO_URL`, `GIT_REF`, `ANTHROPIC_API_KEY`, `GIT_TOKEN` into the pod.
3. **No `parameters:` block.** The real CCT has none — values come from the
   scaffolder template writing component config/secrets, surfaced via
   `configurations`. Dropped my invented parameters block.

## Scaffold (corrected — mirrors `ai-agent-claude-repo`)

Only three edits vs. the real CCT: `workloadType: proxy → deployment`;
`SandboxTemplate`+`SandboxClaim` → one `apps/v1 Deployment`; and dropping
`automountServiceAccountToken: false` + the Kata scheduling. Everything else —
init container, env wiring, volumes, the two config/secret resources — is copied.

```yaml
apiVersion: openchoreo.dev/v1alpha1
kind: ClusterComponentType
metadata:
  name: ai-agent-claude-repo-unsandboxed
  annotations:
    openchoreo.dev/display-name: "AI Agent — Claude Code (with repo, unsandboxed baseline)"
    openchoreo.dev/description: "Demo baseline: the claude-with-repo workload as a plain container (no Kata, SA token mounted)."
    # Adapt the same scaffolder template, pointed at THIS type name:
    scaffolder.openchoreo.dev/backstage-template-url: "https://raw.githubusercontent.com/<you>/community-modules/<ref>/agent-sandbox/templates/create-ai-agent-claude-repo-unsandboxed.yaml"
spec:
  workloadType: deployment                      # was: proxy

  environmentConfigs:                           # copied verbatim (cpu 500m / mem 1Gi defaults)
    openAPIV3Schema:
      type: object
      $defs:
        ResourceQuantity:
          type: object
          default: {}
          properties:
            cpu:    { type: string, default: "500m" }
            memory: { type: string, default: "1Gi" }
        ResourceRequirements:
          type: object
          properties:
            requests: { $ref: "#/$defs/ResourceQuantity" }
            limits:   { $ref: "#/$defs/ResourceQuantity" }
          default: {}
      properties:
        resources: { $ref: "#/$defs/ResourceRequirements" }
        imagePullPolicy:
          type: string
          default: IfNotPresent
          enum: [Always, IfNotPresent, Never]

  resources:
    # ── Deployment (replaces SandboxTemplate + SandboxClaim) ─────────────
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
              # NO runtimeClassName / kata nodeSelector / toleration -> regular node
              # NO automountServiceAccountToken: false -> SA token IS mounted (the contrast)
              initContainers:
                - name: git-clone
                  image: ${workload.container.image}
                  imagePullPolicy: ${environmentConfigs.imagePullPolicy}
                  command: ["/bin/sh", "-c"]
                  args:
                    - |
                      set -e
                      BRANCH=""
                      [ -n "$GIT_REF" ] && BRANCH="--branch $GIT_REF"
                      rm -rf /workspace/repo
                      git -c credential.helper='!f() { echo username=x-access-token; echo "password=$GIT_TOKEN"; }; f' \
                        clone --depth 1 $BRANCH "$GIT_REPO_URL" /workspace/repo
                      echo "Repository ready at /workspace/repo"
                  env: ${dependencies.toContainerEnvs()}
                  envFrom: ${configurations.toContainerEnvFrom()}   # <-- delivers GIT_REPO_URL/GIT_REF/GIT_TOKEN
                  volumeMounts:
                    - { name: workspace, mountPath: /workspace }
              containers:
                - name: main
                  image: ${workload.container.image}
                  imagePullPolicy: ${environmentConfigs.imagePullPolicy}
                  command: ["sleep", "infinity"]
                  workingDir: /workspace/repo
                  resources:
                    requests:
                      cpu: ${environmentConfigs.resources.requests.cpu}
                      memory: ${environmentConfigs.resources.requests.memory}
                    limits:
                      cpu: ${environmentConfigs.resources.limits.cpu}
                      memory: ${environmentConfigs.resources.limits.memory}
                  env: ${dependencies.toContainerEnvs()}
                  envFrom: ${configurations.toContainerEnvFrom()}
                  volumeMounts:
                    - { name: workspace, mountPath: /workspace }
              volumes:
                - name: workspace
                  emptyDir: {}

    # ── ConfigMap: ANTHROPIC_MODEL, GIT_REPO_URL, GIT_REF (copied verbatim) ─
    - id: env-config
      forEach: ${configurations.toConfigEnvsByContainer()}
      var: envConfig
      template:
        apiVersion: v1
        kind: ConfigMap
        metadata:
          name: ${envConfig.resourceName}
          namespace: ${metadata.namespace}
        data: |
          ${envConfig.envs.transformMapEntry(index, env, {env.name: env.value})}

    # ── ExternalSecret: ANTHROPIC_API_KEY, GIT_TOKEN (copied verbatim) ────
    - id: secret-env-external
      forEach: ${configurations.toSecretEnvsByContainer()}
      var: secretEnv
      template:
        apiVersion: external-secrets.io/v1
        kind: ExternalSecret
        metadata:
          name: ${secretEnv.resourceName}
          namespace: ${metadata.namespace}
        spec:
          refreshInterval: 15s
          secretStoreRef:
            name: ${dataplane.secretStore}
            kind: ClusterSecretStore
          target:
            name: ${secretEnv.resourceName}
            creationPolicy: Owner
          data: |
            ${secretEnv.envs.map(secret, {
              "secretKey": secret.name,
              "remoteRef": {
                "key": secret.remoteRef.key,
                ?"property": secret.remoteRef.?property
              }
            })}
```

## Also needed: a scaffolder template for the baseline

The real type pairs with `create-ai-agent-claude-repo.yaml` (the Backstage
scaffolder form that writes the config/secret envs). The baseline needs the same
form pointed at the unsandboxed type — copy that template, change the component
type it creates to `ai-agent-claude-repo-unsandboxed`, and set the
`backstage-template-url` annotation above to wherever you host the copy. The
form's `gitRepoUrl`/`gitRef`/`gitToken`/`model` fields are unchanged.

## Register + verify

Applyable manifest: [`ai-agent-claude-repo-unsandboxed.yaml`](ai-agent-claude-repo-unsandboxed.yaml).
Working instance: [`example-agent-regular-component.yaml`](example-agent-regular-component.yaml).

```bash
kubectl apply -f demo/deploy/ai-agent-claude-repo-unsandboxed.yaml
kubectl apply -f demo/deploy/example-agent-regular-component.yaml
kubectl get clustercomponenttype | grep ai-agent      # both types listed
```

**Verified on k3d** (2026-08): pod `1/1 Running`, git-clone populated
`/workspace/repo`, SA token PRESENT, host kernel, no runtimeClass. Two gotchas
found doing it:
- The Component references the type as **`deployment/ai-agent-claude-repo-unsandboxed`**
  (`<workloadType>/<name>`), not the bare name.
- The `500m/1Gi` defaults may not fit a loaded single-node cluster — lower them
  locally if the pod stays `Pending` on `Insufficient cpu`.
- In `docker/sandbox-templates:claude-code`, only `git` was confirmed on `PATH`;
  verify `node`/`claude` locations before relying on them in the demo.

Then `agent-sandbox` from `ai-agent-claude-repo` (needs Kata/bare-metal — won't
run on k3d). Phase 6 gate (`uname -r` differing, SA token present-vs-absent,
internal reachable-vs-not) confirms the split is real.
