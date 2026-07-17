import { serve } from 'bun'
import { createApp } from './http/app.ts'
import { initHarnessDir } from './bootstrap/init.ts'
import { loadOnion } from './bootstrap/loadOnion.ts'
import { startControlMcpServer } from './mcp/server.ts'
import { onionRuntime } from './onionSingleton.ts'
import { pendingStore } from './pendingSingleton.ts'

const workspaceRoot = process.env.HARNESS_WORKSPACE ?? process.cwd()
const enableMcp =
  process.argv.includes('--mcp') || process.env.HARNESS_MCP === '1'

initHarnessDir(workspaceRoot)
loadOnion(workspaceRoot)

const port = Number(process.env.CONTROL_PORT ?? 3100)
const app = createApp({ workspaceRoot })

serve({
  port,
  fetch: app.fetch,
})

console.log(`[control] HTTP :${port} workspace=${workspaceRoot}`)

if (enableMcp) {
  void startControlMcpServer({
    workspaceRoot,
    onionRuntime,
    pendingStore,
  })
}
