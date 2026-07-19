import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export type HeadlessSettings = {
  /**
   * When true, onion `ask` for non-L3 tools is auto-allowed
   * (no Confirm UI / wait_resolve). L3 still requires confirm unless unsafeMode.
   */
  autoAllow: boolean
  /**
   * Unsafe mode: together with autoAllow, L3 `ask` is also auto-allowed.
   * Without this, L3 always needs explicit user confirmation.
   */
  unsafeMode: boolean
}

const DEFAULT: HeadlessSettings = { autoAllow: false, unsafeMode: false }

function headlessPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.harness', 'headless.json')
}

export function loadHeadlessSettings(workspaceRoot: string): HeadlessSettings {
  // Nuclear headless: preserve prior HARNESS_AUTO_ALLOW / HEADLESS = full pass (incl. L3)
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
