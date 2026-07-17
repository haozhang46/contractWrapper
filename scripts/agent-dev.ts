console.log(`
agent-dev: process-separation local dev (legacy two-process)

Prefer: bun run dev
  Control (:3100) + Web (:5173) together; Chat → /api/chat → CcbSlot → CCB stdioBridge.

Manual split (optional / debugging):

1. Start Control (HTTP always includes /api/agent/onion; MCP stdio optional for external clients):
   bun run control:dev
   # optional legacy MCP stdio server:
   HARNESS_MCP=1 bun run control:dev

2. Start CCB standalone (not needed when Chat uses Control-spawned stdioBridge):
   HARNESS_ONION_MCP=1 HARNESS_CONTROL_MCP=stdio bun run --cwd ccb dev

Chat path: Web → Control /api/chat → CcbSlot → stdio JSONL → ccb-runner.
Onion path: CCB → Control HTTP /api/agent/onion/* (same handlers as MCP onion.*).
Fail-closed: with HARNESS_ONION_MCP=1, tools are denied until Control is reachable.
`)
