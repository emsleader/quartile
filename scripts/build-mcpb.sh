#!/bin/sh
# Build Quartile.mcpb, the one-click Claude Desktop extension.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd); OUT=$(mktemp -d)
mkdir -p "$OUT/server/mcp" "$OUT/server/data"
cp -r "$ROOT/core" "$OUT/server/"
[ -d "$ROOT/rulebook" ] && cp -r "$ROOT/rulebook" "$OUT/server/"
[ -d "$ROOT/tools" ] && cp -r "$ROOT/tools" "$OUT/server/"
cp "$ROOT/mcp/server.js" "$ROOT/mcp/corpus.js" "$ROOT/mcp/widget.html" "$OUT/server/mcp/"
cp "$ROOT/package.json" "$ROOT/package-lock.json" "$OUT/server/"
cp "$ROOT"/data/*.json "$ROOT/data/README.md" "$OUT/server/data/" 2>/dev/null || true
(cd "$OUT/server" && npm ci --omit=dev)
cp "$ROOT/bundle/manifest.json" "$ROOT/bundle/icon.png" "$OUT/"
npx -y @anthropic-ai/mcpb@2.1.2 pack "$OUT" "$ROOT/Quartile.mcpb"
