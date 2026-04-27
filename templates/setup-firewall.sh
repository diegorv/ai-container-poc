#!/usr/bin/env bash
# Activates an iptables OUTPUT allowlist. Idempotent: flushes existing
# OUTPUT/INPUT rules before re-applying.
#
# Invoked twice:
#   1. The devcontainer's `postStartCommand` runs this on every
#      container start with no arguments, so a fresh container with
#      a workspace-side allowlist still gets some firewall protection.
#   2. The host's `mydevc up` / `rebuild` re-runs it after host-side
#      validation, passing /etc/mydevc/firewall-allowlist.txt — that
#      file is root-owned and was placed there by the host CLI from a
#      sanitized snapshot (so the contents went through TS validation
#      and are not influenceable from inside the container).
#
# Allowlist resolution (first match wins):
#   - explicit $1                    (host-driven, validated)
#   - /etc/mydevc/firewall-allowlist.txt  (host-driven, validated)
#   - /workspace/.devcontainer/firewall-allowlist.txt  (legacy fallback)
#
# Requires NET_ADMIN (set in templates/devcontainer.json) and passwordless
# sudo (vscode user in the Microsoft devcontainers base).

set -euo pipefail

VALIDATED_ALLOWLIST="/etc/mydevc/firewall-allowlist.txt"
LEGACY_ALLOWLIST="/workspace/.devcontainer/firewall-allowlist.txt"

if [[ -n "${1:-}" ]]; then
  ALLOWLIST="$1"
elif [[ -f "$VALIDATED_ALLOWLIST" ]]; then
  ALLOWLIST="$VALIDATED_ALLOWLIST"
else
  ALLOWLIST="$LEGACY_ALLOWLIST"
fi

if [[ ! -f "$ALLOWLIST" ]]; then
  exit 0
fi

if ! command -v iptables >/dev/null 2>&1; then
  echo "[mydevc-firewall] iptables not installed; skipping." >&2
  exit 0
fi

# IPv4: default DROP egress, allow loopback / DNS / allowlisted hosts.
iptables -F OUTPUT
iptables -F INPUT
iptables -P OUTPUT DROP
iptables -P INPUT ACCEPT

iptables -A OUTPUT -o lo -j ACCEPT
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Restrict DNS to whatever Docker injected into /etc/resolv.conf.
# Without this restriction, port 53 is wide open and any process could
# tunnel arbitrary data to a chosen resolver (DNS exfiltration).
RESOLVERS=$(awk '/^nameserver[[:space:]]+/ { print $2 }' /etc/resolv.conf | sort -u)
if [[ -z "$RESOLVERS" ]]; then
  # Fallback: Cloudflare + Google when the container has no resolv.conf.
  RESOLVERS=$'1.1.1.1\n8.8.8.8'
fi
for resolver in $RESOLVERS; do
  case "$resolver" in
    *:*) ;;  # IPv6 — handled in the ip6tables loop below.
    *)
      iptables -A OUTPUT -p udp --dport 53 -d "$resolver" -j ACCEPT
      iptables -A OUTPUT -p tcp --dport 53 -d "$resolver" -j ACCEPT
      ;;
  esac
done

# IPv6: same posture. Without these, `curl -6 evil.com` would bypass the
# IPv4 rules entirely on hosts where IPv6 is enabled.
HAS_IP6=0
if command -v ip6tables >/dev/null 2>&1; then
  HAS_IP6=1
  ip6tables -F OUTPUT
  ip6tables -F INPUT
  ip6tables -P OUTPUT DROP
  ip6tables -P INPUT ACCEPT

  ip6tables -A OUTPUT -o lo -j ACCEPT
  ip6tables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

  for resolver in $RESOLVERS; do
    case "$resolver" in
      *:*)
        ip6tables -A OUTPUT -p udp --dport 53 -d "$resolver" -j ACCEPT
        ip6tables -A OUTPUT -p tcp --dport 53 -d "$resolver" -j ACCEPT
        ;;
    esac
  done
else
  echo "[mydevc-firewall] ip6tables not installed; IPv6 traffic is unrestricted." >&2
fi

count=0
ip6_count=0
# Defence in depth: even when the host pre-validates, refuse to pass
# anything that isn't a hostname / IP literal / CIDR to iptables. The
# class is intentionally narrow (no spaces, no shell metacharacters).
SAFE_TOKEN_RE='^[A-Za-z0-9_.:/-]+$'
while IFS= read -r raw; do
  # Strip comments and surrounding whitespace.
  line="${raw%%#*}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [[ -z "$line" ]] && continue
  if ! [[ "$line" =~ $SAFE_TOKEN_RE ]]; then
    echo "[mydevc-firewall] Refusing line with disallowed characters: $line" >&2
    exit 2
  fi
  if iptables -A OUTPUT -d "$line" -j ACCEPT 2>/dev/null; then
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
      if ip6tables -A OUTPUT -d "$addr" -j ACCEPT 2>/dev/null; then
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
