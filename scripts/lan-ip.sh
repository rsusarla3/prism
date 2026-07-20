#!/usr/bin/env bash
# Print the LAN-reachable IP for the Prism host (en0 Wi-Fi by default).
# Usage: scripts/lan-ip.sh [iface]
# After switching to an ad-hoc network (e.g. PrismNet) or a hotspot, run this
# and share http://<IP>:8787 with teammates.
set -e
IFACE="${1:-en0}"
IP=$(ipconfig getifaddr "$IFACE" 2>/dev/null || true)
if [ -z "$IP" ]; then
  echo "No IP on $IFACE. Is the interface connected? (try: ifconfig -l)" >&2
  exit 1
fi
echo "$IP"
echo "Share: http://$IP:8787" >&2
