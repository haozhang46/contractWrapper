#!/usr/bin/env bun
/**
 * Start Control (:3100) + Web (:5173) for local harness-console.
 * Chat: Web → Control /api/chat → CcbSlot → CCB stdioBridge (spawned by Control).
 * Onion: CCB → Control HTTP /api/agent/onion (always mounted; no HARNESS_MCP=1 required).
 * Optional HARNESS_MCP=1 on Control adds legacy MCP stdio for external clients.
 */
import { checkControlHealth } from './controlHealth.ts'

const CONTROL_URL = `http://127.0.0.1:${process.env.CONTROL_PORT ?? 3100}`
const HEALTH_INTERVAL_MS = 5_000
/** Failures in a row before we shout (avoids noise during cold start / --watch reload). */
const HEALTH_FAIL_THRESHOLD = 3

const control = Bun.spawn(['bun', 'run', 'control:dev'], {
  cwd: import.meta.dir + '/..',
  stdout: 'inherit',
  stderr: 'inherit',
  stdin: 'inherit',
})

const web = Bun.spawn(['bun', 'run', 'web:dev'], {
  cwd: import.meta.dir + '/..',
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
        '[dev] Vite /api proxy will ECONNREFUSED until Control listens again. Check .harness/control.log',
      )
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
