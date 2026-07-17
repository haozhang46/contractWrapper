console.log(`
agent-dev: process-separation local dev

1. Start Control (MCP server):
   HARNESS_MCP=1 bun run control:dev

2. Start CCB (agent):
   HARNESS_ONION_MCP=1 HARNESS_CONTROL_MCP=stdio bun run --cwd ccb dev

Fail-closed: with HARNESS_ONION_MCP=1, tools are denied until Control is reachable.

MCP client registration (required until auto-stdio connect lands):
  Unit tests and local wiring call setControlMcpClient() before tool use.
  import { setControlMcpClient } from './src/harness/mcpOnionBridge.js'
  setControlMcpClient({ callTool: (name, args) => mcpClient.callTool({ name, arguments: args }) })
  HARNESS_CONTROL_MCP=stdio must be set when using a registered stdio client.
`)
