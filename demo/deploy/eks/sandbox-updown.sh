#!/usr/bin/env bash
# Spin the SANDBOXED agent (and its c6g.metal bare-metal node) up for a recording
# session, then tear it down after — the ~$2.18/hr charge only applies while the
# sandbox exists. Usage:  sandbox-updown.sh up | down | status
set -euo pipefail

: "${AWS_PROFILE:=Admin-Access-447777059444}"
: "${AWS_REGION:=us-east-1}"
export AWS_PROFILE AWS_REGION
NS="${NS:-dp-default-default-development-f8e58905}"
HERE="$(cd "$(dirname "$0")" && pwd)"

kata_desired() {
  aws autoscaling describe-auto-scaling-groups --region "$AWS_REGION" \
    --query "AutoScalingGroups[?contains(AutoScalingGroupName,'kata')].DesiredCapacity" --output text 2>/dev/null
}

case "${1:-status}" in
  up)
    echo ">> deploying agent-sandbox (boots the c6g.metal — ~2-3 min cold start)"
    kubectl apply -f "$HERE/agent-sandbox.component.yaml"
    echo ">> waiting for the kata node + pod..."
    for i in $(seq 1 40); do
      node=$(kubectl get nodes -l kata-enabled=true --no-headers 2>/dev/null | grep -c Ready || true)
      pod=$(kubectl get pods -n "$NS" 2>/dev/null | grep -E 'agent-sandbox.*Running' | wc -l | tr -d ' ')
      echo "   [$i] kata nodes ready=$node  sandbox pod running=$pod"
      [ "$pod" = "1" ] && { echo ">> sandbox is up."; break; }
      sleep 15
    done
    kubectl get pods -n "$NS" | grep -E 'agent-sandbox' || true
    ;;
  down)
    echo ">> deleting agent-sandbox → releases the SandboxClaim; node scales to 0 (~10 min)"
    kubectl delete component agent-sandbox -n default --ignore-not-found
    echo ">> kata ASG desired capacity now: $(kata_desired)  (target: 0)"
    ;;
  status)
    echo "kata ASG desired : $(kata_desired)"
    echo "kata nodes       :"; kubectl get nodes -l kata-enabled=true 2>/dev/null || true
    echo "sandbox pod      :"; kubectl get pods -n "$NS" 2>/dev/null | grep -E 'NAME|agent-sandbox' || echo "  none"
    ;;
  *) echo "usage: $0 up|down|status"; exit 1;;
esac
