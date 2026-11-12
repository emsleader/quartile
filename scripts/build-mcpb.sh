#!/bin/sh
# Build Quartile.mcpb, the one-click Claude Desktop extension.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd); OUT=$(mktemp -d)
mkdir -p "$OUT/server/mcp"; cp -r "$ROOT/core" "$OUT/server/"
cp "$ROOT/mcp/server.js" "$ROOT/mcp/corpus.js" "$ROOT/mcp/widget.html" "$ROOT/mcp/package.json" "$ROOT/mcp/package-lock.json" "$OUT/server/mcp/"
mkdir -p "$OUT/server/data"; cp "$ROOT"/data/*.json "$ROOT/data/README.md" "$OUT/server/data/" 2>/dev/null || true
(cd "$OUT/server/mcp" && npm ci --omit=dev)
cp "$ROOT/bundle/manifest.json" "$ROOT/bundle/icon.png" "$OUT/"
npx -y @anthropic-ai/mcpb@2.1.2 pack "$OUT" "$ROOT/Quartile.mcpb"
