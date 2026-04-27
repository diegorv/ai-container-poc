#!/usr/bin/env bash
# Activates an iptables OUTPUT allowlist when
# /workspace/.devcontainer/firewall-allowlist.txt is present. Idempotent:
# flushes existing OUTPUT/INPUT rules before re-applying.
#
# Invoked by the devcontainer's `postStartCommand` so the firewall is
# (re)applied on every container start, not just the first one.
#
# Requires NET_ADMIN (set in templates/devcontainer.json) and passwordless
# sudo (vscode user in the Microsoft devcontainers base).

set -euo pipefail

ALLOWLIST="${1:-/workspace/.devcontainer/firewall-allowlist.txt}"

if [[ ! -f "$ALLOWLIST" ]]; then
  exit 0
fi

if ! command -v iptables >/dev/null 2>&1; then
  echo "[mydevc-firewall] iptables not installed; skipping." >&2
  exit 0
fi

sudo iptables -F OUTPUT
sudo iptables -F INPUT
sudo iptables -P OUTPUT DROP
sudo iptables -P INPUT ACCEPT

# Always allow loopback and return traffic.
sudo iptables -A OUTPUT -o lo -j ACCEPT
sudo iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow DNS so allowlist hostnames resolve and apps can lookup.
sudo iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
sudo iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

count=0
while IFS= read -r raw; do
  # Strip comments and surrounding whitespace.
  line="${raw%%#*}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [[ -z "$line" ]] && continue
  if sudo iptables -A OUTPUT -d "$line" -j ACCEPT 2>/dev/null; then
    count=$((count + 1))
  else
    echo "[mydevc-firewall] Failed to add rule for '$line' (DNS resolution?)" >&2
  fi
done <"$ALLOWLIST"

echo "[mydevc-firewall] Active with $count allowed destinations + loopback + DNS."
