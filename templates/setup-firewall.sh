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

# IPv4: default DROP egress, allow loopback / DNS / allowlisted hosts.
sudo iptables -F OUTPUT
sudo iptables -F INPUT
sudo iptables -P OUTPUT DROP
sudo iptables -P INPUT ACCEPT

sudo iptables -A OUTPUT -o lo -j ACCEPT
sudo iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

sudo iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
sudo iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# IPv6: same posture. Without these, `curl -6 evil.com` would bypass the
# IPv4 rules entirely on hosts where IPv6 is enabled.
HAS_IP6=0
if command -v ip6tables >/dev/null 2>&1; then
  HAS_IP6=1
  sudo ip6tables -F OUTPUT
  sudo ip6tables -F INPUT
  sudo ip6tables -P OUTPUT DROP
  sudo ip6tables -P INPUT ACCEPT

  sudo ip6tables -A OUTPUT -o lo -j ACCEPT
  sudo ip6tables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

  sudo ip6tables -A OUTPUT -p udp --dport 53 -j ACCEPT
  sudo ip6tables -A OUTPUT -p tcp --dport 53 -j ACCEPT
else
  echo "[mydevc-firewall] ip6tables not installed; IPv6 traffic is unrestricted." >&2
fi

count=0
ip6_count=0
while IFS= read -r raw; do
  # Strip comments and surrounding whitespace.
  line="${raw%%#*}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [[ -z "$line" ]] && continue
  if sudo iptables -A OUTPUT -d "$line" -j ACCEPT 2>/dev/null; then
    count=$((count + 1))
  else
    echo "[mydevc-firewall] Failed to add IPv4 rule for '$line' (DNS resolution?)" >&2
  fi

  if [[ "$HAS_IP6" -eq 1 ]]; then
    # Resolve AAAA records once, add a rule per address. `getent ahostsv6`
    # returns one canonical row per address, plus localhost duplicates we
    # filter out.
    while IFS= read -r addr; do
      [[ -z "$addr" || "$addr" == "::1" ]] && continue
      if sudo ip6tables -A OUTPUT -d "$addr" -j ACCEPT 2>/dev/null; then
        ip6_count=$((ip6_count + 1))
      fi
    done < <(getent ahostsv6 "$line" 2>/dev/null | awk '{print $1}' | sort -u)
  fi
done <"$ALLOWLIST"

if [[ "$HAS_IP6" -eq 1 ]]; then
  echo "[mydevc-firewall] Active with $count IPv4 + $ip6_count IPv6 destinations + loopback + DNS."
else
  echo "[mydevc-firewall] Active with $count IPv4 destinations + loopback + DNS (IPv6 unrestricted)."
fi
