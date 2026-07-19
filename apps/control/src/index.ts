import { serve } from 'bun'
import { createApp } from './http/app.ts'
import { controlLog } from './bootstrap/controlLog.ts'
import { initHarnessDir } from './bootstrap/init.ts'
import { discoverAndRegisterHeadlessMcp } from './bootstrap/discoverHeadlessMcp.ts'
import { installProcessErrorHandlers } from './bootstrap/installProcessErrorHandlers.ts'
import { loadOnion } from './bootstrap/loadOnion.ts'
import { resolveWorkspaceRoot } from './bootstrap/resolveWorkspaceRoot.ts'
import { startControlMcpServer } from './mcp/server.ts'
import { onionRuntime } from './onionSingleton.ts'
import { pendingStore } from './pendingSingleton.ts'

const workspaceRoot = resolveWorkspaceRoot()
const enableMcp =
  process.argv.includes('--mcp') || process.env.HARNESS_MCP === '1'

installProcessErrorHandlers(workspaceRoot)
initHarnessDir(workspaceRoot)
loadOnion(workspaceRoot)
discoverAndRegisterHeadlessMcp(workspaceRoot)

const port = Number(process.env.CONTROL_PORT ?? 3100)
const app = createApp({ workspaceRoot })

serve({
  port,
  fetch: app.fetch,
  // Chat SSE + onion wait_resolve can idle >10s while tools run / wait for Allow.
  // Default Bun idleTimeout (10s) aborts the request and leaves the UI "Waiting…".
  idleTimeout: 0,
  error(error) {
    controlLog(workspaceRoot, 'serve.error', error.message, error.stack ?? '')
    console.error('[control] serve error', error)
    return new Response('Internal Server Error', { status: 500 })
  },
})

controlLog(workspaceRoot, `listening :${port}`)
console.log(`[control] HTTP :${port} workspace=${workspaceRoot}`)

if (enableMcp) {
  void startControlMcpServer({
    workspaceRoot,
    onionRuntime,
    pendingStore,
  })
}
