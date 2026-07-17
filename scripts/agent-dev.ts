console.log(`
agent-dev: start Control with MCP:
  HARNESS_MCP=1 bun run control:dev
Then run CCB with:
  HARNESS_ONION_MCP=1 bun run --cwd ccb dev
Fail-closed: if Control MCP client not set, tools are denied.

Register the Control MCP client before tool use:
  import { setControlMcpClient } from './src/harness/mcpOnionBridge.js'
  setControlMcpClient(yourMcpBridgeClient)
Requires HARNESS_CONTROL_MCP=stdio when registering a stdio client.
`)
