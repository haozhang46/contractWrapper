import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** Append a line to workspace `.harness/control.log` (best-effort). */
export function controlLog(workspaceRoot: string, ...args: unknown[]): void {
  try {
    const dir = join(workspaceRoot, '.harness')
    mkdirSync(dir, { recursive: true })
    const line = `[${new Date().toISOString()}] ${args
      .map(a => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ')}\n`
    appendFileSync(join(dir, 'control.log'), line)
  } catch {
    // best-effort
  }
}
