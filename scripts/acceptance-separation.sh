#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 1. web sources not under ccb
if find ccb -name 'ChatPanel.tsx' -o -name 'ConfirmBanner.tsx' 2>/dev/null | grep -q .; then
  echo "FAIL: web UI still under ccb"
  exit 1
fi
test -f apps/web/src/App.tsx
test -f apps/control/src/index.ts
test -f packages/onion/src/runtime.ts
test -f packages/protocol/src/index.ts
test -f ccb/src/harness/mcpOnionBridge.ts
test ! -d ccb/harness

# 2. unit tests
bun test packages/onion packages/protocol apps/control
bun test --cwd ccb src/harness/__tests__/mcpOnionBridge.test.ts

echo "PASS: separation layout + unit tests"
