import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export type HeadlessSettings = {
  /**
   * When true, any onion `ask` is auto-allowed (no Confirm UI / wait_resolve),
   * including Bash / WebSearch at L2. Deny is never bypassed.
   */
  autoAllow: boolean
  /**
   * Persisted for UI / env compatibility. Not consulted by onion authorize;
   * autoAllow alone covers all ask decisions.
   */
  unsafeMode: boolean
}

const DEFAULT: HeadlessSettings = { autoAllow: false, unsafeMode: false }

function headlessPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.harness', 'headless.json')
}

export function loadHeadlessSettings(workspaceRoot: string): HeadlessSettings {
  // Nuclear headless: HARNESS_AUTO_ALLOW / HEADLESS enable both toggles (authorize uses autoAllow only)
  if (
    process.env.HARNESS_AUTO_ALLOW === '1' ||
    process.env.HARNESS_HEADLESS === '1'
  ) {
    return { autoAllow: true, unsafeMode: true }
  }

  const path = headlessPath(workspaceRoot)
  if (!existsSync(path)) return { ...DEFAULT }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<HeadlessSettings>
    return {
      autoAllow: Boolean(raw.autoAllow),
      unsafeMode: Boolean(raw.unsafeMode),
    }
  } catch {
    return { ...DEFAULT }
  }
}

export function saveHeadlessSettings(
  workspaceRoot: string,
  settings: HeadlessSettings,
): HeadlessSettings {
  const dir = join(workspaceRoot, '.harness')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const next: HeadlessSettings = {
    autoAllow: Boolean(settings.autoAllow),
    unsafeMode: Boolean(settings.unsafeMode),
  }
  writeFileSync(headlessPath(workspaceRoot), JSON.stringify(next, null, 2), 'utf-8')
  return next
}
