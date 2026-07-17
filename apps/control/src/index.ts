import { createApp } from './http/app.ts'
import { initHarnessDir } from './bootstrap/init.ts'

const workspaceRoot = process.cwd()
const port = Number(process.env.CONTROL_PORT ?? 3100)

initHarnessDir(workspaceRoot)

const app = createApp({ workspaceRoot })

console.log(`[control] listening on http://localhost:${port}`)

export default {
  port,
  fetch: app.fetch,
}
