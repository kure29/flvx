#!/bin/sh
# Runs the agent from the data volume so the panel's one-click upgrade
# survives restarts. A newly pulled image (different version) puts its own
# binary back in place.
set -e

DATA_DIR=/etc/flux_agent
BIN="$DATA_DIR/flux_agent"
MARK="$DATA_DIR/.image_version"

mkdir -p "$DATA_DIR"
cd "$DATA_DIR"

if [ ! -x "$BIN" ] || [ "$(cat "$MARK" 2>/dev/null)" != "$FLUX_AGENT_IMAGE_VERSION" ]; then
  cp /usr/local/bin/flux_agent "$BIN.new"
  chmod 755 "$BIN.new"
  mv "$BIN.new" "$BIN"
  echo "$FLUX_AGENT_IMAGE_VERSION" > "$MARK"
fi

[ -f gost.json ] || echo '{}' > gost.json
chmod 600 gost.json

exec "$BIN" "$@"
