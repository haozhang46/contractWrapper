#!/usr/bin/env bun
/**
 * Start Control + Web for local harness-console.
 * Chat: Web → Control /api/chat → CcbSlot → CCB stdioBridge (spawned by Control).
 * Onion: CCB → Control HTTP /api/agent/onion (always mounted; no HARNESS_MCP=1 required).
 * Optional HARNESS_MCP=1 on Control adds legacy MCP stdio for external clients.
 *
 * Default Control port: 3100. If taken (e.g. Mystery Town), use:
 *   npm run dev:3101
 * or CONTROL_PORT=3101 npm run dev
 */
import { checkControlHealth } from './controlHealth.ts'

const controlPort = process.env.CONTROL_PORT ?? '3100'
const CONTROL_URL = `http://127.0.0.1:${controlPort}`
const HEALTH_INTERVAL_MS = 5_000
/** Failures in a row before we shout (avoids noise during cold start / --watch reload). */
const HEALTH_FAIL_THRESHOLD = 3

const childEnv = {
  ...process.env,
  CONTROL_PORT: controlPort,
}

async function portLooksLikeForeignService(port: string): Promise<string | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(800),
    })
    const text = await res.text()
    try {
      const body = JSON.parse(text) as { ok?: unknown }
      if (body?.ok === true) return null // our Control already up
    } catch {
      const preview = text.replace(/\s+/g, ' ').slice(0, 60)
      return preview || '(non-JSON response)'
    }
    return null
  } catch {
    return null // nothing listening — fine to bind
  }
}

if (!process.env.CONTROL_PORT) {
  const foreign = await portLooksLikeForeignService('3100')
  if (foreign) {
    console.error(`[dev] port 3100 is already in use by another service: ${foreign}`)
    console.error('[dev] Start with:  npm run dev:3101')
    console.error('[dev] Or:          CONTROL_PORT=3101 npm run dev')
    process.exit(1)
  }
}

console.error(`[dev] Control → ${CONTROL_URL}  |  Web → http://127.0.0.1:8080 (proxy /api → :${controlPort})`)

const control = Bun.spawn(['bun', 'run', 'control:dev'], {
  cwd: import.meta.dir + '/..',
  env: childEnv,
  stdout: 'inherit',
  stderr: 'inherit',
  stdin: 'inherit',
})

const web = Bun.spawn(['bun', 'run', 'web:dev'], {
  cwd: import.meta.dir + '/..',
  env: childEnv,
  stdout: 'inherit',
  stderr: 'inherit',
  stdin: 'inherit',
})

let healthFails = 0
let healthReportedDown = false

const healthTimer = setInterval(() => {
  void (async () => {
    const result = await checkControlHealth(CONTROL_URL)
    if (result.ok) {
      if (healthReportedDown) {
        console.error(`[dev] control health recovered (${CONTROL_URL})`)
      }
      healthFails = 0
      healthReportedDown = false
      return
    }
    healthFails += 1
    if (healthFails >= HEALTH_FAIL_THRESHOLD && !healthReportedDown) {
      healthReportedDown = true
      console.error(
        `[dev] control health FAILED (${CONTROL_URL}/api/health): ${result.error}`,
      )
      console.error(
        '[dev] Vite /api proxy will fail until Control listens. Check .harness/control.log',
      )
      if (controlPort === '3100') {
        console.error('[dev] If 3100 is occupied, use: npm run dev:3101')
      }
    }
  })()
}, HEALTH_INTERVAL_MS)
healthTimer.unref()

const stop = () => {
  clearInterval(healthTimer)
  control.kill()
  web.kill()
  process.exit(0)
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

await Promise.race([control.exited, web.exited])
stop()
