#!/usr/bin/env bun
/**
 * Start Control (:3100) + Web (:5173) for local harness-console.
 * Chat: Web → Control /api/chat → CcbSlot → CCB stdioBridge (spawned by Control).
 * Onion: CCB → Control HTTP /api/agent/onion (always mounted; no HARNESS_MCP=1 required).
 * Optional HARNESS_MCP=1 on Control adds legacy MCP stdio for external clients.
 */
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

const stop = () => {
  control.kill()
  web.kill()
  process.exit(0)
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

await Promise.race([control.exited, web.exited])
stop()
