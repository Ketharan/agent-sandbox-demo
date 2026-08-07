# Authoring the unsandboxed agent ClusterComponentType

For the demo, `agent-regular` and `agent-sandbox` must be the **same workload** —
same Claude-with-Repo workspace, same agent CLI, same repo clone — differing
**only** in isolation. There is no "isolation = none" switch on the sandboxed
type: it always expands to a Kata microVM. So the baseline needs its own
ClusterComponentType — an unsandboxed twin of the sandboxed Claude-with-Repo CCT.

## Recipe: derive it from the sandboxed CCT

Start from your existing sandboxed Claude-with-Repo CCT (`ai-agent-claude` /
the claude-with-repo type) and produce a new one, e.g.
**`ai-agent-claude-unsandboxed`**.

**Keep** (this is what makes the demo identical on both sides):
- the `git-clone` **init container** (clones the repo into `/workspace/repo`);
- the `workspace` **emptyDir** volume, mounted at `/workspace` in both containers;
- the **main agent container** with `workingDir: /workspace/repo` and the agent CLI;
- the **envVars** (`ANTHROPIC_MODEL`, `GIT_REPO_URL`, `GIT_REF`, `GIT_TOKEN`);
- `targetPlane: dataplane`.

**Remove** (this is what makes it a plain container on a normal node):
- the **SandboxClaim / sandbox expansion** — it deploys as an ordinary workload;
- `runtimeClassName: kata-qemu`;
- the **Kata node scheduling** — `nodeSelector: kata-enabled=true` and the
  `sandbox=true:NoSchedule` toleration. Without them it lands on the regular
  Auto Mode nodes, not the hardware-accelerated pool.

Register it under a distinct name and make sure your component-type → node-pool
mapping does **not** send it to the accelerated pool.

## The workload fragment to keep (from the Claude-with-Repo type)

```yaml
initContainers:
  - name: git-clone
    image: ${workload.container.image}
    command: ["/bin/sh", "-c"]
    args:
      - |
        set -e
        BRANCH=""
        [ -n "$GIT_REF" ] && BRANCH="--branch $GIT_REF"
        rm -rf /workspace/repo
        git -c credential.helper='!f() { echo username=x-access-token;
          echo "password=$GIT_TOKEN"; }; f' \
          clone --depth 1 $BRANCH "$GIT_REPO_URL" /workspace/repo
volumes:
  - name: workspace
    emptyDir: {}
# main agent container: mount `workspace` at /workspace, workingDir /workspace/repo
envVars:
  - { key: ANTHROPIC_MODEL, value: "${{ parameters.model }}" }
  - { key: GIT_REPO_URL,    value: "${{ parameters.gitRepoUrl }}" }
  - { key: GIT_REF,         value: "${{ parameters.gitRef }}" }
  - { key: GIT_TOKEN,       value: "${{ secrets.gitToken | default('x-no-token', true) }}" }
```

> Note the bare `$VAR` in the init-container script (not `${...}`): the template
> engine would otherwise substitute `${...}` and blank the shell variables.

## Verify after registering

```bash
kubectl get clustercomponenttype | grep ai-agent      # both types should list
```

Then create `agent-regular` from the unsandboxed type and `agent-sandbox` from
the sandboxed type (RUNBOOK Phase 4/5). The Phase 6 gate (`uname -r` differing)
confirms only one of them landed on Kata — which is the whole point.
